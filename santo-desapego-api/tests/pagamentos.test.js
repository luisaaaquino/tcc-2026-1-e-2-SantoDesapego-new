jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/notificacoes', () => ({ criarNotificacao: jest.fn() }));

// Mercado Pago simulado: nenhuma chamada sai para a API real
const mockPreferenceCreate = jest.fn();
const mockPaymentGet = jest.fn();
const mockRefundCreate = jest.fn();
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  OAuth: jest.fn(() => ({})),
  Preference: jest.fn(() => ({ create: mockPreferenceCreate })),
  Payment: jest.fn(() => ({ get: mockPaymentGet })),
  PaymentRefund: jest.fn(() => ({ create: mockRefundCreate })),
}));

const request = require('supertest');
const pool = require('../db');
const { criarNotificacao } = require('../utils/notificacoes');
const { createSplitPreference, MARKETPLACE_FEE_PERCENT } = require('../services/mercadoPagoService');
const { montarApp, tokenDe, linhas, transacaoNoPool } = require('./helpers');

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
  entrega_confirmada_em: null, tentativas_codigo: 0, preco: '100.00', titulo: 'Bicicleta aro 29', status: 'approved',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect.mockImplementation(async () => transacaoNoPool(pool));
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
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, status, codigo_entrega: null });
      return linhas();
    });
    mockPaymentGet.mockResolvedValue({ status, external_reference: '10' });

    const res = await confirmar();
    // [RF17] O pagamento entra no histórico com o próprio status, sem vender o anúncio
    expect(res.body.registrada).toBe(true);
    expect(res.body.aprovada).toBe(false);
    expect(res.body.status).toBe(status);
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

describe('RNF09 - Dois compradores no mesmo item', () => {
  const confirmar = (usuario = COMPRADOR, paymentId = 'pay-2') => request(app).post('/api/compras/confirmar')
    .set('Authorization', tokenDe(usuario)).send({ payment_id: paymentId, anuncio_id: 10 });

  const statusGravado = () => pool.query.mock.calls.find(([sql]) => /INSERT INTO compras/.test(sql))[1][5];

  beforeEach(() => {
    mockRefundCreate.mockResolvedValue({ id: 'refund-1' });
    pool.query.mockImplementation(async (sql, params) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 8, status: params[5], codigo_entrega: params[8] });
      return linhas({ nome: 'Bia' });
    });
    mockPaymentGet.mockResolvedValue({ id: 'pay-2', status: 'approved', external_reference: '10' });
  });

  test('a confirmação trava o anúncio (FOR UPDATE) dentro de uma transação', async () => {
    const client = transacaoNoPool(pool);
    pool.connect.mockResolvedValue(client);
    await confirmar();
    const sqls = client.query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toMatch(/FROM anuncios WHERE id = \$1 FOR UPDATE/);
    expect(sqls).toContain('COMMIT');
  });

  test('segundo pagamento aprovado de item já vendido é reembolsado e não vira compra', async () => {
    pool.connect.mockImplementation(async () => transacaoNoPool(pool, { anuncioStatus: 'vendido' }));
    const res = await confirmar();

    expect(res.status).toBe(409);
    expect(res.body.conflito).toBe(true);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_id: 'pay-2' });
    expect(statusGravado()).toBe('refunded');
    expect(pool.query.mock.calls.some(([sql]) => /SET status = 'vendido'/.test(sql))).toBe(false);
  });

  test('o segundo comprador é avisado de que a peça já tinha sido vendida', async () => {
    pool.connect.mockImplementation(async () => transacaoNoPool(pool, { anuncioStatus: 'vendido' }));
    await confirmar();
    const aviso = criarNotificacao.mock.calls.find((c) => c[0] === COMPRADOR);
    expect(aviso[2]).toMatch(/já tinha sido vendida/);
    expect(aviso[3]).toMatch(/reembolsado/);
    // O vendedor não recebe um segundo "sua peça foi vendida"
    expect(criarNotificacao.mock.calls.some((c) => c[0] === VENDEDOR)).toBe(false);
  });

  test('se o reembolso falhar, fica marcado como pendente para o suporte', async () => {
    pool.connect.mockImplementation(async () => transacaoNoPool(pool, { anuncioStatus: 'vendido' }));
    mockRefundCreate.mockRejectedValue(new Error('MP fora do ar'));
    await confirmar();
    expect(statusGravado()).toBe('reembolso_pendente');
  });

  test('outra conta não confirma um pagamento que não fez', async () => {
    mockPaymentGet.mockResolvedValue({ id: 'pay-2', status: 'approved', external_reference: '10', metadata: { comprador_id: 3 } });
    const res = await confirmar(COMPRADOR);
    expect(res.status).toBe(403);
  });

  test('a preferência leva o comprador e o endereço do aviso automático', async () => {
    const antes = process.env.API_URL;
    process.env.API_URL = 'https://api.santodesapego.com.br';
    await createSplitPreference({
      sellerAccessToken: 'token-vendedor', anuncio: anuncio(),
      comprador: { id: COMPRADOR, nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com' },
    });
    if (antes === undefined) delete process.env.API_URL; else process.env.API_URL = antes;
    const { body } = mockPreferenceCreate.mock.calls[0][0];
    expect(body.metadata).toEqual({ comprador_id: COMPRADOR });
    expect(body.notification_url).toBe('https://api.santodesapego.com.br/api/pagamentos/webhook?anuncio_id=10');
  });

  describe('aviso automático (webhook) do Mercado Pago', () => {
    const avisar = (corpo, anuncioId = 10) =>
      request(app).post(`/api/pagamentos/webhook?anuncio_id=${anuncioId}`).send(corpo);
    const esperarProcessar = () => new Promise((r) => setTimeout(r, 20));

    test('registra a compra mesmo sem o comprador voltar ao site', async () => {
      mockPaymentGet.mockResolvedValue({ id: 'pay-3', status: 'approved', external_reference: '10', metadata: { comprador_id: COMPRADOR } });
      const res = await avisar({ type: 'payment', data: { id: 'pay-3' } });
      await esperarProcessar();

      expect(res.status).toBe(200);
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: 'pay-3' });
      const insert = pool.query.mock.calls.find(([sql]) => /INSERT INTO compras/.test(sql));
      expect(insert[1][1]).toBe(COMPRADOR);
      expect(pool.query.mock.calls.some(([sql]) => /SET status = 'vendido'/.test(sql))).toBe(true);
    });

    test('ignora aviso que não é de pagamento', async () => {
      const res = await avisar({ type: 'merchant_order', data: { id: '1' } });
      await esperarProcessar();
      expect(res.status).toBe(200);
      expect(mockPaymentGet).not.toHaveBeenCalled();
    });

    test('ignora pagamento de outro anúncio', async () => {
      mockPaymentGet.mockResolvedValue({ id: 'pay-3', status: 'approved', external_reference: '99', metadata: { comprador_id: COMPRADOR } });
      await avisar({ type: 'payment', data: { id: 'pay-3' } });
      await esperarProcessar();
      expect(pool.query.mock.calls.some(([sql]) => /INSERT INTO compras/.test(sql))).toBe(false);
    });
  });
});

