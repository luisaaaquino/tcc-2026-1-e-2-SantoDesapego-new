// Requisitos funcionais que até aqui só apareciam testados pelas regras de
// negócio: RF01 (cadastro), RF14 (pagamento), RF16 (reputação),
// RF19 (denúncia pelo anúncio) e RF23 (código de entrega).
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/email', () => ({ enviarEmail: jest.fn() }));
jest.mock('../utils/notificacoes', () => ({ criarNotificacao: jest.fn() }));
jest.mock('../utils/verificacao', () => ({
  criarDesafio: jest.fn(async () => ({ desafio: 'abc', email_mascarado: 'an***@teste.com', finalidade: 'cadastro' })),
  verificarCodigo: jest.fn(),
  reenviarCodigo: jest.fn(),
}));

// Mercado Pago simulado
const mockPreferenceCreate = jest.fn();
const mockPaymentGet = jest.fn();
const mockOAuth = { getAuthorizationURL: jest.fn(), create: jest.fn(), refresh: jest.fn() };
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(function MercadoPagoConfig(opcoes) { this.opcoes = opcoes; }),
  OAuth: jest.fn(() => mockOAuth),
  Preference: jest.fn((config) => ({ create: (args) => mockPreferenceCreate(args, config) })),
  Payment: jest.fn(() => ({ get: mockPaymentGet })),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../db');
const { garantirTokenVendedorValido } = require('../services/mercadoPagoService');
const { validarDadosAnuncio } = require('../services/anuncioService');
const { montarApp, tokenDe, linhas } = require('./helpers');

const appAuth = montarApp(require('../routes/auth'));
const appPagamentos = montarApp(require('../routes/pagamentos'));
const appMp = montarApp(require('../routes/mercadoPago'));
const appAvaliacoes = montarApp(require('../routes/avaliacoes'));
const appUsuario = montarApp(require('../routes/usuario'));

const COMPRADOR = 1;
const VENDEDOR = 2;
const DAQUI_A_UM_ANO = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

