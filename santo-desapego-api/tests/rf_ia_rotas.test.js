// Rotas da IA: login, CEP obrigatório, conversa salva no banco (o cliente
// nunca manda o estado), desligamento pelo operador e falha do modelo.
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/agenteAnuncioService', () => ({
  rodarAgente: jest.fn(),
  decidirPendencia: jest.fn(),
  estadoInicial: jest.fn(async () => ({ versao: 2, conversa: [], finalizado: false })),
  gerarRascunhoRapido: jest.fn(),
}));
jest.mock('../services/agenteCompraService', () => ({ registrarClique: jest.fn(), gerarSugestaoCompra: jest.fn() }));

const request = require('supertest');
const pool = require('../db');
const { rodarAgente, decidirPendencia, gerarRascunhoRapido } = require('../services/agenteAnuncioService');
const { registrarClique, gerarSugestaoCompra } = require('../services/agenteCompraService');
const { montarApp, tokenDe, linhas } = require('./helpers');

const app = montarApp(require('../routes/ia'));
const VENDEDOR = 2;

const erroDoModelo = () => Object.assign(new Error('fora do ar'), { codigo: 'LLM_INDISPONIVEL' });
const resultadoAgente = (extra = {}) => ({
  estado: { conversa: [{ papel: 'agente', texto: 'Qual a marca?' }], finalizado: false, pendencia: null, faixa_preco: null },
  mensagem_agente: 'Qual a marca?', status: 'aguardando_vendedor', ...extra,
});

const clienteBanco = (respostas = {}) => {
  const client = {
    query: jest.fn(async (sql) => {
      for (const [padrao, resposta] of Object.entries(respostas)) if (new RegExp(padrao).test(sql)) return resposta;
      return linhas();
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};
const sqlsDe = (client) => client.query.mock.calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  delete process.env.SANTO_SUSPENSO;
});

describe('RF06 - Anúncio de Produtos', () => {
  const conversar = (corpo) => request(app).post('/api/ia/agente-anuncio').set('Authorization', tokenDe(VENDEDOR)).send(corpo);

  test('IA: primeira mensagem cria a conversa e guarda o estado no banco', async () => {
    const client = clienteBanco({
      'SELECT cep, bairro': linhas({ cep: '04710150', bairro: 'Brooklin' }),
      'INSERT INTO conversas_ia_anuncio': linhas({ id: 33 }),
    });
    rodarAgente.mockResolvedValueOnce(resultadoAgente());

    const res = await conversar({ mensagem: '  Quero vender uma geladeira  ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ conversa_id: 33, status: 'aguardando_vendedor', mensagem_agente: 'Qual a marca?' });
    expect(rodarAgente.mock.calls[0][0]).toMatchObject({ mensagemVendedor: 'Quero vender uma geladeira', vendedorId: VENDEDOR });
    expect(sqlsDe(client).some((s) => /UPDATE conversas_ia_anuncio/.test(s))).toBe(true);
    expect(sqlsDe(client)).toContain('COMMIT');
  });

  test('IA: sem CEP no perfil não dá para anunciar com IA', async () => {
    const client = clienteBanco({ 'SELECT cep, bairro': linhas({ cep: null }) });
    const res = await conversar({ mensagem: 'geladeira' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/CEP/);
    expect(sqlsDe(client)).toContain('ROLLBACK');
  });

  test('IA: mensagem vazia é recusada', async () => {
    expect((await conversar({ mensagem: '  ' })).status).toBe(400);
  });

  test('IA: só o dono continua a própria conversa', async () => {
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas() });
    expect((await conversar({ conversa_id: 33, mensagem: 'oi' })).status).toBe(404);
  });

  test('IA: conversa já concluída ou de versão antiga não continua', async () => {
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: { versao: 2 }, finalizado: true }) });
    expect((await conversar({ conversa_id: 33, mensagem: 'oi' })).body.erro).toMatch(/concluída/);
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: {}, finalizado: false }) });
    expect((await conversar({ conversa_id: 33, mensagem: 'oi' })).body.erro).toMatch(/versão antiga/);
  });

  test('IA: continua a conversa a partir do estado salvo no banco', async () => {
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: { versao: 2, conversa: ['salvo'] }, finalizado: false }) });
    rodarAgente.mockResolvedValueOnce(resultadoAgente());
    await conversar({ conversa_id: 33, mensagem: 'Brastemp', estado: { forjado: true } });
    expect(rodarAgente.mock.calls[0][0].estado).toEqual({ versao: 2, conversa: ['salvo'] });
  });

  test('IA: modelo fora do ar dá aviso amigável e não salva nada pela metade', async () => {
    const client = clienteBanco({ 'SELECT cep, bairro': linhas({ cep: '04710150' }), 'INSERT INTO': linhas({ id: 33 }) });
    rodarAgente.mockRejectedValueOnce(erroDoModelo());
    const res = await conversar({ mensagem: 'geladeira' });
    expect(res.status).toBe(503);
    expect(res.body.erro).toMatch(/formulário manual/);
    expect(sqlsDe(client)).toContain('ROLLBACK');
  });

  test('IA: o operador pode desligar a IA sem mexer no código (SANTO_SUSPENSO=1)', async () => {
    process.env.SANTO_SUSPENSO = '1';
    const res = await conversar({ mensagem: 'geladeira' });
    expect(res.status).toBe(503);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  // ── Decisão do vendedor ──
  const decidir = (corpo) => request(app).post('/api/ia/agente-anuncio/decisao').set('Authorization', tokenDe(VENDEDOR)).send(corpo);

  test('IA: decisão do vendedor publica e salva a conversa', async () => {
    const client = clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: { versao: 2 } }) });
    decidirPendencia.mockResolvedValueOnce(resultadoAgente({ status: 'publicado', anuncio: { id: 77 } }));
    const res = await decidir({ conversa_id: 33, acao: 'aprovar', imagens: ['img'] });
    expect(res.body.anuncio.id).toBe(77);
    expect(client.query.mock.calls.find(([s]) => /UPDATE conversas_ia_anuncio/.test(s))[1][3]).toBe(77);
  });

  test('IA: decisão sem conversa, de outra pessoa ou sem rascunho pendente é recusada', async () => {
    expect((await decidir({ acao: 'aprovar' })).status).toBe(400);
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas() });
    expect((await decidir({ conversa_id: 33, acao: 'aprovar' })).status).toBe(404);
    clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: {} }) });
    decidirPendencia.mockResolvedValueOnce({ erro: 'Não há nenhum rascunho esperando sua decisão nesta conversa.' });
    expect((await decidir({ conversa_id: 33, acao: 'aprovar' })).status).toBe(400);
  });

  test('IA: aprovar sem foto avisa e mantém a conversa salva', async () => {
    const client = clienteBanco({ 'FROM conversas_ia_anuncio': linhas({ estado: {} }) });
    decidirPendencia.mockResolvedValueOnce(resultadoAgente({ erro: 'Envie pelo menos 1 imagem do produto.', status: 'aguardando_aprovacao' }));
    const res = await decidir({ conversa_id: 33, acao: 'aprovar' });
    expect(res.status).toBe(400);
    expect(sqlsDe(client)).toContain('COMMIT');
  });

  // ── Anúncio rápido ──
  test('IA: anúncio rápido devolve o rascunho para revisar no formulário', async () => {
    pool.query.mockResolvedValueOnce(linhas({ cep: '04710150', bairro: 'Brooklin' }));
    gerarRascunhoRapido.mockResolvedValueOnce({ rascunho: { titulo: 'Sofá' } });
    const res = await request(app).post('/api/ia/anuncio-rapido').set('Authorization', tokenDe(VENDEDOR)).send({ mensagem: 'sofá' });
    expect(res.body.rascunho.titulo).toBe('Sofá');
  });

  test('IA: anúncio rápido exige descrição e CEP no perfil, e avisa se o modelo cair', async () => {
    const enviar = (mensagem) => request(app).post('/api/ia/anuncio-rapido').set('Authorization', tokenDe(VENDEDOR)).send({ mensagem });
    expect((await enviar('')).status).toBe(400);
    pool.query.mockResolvedValueOnce(linhas({ cep: null }));
    expect((await enviar('sofá')).status).toBe(400);
    pool.query.mockResolvedValueOnce(linhas({ cep: '04710150' }));
    gerarRascunhoRapido.mockRejectedValueOnce(erroDoModelo());
    expect((await enviar('sofá')).status).toBe(503);
  });

  test('IA: rotas da IA exigem login', async () => {
    expect((await request(app).post('/api/ia/agente-anuncio').send({ mensagem: 'oi' })).status).toBe(401);
  });
});

