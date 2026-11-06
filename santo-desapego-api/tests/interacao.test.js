jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/notificacoes', () => ({ criarNotificacao: jest.fn() }));
// Cliente da IA real (só os helpers de schema são usados), sem chamar o modelo
jest.mock('../services/llmClient', () => ({
  ...jest.requireActual('../services/llmClient'),
  chamadaEstruturada: jest.fn(),
}));

const request = require('supertest');
const pool = require('../db');
const { avariaDaConversa, aplicarEdicoes } = require('../services/agenteAnuncioService');
const { montarApp, tokenDe, linhas } = require('./helpers');

const COMPRADOR = 1;
const VENDEDOR = 2;

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset(); // descarta respostas simuladas que sobraram do teste anterior
});

describe('RN14 - Bloqueio de Mensagens Externas', () => {
  const app = montarApp(require('../routes/conversas'));
  const abrirConversa = (usuario) => request(app).post('/api/conversas')
    .set('Authorization', tokenDe(usuario)).send({ anuncio_id: 10 });

  test('comprador interessado abre conversa a partir de um anúncio ativo', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 10, vendedor_id: VENDEDOR, status: 'ativo' }))
      .mockResolvedValueOnce(linhas({ id: 3 }));
    const res = await abrirConversa(COMPRADOR);
    expect(res.status).toBe(201);
  });

  test('o vendedor não abre conversa no próprio anúncio', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 10, vendedor_id: VENDEDOR, status: 'ativo' }));
    const res = await abrirConversa(VENDEDOR);
    expect(res.status).toBe(400);
  });

  test('visitante sem login não abre conversa', async () => {
    const res = await request(app).post('/api/conversas').send({ anuncio_id: 10 });
    expect(res.status).toBe(401);
  });

  test.each(['pausado', 'expirado'])('não abre conversa nova em anúncio "%s"', async (status) => {
    pool.query.mockResolvedValueOnce(linhas({ id: 10, vendedor_id: VENDEDOR, status }));
    const res = await abrirConversa(COMPRADOR);
    expect(res.status).toBe(400);
    expect(pool.query.mock.calls.some(([sql]) => /INSERT INTO conversas/.test(sql))).toBe(false);
  });

  test('anúncio vendido: quem comprou ainda abre a conversa para combinar a entrega', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 10, vendedor_id: VENDEDOR, status: 'vendido' }))
      .mockResolvedValueOnce(linhas({ 1: 1 })) // tem compra deste anúncio
      .mockResolvedValueOnce(linhas({ id: 3 }));
    expect((await abrirConversa(COMPRADOR)).status).toBe(201);
  });

  test('anúncio vendido: quem não comprou não abre conversa nova', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 10, vendedor_id: VENDEDOR, status: 'vendido' }))
      .mockResolvedValueOnce(linhas());
    expect((await abrirConversa(COMPRADOR)).status).toBe(400);
  });
});

describe('RN09 - Moderação de Conteúdo', () => {
  const app = montarApp(require('../routes/conversas'));

  test('mensagem do chat com palavra proibida é bloqueada', async () => {
    const res = await request(app).post('/api/conversas/3/mensagens')
      .set('Authorization', tokenDe(COMPRADOR)).send({ conteudo: 'tenho uma espingarda também' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/\[RN09\]/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  const conversa = (...falas) => ({ conversa: falas.map(([papel, texto]) => ({ papel, texto })) });

  test('IA: identifica avaria mencionada pelo vendedor na conversa', () => {
    const r = avariaDaConversa(conversa(['vendedor', 'Geladeira boa, só não gela direito']));
    expect(r.mencionada).toBe(true);
  });

  test('IA: "sem defeito" não é confundido com avaria', () => {
    const r = avariaDaConversa(conversa(['vendedor', 'Está sem nenhum defeito, tudo funcionando']));
    expect(r.mencionada).toBe(false);
    expect(r.negou_defeito).toBe(true);
  });

  test('IA: "faz barulho" de brinquedo não é tratado como defeito', () => {
    const r = avariaDaConversa(conversa(['vendedor', 'Carrinho que faz barulho e acende luz']));
    expect(r.mencionada).toBe(false);
  });

  test('IA: vendedor não consegue trocar para "novo" depois de declarar defeito', () => {
    const rascunho = { estado_conservacao: 'para-reparo', descricao: 'Tela rachada', avarias_declaradas: ['tela rachada'] };
    const { rascunho: final, ignoradas } = aplicarEdicoes(rascunho, { estado_conservacao: 'novo' });
    expect(final.estado_conservacao).toBe('para-reparo');
    expect(ignoradas.estado_conservacao).toMatch(/defeito declarado/);
  });
});

describe('RN08 - Liberação da Avaliação', () => {
  const app = montarApp(require('../routes/avaliacoes'));
  const avaliar = () => request(app).post('/api/avaliacoes')
    .set('Authorization', tokenDe(COMPRADOR)).send({ compra_id: 7, nota: 5, comentario: 'Ótimo' });

  test('avaliação liberada depois da entrega confirmada com o código', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: new Date() }))
      .mockResolvedValueOnce(linhas())
      .mockResolvedValueOnce(linhas({ id: 1, nota: 5 }));
    const res = await avaliar();
    expect(res.status).toBe(201);
  });

  test('avaliação bloqueada antes da confirmação da entrega', async () => {
    pool.query.mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: null }));
    const res = await avaliar();
    expect(res.status).toBe(400);
  });

  test('só uma avaliação por compra', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, entrega_confirmada_em: new Date() }))
      .mockResolvedValueOnce(linhas({ id: 1 }));
    const res = await avaliar();
    expect(res.status).toBe(409);
  });

  test('só o comprador da compra pode avaliar', async () => {
    pool.query.mockResolvedValueOnce(linhas({ comprador_id: 99, vendedor_id: VENDEDOR, entrega_confirmada_em: new Date() }));
    const res = await avaliar();
    expect(res.status).toBe(403);
  });

  test('nota precisa estar entre 1 e 5', async () => {
    const res = await request(app).post('/api/avaliacoes')
      .set('Authorization', tokenDe(COMPRADOR)).send({ compra_id: 7, nota: 6 });
    expect(res.status).toBe(400);
  });
});
