jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/email', () => ({ enviarEmail: jest.fn(async () => {}) }));

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
const { enviarEmail } = require('../utils/email');
const { criarNotificacao } = require('../utils/notificacoes');
const { montarApp, tokenDe, linhas } = require('./helpers');

const appUsuario = montarApp(require('../routes/usuario'));
const appPagamentos = montarApp(require('../routes/pagamentos'));

const COMPRADOR = 1;
const VENDEDOR = 2;
const ESTRANHO = 9;
const DAQUI_A_UM_ANO = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

// Espera as tarefas em segundo plano (o e-mail da notificação)
const esperarSegundoPlano = () => new Promise((r) => setImmediate(r));

// Notificações gravadas no banco durante o teste: [usuario_id, tipo, titulo, mensagem, link]
const notificacoesGravadas = () => pool.query.mock.calls
  .filter(([sql]) => /INSERT INTO notificacoes/.test(sql))
  .map(([, params]) => params);

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
});

/* ─────────────────────────────────────────────────────────── */
describe('RF17 - Histórico de Transações', () => {
  const buscar = (rota, query = {}, usuario = COMPRADOR) => {
    pool.query.mockResolvedValueOnce(linhas({ id: 7 }));
    return request(appUsuario).get(rota).query(query).set('Authorization', tokenDe(usuario));
  };

  test('lista as compras do usuário logado', async () => {
    const res = await buscar('/api/usuario/compras');
    expect(res.body.compras).toHaveLength(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE co\.comprador_id = \$1/);
    expect(params).toEqual([COMPRADOR]);
  });

  test('filtra compras por um ou mais status', async () => {
    await buscar('/api/usuario/compras', { status: 'approved,refunded' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/co\.status = ANY\(\$2::text\[\]\)/);
    expect(params[1]).toEqual(['approved', 'refunded']);
  });

  test('filtra compras por período, incluindo o último dia inteiro', async () => {
    await buscar('/api/usuario/compras', { data_inicio: '2026-10-01', data_fim: '2026-10-31' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/co\.criada_em >= \$2/);
    expect(sql).toMatch(/co\.criada_em < \(\$3::date \+ INTERVAL '1 day'\)/);
    expect(params.slice(1)).toEqual(['2026-10-01', '2026-10-31']);
  });

  test('o histórico de compras nunca traz o código de entrega', async () => {
    await buscar('/api/usuario/compras');
    expect(pool.query.mock.calls[0][0]).not.toMatch(/co\.codigo_entrega/);
  });

  test('lista as vendas do usuário logado com os mesmos filtros', async () => {
    await buscar('/api/usuario/vendas', { status: 'approved', data_inicio: '2026-10-01', data_fim: '2026-10-31' }, VENDEDOR);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE co\.vendedor_id = \$1/);
    expect(params.slice(0, 4)).toEqual([VENDEDOR, ['approved'], '2026-10-01', '2026-10-31']);
  });

  test('nas vendas, o valor líquido desconta a taxa de 5%', async () => {
    await buscar('/api/usuario/vendas', {}, VENDEDOR);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/co\.preco \* \(1 - \$2::numeric \/ 100\)/);
    expect(params[1]).toBe(5);
  });

  test('nas vendas, o código de entrega some depois da entrega confirmada', async () => {
    await buscar('/api/usuario/vendas', {}, VENDEDOR);
    expect(pool.query.mock.calls[0][0]).toMatch(/CASE WHEN co\.entrega_confirmada_em IS NULL THEN co\.codigo_entrega END/);
  });

  test('histórico exige login', async () => {
    expect((await request(appUsuario).get('/api/usuario/compras')).status).toBe(401);
  });

  // ── Comprovante em PDF ──
  const compra = {
    id: 7, preco: '800.00', status: 'approved', metodo_pagamento: 'visa', parcelas: 3, payment_id: 'pay-1',
    criada_em: '2026-10-20T15:00:00Z', comprador_id: COMPRADOR, vendedor_id: VENDEDOR,
    anuncio_titulo: 'Bicicleta aro 29', categoria_nome: 'Esportes',
    comprador_nome: 'Ana', comprador_sobrenome: 'Lima', vendedor_nome: 'Caio', vendedor_sobrenome: 'Souza',
  };
  const baixar = (usuario) => request(appPagamentos).get('/api/compras/7/comprovante')
    .set('Authorization', tokenDe(usuario)).buffer(true)
    .parse((res, cb) => { const partes = []; res.on('data', (p) => partes.push(p)); res.on('end', () => cb(null, Buffer.concat(partes))); });

  test.each([['comprador', COMPRADOR], ['vendedor', VENDEDOR]])('o %s baixa o comprovante em PDF', async (_papel, usuario) => {
    pool.query.mockResolvedValueOnce(linhas(compra));
    const res = await baixar(usuario);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/comprovante-santo-desapego-7\.pdf/);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('quem não participou da compra não baixa o comprovante', async () => {
    pool.query.mockResolvedValueOnce(linhas(compra));
    expect((await baixar(ESTRANHO)).status).toBe(403);
  });

  test('comprovante de compra inexistente retorna 404', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    expect((await baixar(COMPRADOR)).status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF18 - Notificações ao Usuário', () => {
  test('a notificação é gravada no site (in-app) e enviada por e-mail', async () => {
    pool.query.mockImplementation(async (sql) => (/FROM usuarios/.test(sql) ? linhas({ nome: 'Ana', email: 'ana@teste.com' }) : linhas()));

    await criarNotificacao(COMPRADOR, 'avaliacao_pendente', 'Avalie o vendedor', 'Conte como foi.', '/perfil?aba=compras');
    await esperarSegundoPlano();

    expect(notificacoesGravadas()).toEqual([[COMPRADOR, 'avaliacao_pendente', 'Avalie o vendedor', 'Conte como foi.', '/perfil?aba=compras']]);
    const [para, assunto, html] = enviarEmail.mock.calls[0];
    expect(para).toBe('ana@teste.com');
    expect(assunto).toBe('Avalie o vendedor');
    expect(html).toMatch(/Avaliar o vendedor/);
    expect(html).toMatch(/\/perfil\?aba=compras/);
  });

  test('se o e-mail falhar, a notificação no site continua gravada', async () => {
    pool.query.mockImplementation(async (sql) => (/FROM usuarios/.test(sql) ? linhas({ nome: 'Ana', email: 'ana@teste.com' }) : linhas()));
    enviarEmail.mockRejectedValueOnce(new Error('SMTP fora'));

    await expect(criarNotificacao(COMPRADOR, 'nova_mensagem', 'Oi', 'Mensagem', '/mensagens')).resolves.toBeUndefined();
    await esperarSegundoPlano();
    expect(notificacoesGravadas()).toHaveLength(1);
  });

  test('o sino lista as notificações e quantas não foram lidas', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 1, lida: false }, { id: 2, lida: true }))
      .mockResolvedValueOnce(linhas({ count: '1' }));
    const res = await request(appUsuario).get('/api/notificacoes').set('Authorization', tokenDe(COMPRADOR));

    expect(res.body.total_nao_lidas).toBe(1);
    expect(res.body.notificacoes).toHaveLength(2);
    expect(pool.query.mock.calls[0][1]).toEqual([COMPRADOR]);
  });

  test('marca todas as notificações como lidas', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appUsuario).put('/api/notificacoes/lidas-todas').set('Authorization', tokenDe(COMPRADOR));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0]).toEqual([expect.stringMatching(/SET lida = TRUE WHERE usuario_id = \$1/), [COMPRADOR]]);
  });

  test('marca uma notificação como lida', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 5 }));
    const res = await request(appUsuario).put('/api/notificacoes/5/lida').set('Authorization', tokenDe(COMPRADOR));
    expect(res.status).toBe(200);
  });

  test('não marca como lida a notificação de outro usuário', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appUsuario).put('/api/notificacoes/5/lida').set('Authorization', tokenDe(ESTRANHO));
    expect(res.status).toBe(404);
    expect(pool.query.mock.calls[0][0]).toMatch(/AND usuario_id = \$2/);
  });

  // ── Eventos que geram notificação ──
  const anuncio = {
    id: 10, titulo: 'Bicicleta aro 29', preco: '100.00', status: 'ativo', vendedor_id: VENDEDOR,
    categoria_nome: 'Esportes', mp_conectado: true, mp_access_token: 'tok', mp_refresh_token: 'ref',
    mp_token_expira_em: DAQUI_A_UM_ANO,
  };

  test('intenção de compra notifica o vendedor', async () => {
    mockPreferenceCreate.mockResolvedValue({ id: 'pref-1', init_point: 'https://mp' });
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio);
      if (/FROM usuarios/.test(sql)) return linhas({ nome: 'Ana', sobrenome: 'Lima', email: 'a@t.com' });
      return linhas();
    });

    await request(appPagamentos).post('/api/pagamentos/preferencia')
      .set('Authorization', tokenDe(COMPRADOR)).send({ anuncio_id: 10 });

    expect(notificacoesGravadas()).toContainEqual([VENDEDOR, 'intencao_compra', expect.any(String), expect.stringContaining('Ana'), '/perfil?aba=anuncios']);
  });

  test('pagamento confirmado notifica comprador e vendedor', async () => {
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio);
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: true, codigo_entrega: '482913' });
      if (/FROM usuarios/.test(sql)) return linhas({ nome: 'Ana', email: 'a@t.com' });
      return linhas();
    });

    await request(appPagamentos).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-1', anuncio_id: 10 });

    const tipos = notificacoesGravadas().map(([usuario, tipo]) => [usuario, tipo]);
    expect(tipos).toEqual(expect.arrayContaining([[VENDEDOR, 'pagamento_confirmado'], [COMPRADOR, 'pagamento_confirmado']]));
  });

  test('confirmar a mesma compra de novo não duplica as notificações', async () => {
    mockPaymentGet.mockResolvedValue({ status: 'approved', external_reference: '10' });
    pool.query.mockImplementation(async (sql) => {
      if (/FROM anuncios a/.test(sql)) return linhas(anuncio);
      if (/INSERT INTO compras/.test(sql)) return linhas({ id: 7, inserida: false, codigo_entrega: '482913' });
      return linhas();
    });

    await request(appPagamentos).post('/api/compras/confirmar')
      .set('Authorization', tokenDe(COMPRADOR)).send({ payment_id: 'pay-1', anuncio_id: 10 });

    expect(notificacoesGravadas()).toHaveLength(0);
  });

  test('entrega confirmada pede ao comprador para avaliar o vendedor', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (/FROM compras co/.test(sql)) {
          return linhas({ vendedor_id: VENDEDOR, comprador_id: COMPRADOR, codigo_entrega: '482913',
            entrega_confirmada_em: null, tentativas_codigo: 0, preco: '100.00', titulo: 'Bicicleta' });
        }
        return linhas({ id: 7 });
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValue(linhas());

    await request(appPagamentos).post('/api/compras/7/confirmar-entrega')
      .set('Authorization', tokenDe(COMPRADOR)).send({ codigo: '482913' });

    expect(notificacoesGravadas()).toContainEqual([COMPRADOR, 'avaliacao_pendente', expect.any(String), expect.any(String), '/perfil?aba=compras']);
  });
});
