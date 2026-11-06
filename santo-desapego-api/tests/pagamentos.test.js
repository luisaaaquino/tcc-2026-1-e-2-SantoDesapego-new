jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/notificacoes', () => ({ criarNotificacao: jest.fn() }));

// Mercado Pago simulado: nenhuma chamada sai para a API real
const mockPreferenceCreate = jest.fn();
const mockPaymentGet = jest.fn();
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  OAuth: jest.fn(() => ({})),
  Preference: jest.fn(() => ({ create: mockPreferenceCreate })),
  Payment: jest.fn(() => ({ get: mockPaymentGet })),
}));

const request = require('supertest');
const pool = require('../db');
const { criarNotificacao } = require('../utils/notificacoes');
const { createSplitPreference, MARKETPLACE_FEE_PERCENT } = require('../services/mercadoPagoService');
const { montarApp, tokenDe, linhas } = require('./helpers');

const app = montarApp(require('../routes/pagamentos'));

const COMPRADOR = 1;
const VENDEDOR = 2;
const DAQUI_A_UM_ANO = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

const anuncio = (extra = {}) => ({
  id: 10, titulo: 'Bicicleta aro 29', preco: '100.00', status: 'ativo',
  vendedor_id: VENDEDOR, categoria_nome: 'Esportes',
  mp_conectado: true, mp_access_token: 'token-vendedor', mp_refresh_token: 'refresh',
  mp_token_expira_em: DAQUI_A_UM_ANO,
  ...extra,
});

// Cliente de transação simulado (pool.connect) para a confirmação de entrega
const clienteTransacao = (compra) => {
  const client = {
    query: jest.fn(async (sql) => {
      if (/FROM compras co/.test(sql)) return linhas(...(compra ? [compra] : []));
      if (/entrega_confirmada_em = NOW\(\)/.test(sql)) return linhas({ id: 7, entrega_confirmada_em: new Date() });
      return linhas();
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

const compraPaga = (extra = {}) => ({
  vendedor_id: VENDEDOR, comprador_id: COMPRADOR, codigo_entrega: '482913',
  entrega_confirmada_em: null, tentativas_codigo: 0, preco: '100.00', titulo: 'Bicicleta aro 29',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferenceCreate.mockResolvedValue({ id: 'pref-1', init_point: 'https://mp/checkout' });
});

describe('RN18 - Condições de Compra', () => {
  const comprar = (usuario = COMPRADOR) =>
    request(app).post('/api/pagamentos/preferencia').set('Authorization', tokenDe(usuario)).send({ anuncio_id: 10 });

  test('permite comprar anúncio ativo de vendedor com Mercado Pago conectado', async () => {
    pool.query.mockResolvedValueOnce(linhas(anuncio())).mockResolvedValueOnce(linhas({ nome: 'Ana' }));
    const res = await comprar();
    expect(res.status).toBe(200);
    expect(res.body.preference_id).toBe('pref-1');
  });

  test('bloqueia a compra de anúncio que não está ativo', async () => {
    pool.query.mockResolvedValueOnce(linhas(anuncio({ status: 'pausado' })));
    const res = await comprar();
    expect(res.status).toBe(400);
    expect(mockPreferenceCreate).not.toHaveBeenCalled();
  });

  test('bloqueia a compra de vendedor sem Mercado Pago conectado', async () => {
    pool.query.mockResolvedValueOnce(linhas(anuncio({ mp_conectado: false })));
    const res = await comprar();
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Mercado Pago/);
  });

  test('impede o usuário de comprar o próprio anúncio', async () => {
    pool.query.mockResolvedValueOnce(linhas(anuncio()));
    const res = await comprar(VENDEDOR);
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/próprio anúncio/);
  });

  test('exige usuário logado para comprar', async () => {
    const res = await request(app).post('/api/pagamentos/preferencia').send({ anuncio_id: 10 });
    expect(res.status).toBe(401);
  });
});

describe('RN06 - Taxa de Intermediação', () => {
  test('a taxa configurada da plataforma é de 5%', () => {
    expect(MARKETPLACE_FEE_PERCENT).toBe(5);
  });

  test.each([
    [100, 5],
    [800, 40],
    [250, 12.5],
  ])('produto de R$ %s gera taxa (marketplace_fee) de R$ %s', async (preco, taxa) => {
    await createSplitPreference({
      sellerAccessToken: 'token-vendedor',
      anuncio: anuncio({ preco }),
      comprador: { nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com' },
    });
    const { body } = mockPreferenceCreate.mock.calls[0][0];
    expect(body.marketplace_fee).toBeCloseTo(taxa, 2);
    expect(body.items[0].unit_price).toBe(preco);
  });

  test('o repasse liberado ao vendedor já vem descontado da taxa (R$ 100 → R$ 95)', async () => {
    clienteTransacao(compraPaga());
    await request(app).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482913' });

    const avisoVendedor = criarNotificacao.mock.calls.find((c) => c[0] === VENDEDOR);
    expect(avisoVendedor[3]).toMatch(/95,00/);
    expect(avisoVendedor[3]).toMatch(/taxa de 5%/);
  });
});

describe('RN04 - Confirmação de Pagamento via API', () => {
  const confirmar = () => request(app).post('/api/compras/confirmar')
    .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-1', anuncio_id: 10 });

  const marcouVendido = () => pool.query.mock.calls.some(([sql]) => /SET status = 'vendido'/.test(sql));

  test('anúncio muda para "vendido" quando o Mercado Pago aprova o pagamento', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: true, codigo_entrega: '482913' });
      return linhas({ nome: 'Ana' });
    });
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });

    const res = await confirmar();
    expect(res.status).toBe(201);
    expect(marcouVendido()).toBe(true);
  });

  test.each(['pending', 'rejected', 'in_process'])('anúncio continua ativo com pagamento "%s"', async (status) => {
    pool.query.mockResolvedValue(linhas(anuncio()));
    mockPaymentGet.mockResolvedValue({ status, external_reference: '10' });

    const res = await confirmar();
    expect(res.body.registrada).toBe(false);
    expect(marcouVendido()).toBe(false);
  });

  test('pagamento de outro anúncio não confirma a venda', async () => {
    pool.query.mockResolvedValue(linhas(anuncio()));
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '99' });

    const res = await confirmar();
    expect(res.status).toBe(400);
    expect(marcouVendido()).toBe(false);
  });
});