const anuncio = (extra = {}) => ({
  id: 10, titulo: 'Bicicleta aro 29', preco: '800.00', status: 'ativo', vendedor_id: VENDEDOR,
  categoria_nome: 'Esportes', mp_conectado: true, mp_access_token: 'token-do-vendedor',
  mp_refresh_token: 'refresh', mp_token_expira_em: DAQUI_A_UM_ANO, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  mockPreferenceCreate.mockResolvedValue({ id: 'pref-1', init_point: 'https://mercadopago/checkout' });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF01 - Gestão de Perfil Geográfico', () => {
  const cadastro = (extra = {}) => ({
    nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com', senha: 'Desapego@2026', cpf: '52998224725',
    cep: '04710-150', logradouro: 'Rua Padre José', numero: '10', bairro: 'Santo Amaro Centro', aceita_termos: true,
    ...extra,
  });
  const cadastrar = (dados) => {
    pool.query.mockResolvedValue(linhas({ id: 1, nome: 'Ana', email: 'ana@teste.com' }));
    return request(appAuth).post('/api/auth/cadastro').send(dados);
  };
  const insert = () => pool.query.mock.calls.find(([sql]) => /INSERT INTO usuarios/.test(sql));

  test('cadastra comprador/vendedor com CPF, CEP e endereço de Santo Amaro', async () => {
    const res = await cadastrar(cadastro());
    expect(res.status).toBe(201);
    const params = insert()[1];
    expect(params).toEqual(expect.arrayContaining(['04710-150', 'Rua Padre José', 'Santo Amaro Centro', '52998224725']));
  });

  test('cadastro aceita CEP de outra região (a restrição vale só para anunciar)', async () => {
    const res = await cadastrar(cadastro({ cep: '01310-100', bairro: 'Bela Vista' }));
    expect(res.status).toBe(201);
  });

  test('quem mora fora da área se cadastra, mas só anuncia com CEP de Santo Amaro e região', async () => {
    pool.query.mockResolvedValue(linhas({ id: 3 }));
    const erro = await validarDadosAnuncio({
      titulo: 'Bicicleta aro 29', descricao: 'Bicicleta em bom estado, pouco usada.', preco: 800,
      estado_conservacao: 'usado', categoria_id: 3, cep: '01310-100', imagens: ['data:image/png;base64,AA'],
    });
    expect(erro).toMatch(/Santo Amaro/);
  });

  test('cadastro com CPF inválido é recusado', async () => {
    const res = await cadastrar(cadastro({ cpf: '12345678900' }));
    expect(res.status).toBe(400);
  });

  test('CPF ou e-mail já cadastrado é recusado', async () => {
    pool.query.mockRejectedValueOnce(Object.assign(new Error('duplicado'), { code: '23505' }));
    const res = await request(appAuth).post('/api/auth/cadastro').send(cadastro());
    expect(res.status).toBe(409);
  });

  test('e-mail é gravado em minúsculas e sem espaços', async () => {
    await cadastrar(cadastro({ email: '  Ana@Teste.COM ' }));
    expect(insert()[1][3]).toBe('ana@teste.com');
  });

  test('nome, sobrenome, CPF, e-mail e senha são obrigatórios', async () => {
    for (const campo of ['nome', 'sobrenome', 'cpf', 'email', 'senha']) {
      const res = await cadastrar(cadastro({ [campo]: '' }));
      expect(res.status).toBe(400);
    }
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF14 - Integração com Gateway de Pagamento', () => {
  const comprar = () => request(appPagamentos).post('/api/pagamentos/preferencia')
    .set('Authorization', tokenDe(COMPRADOR)).send({ anuncio_id: 10 });
  const corpoDaPreferencia = () => mockPreferenceCreate.mock.calls[0][0].body;

  beforeEach(() => {
    pool.query.mockImplementation(async (sql) => (/FROM anuncios a/.test(sql)
      ? linhas(anuncio()) : linhas({ nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com' })));
  });

  test('o pagamento abre na página externa do Mercado Pago', async () => {
    const res = await comprar();
    expect(res.body).toEqual({ preference_id: 'pref-1', init_point: 'https://mercadopago/checkout' });
  });

  test('o pagamento é só por cartão (sem Pix, boleto ou lotérica), em até 12x', async () => {
    await comprar();
    const { payment_methods } = corpoDaPreferencia();
    expect(payment_methods.excluded_payment_types.map((t) => t.id)).toEqual(['ticket', 'bank_transfer', 'atm']);
    expect(payment_methods.installments).toBe(12);
  });

  test('o valor vai direto para a conta do vendedor (preferência criada com a conta dele)', async () => {
    await comprar();
    const config = mockPreferenceCreate.mock.calls[0][1];
    expect(config.opcoes.accessToken).toBe('token-do-vendedor');
    expect(corpoDaPreferencia().marketplace_fee).toBe(40); // 5% de R$ 800 fica com a plataforma
  });

  test('o preço cobrado vem do banco, não do que o navegador mandou', async () => {
    await request(appPagamentos).post('/api/pagamentos/preferencia')
      .set('Authorization', tokenDe(COMPRADOR)).send({ anuncio_id: 10, preco: 1 });
    expect(corpoDaPreferencia().items[0].unit_price).toBe(800);
  });

  test('depois de pagar, o comprador volta para a plataforma', async () => {
    await comprar();
    expect(corpoDaPreferencia().back_urls.success).toMatch(/\/compra-realizada$/);
    expect(corpoDaPreferencia().external_reference).toBe('10');
  });

  test('vendedor sem conta do Mercado Pago conectada não recebe pagamento', async () => {
    pool.query.mockImplementation(async () => linhas(anuncio({ mp_conectado: false })));
    expect((await comprar()).status).toBe(400);
  });

  test('o vendedor conecta a conta do Mercado Pago pela plataforma', async () => {
    mockOAuth.getAuthorizationURL.mockReturnValue('https://auth.mercadopago/autorizar');
    const res = await request(appMp).get('/api/mp/connect').set('Authorization', tokenDe(VENDEDOR));
    expect(res.body.url).toBe('https://auth.mercadopago/autorizar');
    const { state } = mockOAuth.getAuthorizationURL.mock.calls[0][0].options;
    expect(jwt.verify(state, process.env.JWT_SECRET).id).toBe(VENDEDOR);
  });

  test('ao autorizar, a conta do vendedor fica marcada como conectada', async () => {
    mockOAuth.create.mockResolvedValue({ user_id: 555, access_token: 'a', refresh_token: 'r', public_key: 'p', expires_in: 3600 });
    pool.query.mockResolvedValue(linhas());
    const state = jwt.sign({ id: VENDEDOR }, process.env.JWT_SECRET);

    const res = await request(appMp).get('/api/mp/callback').query({ code: 'abc', state });

    expect(res.headers.location).toMatch(/\/perfil\?mp=conectado$/);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/mp_conectado = TRUE/);
    expect(params[5]).toBe(VENDEDOR);
  });

  test('autorização recusada ou forjada não conecta a conta', async () => {
    const recusada = await request(appMp).get('/api/mp/callback').query({ error: 'access_denied' });
    const forjada = await request(appMp).get('/api/mp/callback').query({ code: 'abc', state: 'falso' });
    expect(recusada.headers.location).toMatch(/mp=erro/);
    expect(forjada.headers.location).toMatch(/mp=erro/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('token do vendedor perto de vencer é renovado antes de cobrar', async () => {
    mockOAuth.refresh.mockResolvedValue({ access_token: 'novo', refresh_token: 'novo-r', expires_in: 3600 });
    pool.query.mockResolvedValue(linhas());
    const token = await garantirTokenVendedorValido({
      id: VENDEDOR, mp_conectado: true, mp_access_token: 'velho', mp_refresh_token: 'r',
      mp_token_expira_em: new Date(Date.now() + 60 * 1000).toISOString(),
    });
    expect(token).toBe('novo');
    expect(pool.query.mock.calls[0][1].slice(0, 2)).toEqual(['novo', 'novo-r']);
  });

  test('consulta o status real do pagamento no Mercado Pago', async () => {
    mockPaymentGet.mockResolvedValue({ id: 99, status: 'approved', transaction_amount: 800, payment_method_id: 'visa', installments: 3, external_reference: '10' });
    const res = await request(appPagamentos).get('/api/pagamentos/99').query({ anuncio_id: 10 });
    expect(res.body.pagamento).toMatchObject({ status: 'approved', valor: 800, metodo: 'visa', parcelas: 3 });
  });

  test('consulta de pagamento sem o anúncio é recusada', async () => {
    expect((await request(appPagamentos).get('/api/pagamentos/99')).status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF16 - Sistema de Reputação', () => {
  const avaliar = (corpo) => request(appAvaliacoes).post('/api/avaliacoes').set('Authorization', tokenDe(COMPRADOR)).send(corpo);
  const compraEntregue = () => pool.query
    .mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: new Date() }))
    .mockResolvedValueOnce(linhas())
    .mockResolvedValueOnce(linhas({ id: 1, nota: 4 }));

  test('comprador avalia o vendedor com nota de 1 a 5 e comentário', async () => {
    compraEntregue();
    const res = await avaliar({ compra_id: 7, nota: 4, comentario: '  Muito atencioso  ' });
    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[2][1]).toEqual([7, COMPRADOR, VENDEDOR, 4, 'Muito atencioso']);
  });

  test('o comentário é opcional', async () => {
    compraEntregue();
    await avaliar({ compra_id: 7, nota: 5 });
    expect(pool.query.mock.calls[2][1][4]).toBeNull();
  });

  test.each([0, 6, 'dez'])('nota %s é recusada', async (nota) => {
    expect((await avaliar({ compra_id: 7, nota })).status).toBe(400);
  });

  test('comentário com mais de 500 caracteres é recusado', async () => {
    expect((await avaliar({ compra_id: 7, nota: 5, comentario: 'a'.repeat(501) })).status).toBe(400);
  });

  test('só avalia depois de confirmar o recebimento do produto', async () => {
    pool.query.mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: null }));
    expect((await avaliar({ compra_id: 7, nota: 5 })).status).toBe(400);
  });

  test('o vendedor não avalia o comprador (só quem comprou avalia)', async () => {
    pool.query.mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: new Date() }));
    const res = await request(appAvaliacoes).post('/api/avaliacoes').set('Authorization', tokenDe(VENDEDOR)).send({ compra_id: 7, nota: 1 });
    expect(res.status).toBe(403);
  });

  test('a reputação (média e total) aparece no perfil público', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/FROM usuarios WHERE id/.test(sql)) return linhas({ id: VENDEDOR, nome: 'Caio', sobrenome: 'Souza' });
      if (/FROM avaliacoes/.test(sql)) return linhas({ media: 4.25, total: '4' });
      return linhas({ total: '0' });
    });
    const res = await request(appUsuario).get(`/api/usuarios/${VENDEDOR}/publico`);
    expect(res.body.reputacao).toEqual({ media: 4.25, total_avaliacoes: 4 });
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF19 - Denúncia de Anúncios e Usuários', () => {
  test('a denúncia feita pela página do anúncio registra o anúncio e o vendedor', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR })).mockResolvedValueOnce(linhas({ id: 1, status: 'pendente' }));
    const res = await request(appAvaliacoes).post('/api/denuncias').set('Authorization', tokenDe(COMPRADOR))
      .send({ anuncio_id: 10, motivo: 'conteudo_inadequado' });

    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[1][1].slice(0, 3)).toEqual([COMPRADOR, 10, VENDEDOR]);
    expect(res.body.mensagem).toMatch(/Nossa equipe vai analisar/);
  });

  test('o vendedor não denuncia o próprio anúncio', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR }));
    const res = await request(appAvaliacoes).post('/api/denuncias').set('Authorization', tokenDe(VENDEDOR))
      .send({ anuncio_id: 10, motivo: 'fraude' });
    expect(res.status).toBe(400);
  });

  test('a denúncia nasce pendente e aparece na fila do admin', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR })).mockResolvedValueOnce(linhas({ id: 1, status: 'pendente' }));
    const res = await request(appAvaliacoes).post('/api/denuncias').set('Authorization', tokenDe(COMPRADOR))
      .send({ anuncio_id: 10, motivo: 'fraude' });
    expect(res.body.denuncia.status).toBe('pendente');
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF23 - Confirmação de Entrega por Código', () => {
  const confirmarCompra = () => {
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio());
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: true, codigo_entrega: '482913' });
      return linhas({ nome: 'Ana' });
    });
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });
    return request(appPagamentos).post('/api/compras/confirmar').set('Authorization', tokenDe(COMPRADOR))
      .send({ payment_id: 'pay-1', anuncio_id: 10 });
  };

  test('na aprovação do pagamento é gerado um código de 6 dígitos', async () => {
    await confirmarCompra();
    const codigo = pool.query.mock.calls.find(([sql]) => /INSERT INTO compras/.test(sql))[1][8];
    expect(codigo).toMatch(/^\d{6}$/);
  });

  test('cada compra recebe um código diferente', async () => {
    const codigos = new Set();
    for (let i = 0; i < 20; i++) {
      await confirmarCompra();
      codigos.add(pool.query.mock.calls.filter(([sql]) => /INSERT INTO compras/.test(sql)).pop()[1][8]);
    }
    expect(codigos.size).toBeGreaterThan(15);
  });

  test('o código aparece para o vendedor e não para o comprador', async () => {
    const res = await confirmarCompra();
    expect(JSON.stringify(res.body)).not.toMatch(/482913|codigo_entrega/);

    pool.query.mockReset();
    pool.query.mockResolvedValueOnce(linhas());
    await request(appUsuario).get('/api/usuario/compras').set('Authorization', tokenDe(COMPRADOR));
    expect(pool.query.mock.calls[0][0]).not.toMatch(/co\.codigo_entrega/);

    pool.query.mockResolvedValueOnce(linhas());
    await request(appUsuario).get('/api/usuario/vendas').set('Authorization', tokenDe(VENDEDOR));
    expect(pool.query.mock.calls[1][0]).toMatch(/co\.codigo_entrega END AS codigo_entrega/);
  });

  test('o comprador informa o código ao receber e a entrega é registrada', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (/FROM compras co/.test(sql)) {
          return linhas({ vendedor_id: VENDEDOR, comprador_id: COMPRADOR, codigo_entrega: '482913',
            entrega_confirmada_em: null, tentativas_codigo: 0, preco: '800.00', titulo: 'Bicicleta' });
        }
        return linhas({ id: 7, entrega_confirmada_em: new Date().toISOString() });
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);

    const res = await request(appPagamentos).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482-913' });

    expect(res.status).toBe(200);
    expect(res.body.compra.entrega_confirmada_em).toBeDefined();
  });

  test('código que não tem 6 dígitos é recusado antes de consultar a compra', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    const res = await request(appPagamentos).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '123' });
    expect(res.status).toBe(400);
    expect(client.query).not.toHaveBeenCalled();
  });
});