describe('RF24 - Assistente de Compra com IA', () => {
  test('registra o anúncio visto pelo comprador', async () => {
    const res = await request(app).post('/api/ia/registrar-clique').set('Authorization', tokenDe(1)).send({ anuncio_id: 101 });
    expect(res.status).toBe(204);
    expect(registrarClique).toHaveBeenCalledWith({ usuarioId: 1, anuncioId: 101 });
    expect((await request(app).post('/api/ia/registrar-clique').set('Authorization', tokenDe(1)).send({})).status).toBe(400);
  });

  test('envia ao assistente só as últimas 6 falas do comprador, sem textos vazios', async () => {
    pool.query.mockResolvedValueOnce(linhas({ bairro: 'Brooklin' }));
    gerarSugestaoCompra.mockResolvedValueOnce({ tipo: 'sugestao', itens: [] });
    const falas = ['  a  ', '', 'b', 'c', 7, 'd', 'e', 'f', 'g'];

    await request(app).post('/api/ia/sugestao-compra').set('Authorization', tokenDe(1)).send({ mensagens: falas });

    expect(gerarSugestaoCompra).toHaveBeenCalledWith({ usuarioId: 1, bairroPerfil: 'Brooklin', mensagens: ['b', 'c', 'd', 'e', 'f', 'g'] });
  });

  test('sem mensagens, usa só o histórico de cliques (GET)', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    gerarSugestaoCompra.mockResolvedValueOnce({ tipo: 'pergunta' });
    await request(app).get('/api/ia/sugestao-compra').set('Authorization', tokenDe(1));
    expect(gerarSugestaoCompra).toHaveBeenCalledWith({ usuarioId: 1, bairroPerfil: null, mensagens: [] });
  });

  test('assistente fora do ar dá aviso amigável', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    gerarSugestaoCompra.mockRejectedValueOnce(erroDoModelo());
    expect((await request(app).post('/api/ia/sugestao-compra').set('Authorization', tokenDe(1)).send({})).status).toBe(503);
  });
});