describe('RN16 - Código de Entrega', () => {
  const enviarCodigo = (codigo) => request(app).post('/api/compras/7/confirmar-entrega')
    .set('Authorization', tokenDe(COMPRADOR)).send({ codigo });

  test('o código de entrega não é devolvido ao comprador na confirmação da compra', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: true, codigo_entrega: '482913' });
      return linhas({ nome: 'Ana' });
    });
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });

    const res = await request(app).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-1', anuncio_id: 10 });

    expect(JSON.stringify(res.body)).not.toMatch(/482913/);
    const avisoVendedor = criarNotificacao.mock.calls.find((c) => c[0] === VENDEDOR);
    expect(avisoVendedor[3]).toMatch(/482913/);
  });

  test('código errado gasta uma tentativa e informa quantas restam', async () => {
    const client = clienteTransacao(compraPaga({ tentativas_codigo: 0 }));
    const res = await enviarCodigo('000000');
    expect(res.status).toBe(400);
    expect(res.body.tentativas_restantes).toBe(4);
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/tentativas_codigo = \$1/), [1, '7']);
  });

  test('a quinta tentativa errada bloqueia a confirmação', async () => {
    clienteTransacao(compraPaga({ tentativas_codigo: 4 }));
    const res = await enviarCodigo('000000');
    expect(res.body.bloqueada).toBe(true);
    expect(res.body.erro).toMatch(/suporte/);
  });

  test('depois de 5 tentativas nem o código certo é aceito', async () => {
    clienteTransacao(compraPaga({ tentativas_codigo: 5 }));
    const res = await enviarCodigo('482913');
    expect(res.status).toBe(423);
    expect(res.body.erro).toMatch(/suporte/);
  });

  test('só o comprador pode digitar o código', async () => {
    clienteTransacao(compraPaga({ comprador_id: 99 }));
    const res = await enviarCodigo('482913');
    expect(res.status).toBe(403);
  });
});

describe('RN05 - Garantia de Recebimento (Escrow)', () => {
  test('código certo confirma a entrega e libera o valor ao vendedor', async () => {
    const client = clienteTransacao(compraPaga());
    const res = await request(app).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482913' });

    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/liberado ao vendedor/);
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/entrega_confirmada_em = NOW\(\)/), ['7']);
  });

  test('pagamento aprovado fica retido: comprador é avisado para confirmar o recebimento', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: true, codigo_entrega: '482913' });
      return linhas({ nome: 'Ana' });
    });
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });

    await request(app).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-1', anuncio_id: 10 });

    const avisoComprador = criarNotificacao.mock.calls.find((c) => c[0] === COMPRADOR);
    expect(avisoComprador[3]).toMatch(/retido até você confirmar o recebimento/);
  });

  test('entrega já confirmada não pode ser confirmada de novo', async () => {
    clienteTransacao(compraPaga({ entrega_confirmada_em: new Date() }));
    const res = await request(app).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482913' });
    expect(res.status).toBe(409);
  });
});