describe('RF17 - Histórico com pagamentos pendentes e recusados', () => {
  test.each(['pending', 'rejected'])('pagamento "%s" é gravado no histórico, sem código de entrega', async (status) => {
    pool.query.mockImplementation(async (sql, params) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 9, status: params[5], codigo_entrega: params[8] });
      return linhas();
    });
    mockPaymentGet.mockResolvedValue({ id: 'pay-4', status, external_reference: '10' });

    await request(app).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-4', anuncio_id: 10 });

    const insert = pool.query.mock.calls.find(([sql]) => /INSERT INTO compras/.test(sql));
    expect(insert[1][5]).toBe(status);
    expect(insert[1][8]).toBeNull();
    expect(criarNotificacao).not.toHaveBeenCalled();
  });

  test('pendente que depois é aprovado vira compra e gera o código de entrega', async () => {
    pool.connect.mockImplementation(async () => transacaoNoPool(pool, { compraExistente: { id: 9, status: 'pending' } }));
    pool.query.mockImplementation(async (sql, params) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 9, status: params[5], codigo_entrega: params[8] });
      return linhas({ nome: 'Ana' });
    });
    mockPaymentGet.mockResolvedValue({ id: 'pay-4', status: 'approved', external_reference: '10' });

    await request(app).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-4', anuncio_id: 10 });

    const insert = pool.query.mock.calls.find(([sql]) => /INSERT INTO compras/.test(sql));
    expect(insert[1][8]).toMatch(/^\d{6}$/);
    expect(pool.query.mock.calls.some(([sql]) => /SET status = 'vendido'/.test(sql))).toBe(true);
    expect(criarNotificacao.mock.calls.some((c) => c[0] === VENDEDOR)).toBe(true);
  });

  test('não dá para confirmar a entrega de um pagamento que não foi aprovado', async () => {
    clienteTransacao(compraPaga({ status: 'pending' }));
    const res = await request(app).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482913' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/aprovado/);
  });
});
