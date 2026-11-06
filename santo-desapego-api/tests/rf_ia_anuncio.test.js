// Agente de Anúncio com IA. O modelo de linguagem é simulado: cada teste
// define o "roteiro" do que o modelo responde, e o que se testa é o código
// em volta dele (portões, limites, avaliador, aprovação do vendedor).
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/categoriasCache', () => ({ categoriasDisponiveis: jest.fn() }));
jest.mock('../services/llmClient', () => ({
  ...jest.requireActual('../services/llmClient'),
  chamadaEstruturada: jest.fn(),
}));

const pool = require('../db');
const { categoriasDisponiveis } = require('../services/categoriasCache');
const { chamadaEstruturada } = require('../services/llmClient');
const {
  rodarAgente, decidirPendencia, estadoInicial, consultarPrecoComparaveis,
  gerarRascunhoRapido, aplicarEdicoes, checarPreco,
} = require('../services/agenteAnuncioService');
const { linhas } = require('./helpers');

const VENDEDOR = 2;
const IMAGEM = 'data:image/png;base64,iVBORw0KGgo=';
const CATEGORIAS = [
  { id: 10, nome: 'Geladeiras', categoria_pai: 'Eletrodomésticos' },
  { id: 20, nome: 'Sofás', categoria_pai: 'Móveis' },
];

const decisao = (acao, extra = {}) => ({
  motivo: 'teste', acao, pergunta: null, consulta: null, rascunho: null, indicio: null, ...extra,
});
const AVALIACAO_OK = {
  tem_titulo: true, tem_categoria: true, tem_descricao: true,
  estado_coerente: true, sem_invencao: true, aprovado: true, faltando: [],
};
const RASCUNHO = {
  titulo: 'Geladeira Brastemp 400L', categoria_id: 10,
  descricao: 'Geladeira frost free, 400 litros, cor branca, funcionando.',
  preco: 900, estado_conservacao: 'usado', avarias_declaradas: [],
};

// O que o modelo responde, na ordem das chamadas
const roteiro = (...respostas) => {
  respostas.forEach((conteudo) => chamadaEstruturada.mockResolvedValueOnce({
    conteudo, uso: { tokens_entrada: 100, tokens_saida: 20 },
  }));
};

// Estado com a pergunta sobre defeito já feita
const estadoComPerguntaDeDefeito = async () => {
  const estado = await estadoInicial({ cep: '04710150', bairro: 'Santo Amaro Centro' });
  estado.conversa.push({ papel: 'agente', texto: 'O produto tem algum defeito ou algo que não funciona?' });
  return estado;
};

// Leva a conversa até o rascunho esperando a decisão do vendedor
const estadoAguardandoAprovacao = async (rascunho = RASCUNHO) => {
  const estado = await estadoComPerguntaDeDefeito();
  roteiro(decisao('preencher_rascunho', { rascunho }), AVALIACAO_OK);
  const r = await rodarAgente({ estado, mensagemVendedor: 'Não tem defeito, tudo funcionando', vendedorId: VENDEDOR });
  return r.estado;
};

const clientePublicacao = () => {
  const client = {
    query: jest.fn(async (sql) => (/INSERT INTO anuncios/.test(sql)
      ? linhas({ id: 77, titulo: RASCUNHO.titulo, status: 'ativo' }) : linhas())),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

beforeEach(() => {
  jest.clearAllMocks();
  chamadaEstruturada.mockReset();
  pool.query.mockReset();
  pool.query.mockResolvedValue(linhas({ id: 10 }));
  categoriasDisponiveis.mockResolvedValue(CATEGORIAS);
});

/* ─────────────────────────────────────────────────────────── */
describe('RF06 - Anúncio de Produtos', () => {
  test('IA: quando falta informação, o agente pergunta ao vendedor', async () => {
    const estado = await estadoInicial({ cep: '04710150', bairro: 'Campo Belo' });
    roteiro(decisao('perguntar', { pergunta: 'Qual a marca e a capacidade da geladeira?' }));

    const r = await rodarAgente({ estado, mensagemVendedor: 'Quero vender minha geladeira', vendedorId: VENDEDOR });

    expect(r.status).toBe('aguardando_vendedor');
    expect(r.mensagem_agente).toMatch(/marca/);
    expect(r.estado.conversa.map((m) => m.papel)).toEqual(['vendedor', 'agente']);
  });

  test('IA: o rascunho só sai depois de perguntar sobre defeitos (portão de avaria)', async () => {
    const estado = await estadoInicial({ cep: '04710150', bairro: 'Campo Belo' });
    roteiro(decisao('preencher_rascunho', { rascunho: RASCUNHO }));

    const r = await rodarAgente({ estado, mensagemVendedor: 'Geladeira Brastemp 400L, 900 reais', vendedorId: VENDEDOR });

    expect(r.status).toBe('aguardando_vendedor');
    expect(r.mensagem_agente).toMatch(/defeito/);
    expect(chamadaEstruturada).toHaveBeenCalledTimes(1); // o avaliador nem foi chamado
  });

  test('IA: rascunho aprovado vira pendência para o vendedor decidir (a IA não publica)', async () => {
    const estado = await estadoAguardandoAprovacao();

    expect(estado.status).toBe('aguardando_aprovacao');
    expect(estado.pendencia).toMatchObject({ tipo: 'aprovacao_vendedor', acao: 'publicar_anuncio' });
    expect(estado.pendencia.consequencia).toMatch(/R\$ 900/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('IA: CEP e bairro do anúncio vêm do perfil do vendedor, nunca do modelo', async () => {
    const estado = await estadoAguardandoAprovacao({ ...RASCUNHO, cep: '01001000', bairro: 'Sé' });
    expect(estado.rascunho).toMatchObject({ cep: '04710150', bairro: 'Santo Amaro Centro' });
  });

  test('IA: defeito citado pelo vendedor e fora do rascunho é barrado pelo código, mesmo com o modelo aprovando', async () => {
    const estado = await estadoComPerguntaDeDefeito();
    roteiro(
      decisao('preencher_rascunho', { rascunho: { ...RASCUNHO, descricao: 'Versão 1 da descrição da geladeira.' } }), AVALIACAO_OK,
      decisao('preencher_rascunho', { rascunho: { ...RASCUNHO, descricao: 'Versão 2 da descrição da geladeira.' } }), AVALIACAO_OK,
      decisao('preencher_rascunho', { rascunho: { ...RASCUNHO, descricao: 'Versão 3 da descrição da geladeira.' } }), AVALIACAO_OK,
    );

    const r = await rodarAgente({ estado, mensagemVendedor: 'A porta está amassada', vendedorId: VENDEDOR });

    expect(r.status).toBe('avaliador_reprovou');
    expect(r.estado.avaliacao.aprovado_pelo_modelo).toBe(true);
    expect(r.estado.avaliacao.faltando.join()).toMatch(/avaria/);
    expect(r.estado.pendencia).toBeNull();
  });

  test('IA: para quando estoura o limite de uso (tokens) da conversa', async () => {
    const estado = await estadoInicial({ cep: '04710150', bairro: 'Campo Belo' });
    chamadaEstruturada.mockResolvedValueOnce({
      conteudo: decisao('consultar_preco', { consulta: { categoria_id: 10, termo_busca: 'geladeira' } }),
      uso: { tokens_entrada: 70000, tokens_saida: 0 },
    });
    pool.query.mockResolvedValue(linhas());

    const r = await rodarAgente({ estado, mensagemVendedor: 'Geladeira', vendedorId: VENDEDOR });

    expect(r.status).toBe('orcamento');
    expect(r.mensagem_agente).toMatch(/formulário manual/);
  });

  test('IA: para quando o modelo repete a mesma ação 3 vezes seguidas (laço)', async () => {
    const estado = await estadoInicial({ cep: '04710150', bairro: 'Campo Belo' });
    const mesma = decisao('consultar_preco', { consulta: { categoria_id: 10, termo_busca: 'geladeira' } });
    roteiro(mesma, mesma, mesma);
    pool.query.mockResolvedValue(linhas());

    const r = await rodarAgente({ estado, mensagemVendedor: 'Geladeira', vendedorId: VENDEDOR });

    expect(r.status).toBe('laco');
    expect(chamadaEstruturada).toHaveBeenCalledTimes(3);
  });

  test('IA: preço muito acima do mercado é barrado até o vendedor ser avisado da faixa', () => {
    const faixa = { faixa_min: 500, faixa_max: 800 };
    const estado = { conversa: [] };
    expect(checarPreco({ preco: 700 }, faixa, estado)).toBeNull();
    expect(checarPreco({ preco: 2000 }, faixa, estado)).toMatch(/fora da faixa/);

    estado.conversa.push({ papel: 'agente', texto: 'Parecidos saem entre R$ 500 e R$ 800.' });
    expect(checarPreco({ preco: 2000 }, faixa, estado)).toBeNull(); // avisado: a decisão é do vendedor
    expect(checarPreco({ preco: 2000 }, { erro: 'sem_comparaveis' }, { conversa: [] })).toBeNull();
  });

  test('IA: consulta de preço amplia a busca até achar 3 anúncios parecidos', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 1, titulo: 'a', preco: '600' })) // bairro + termo: só 1
      .mockResolvedValueOnce(linhas(
        { id: 1, titulo: 'a', preco: '600' }, { id: 2, titulo: 'b', preco: '400' }, { id: 3, titulo: 'c', preco: '800' },
      ));

    const faixa = await consultarPrecoComparaveis({ categoria_id: 10, termo_busca: 'Geladeira', bairro: 'Campo Belo' });

    expect(faixa).toMatchObject({ precisao: 'cidade_e_termo', n: 3, faixa_min: 400, faixa_max: 800, media: 600 });
    expect(faixa.comparaveis.map((c) => c.id)).toEqual([2, 1, 3]); // do mais barato
    expect(pool.query.mock.calls[0][0]).toMatch(/status IN \('ativo','vendido'\)/);
  });

  test('IA: sem anúncios parecidos, a consulta de preço avisa em vez de inventar', async () => {
    pool.query.mockResolvedValue(linhas());
    expect(await consultarPrecoComparaveis({ categoria_id: 10, termo_busca: 'x', bairro: 'Campo Belo' }))
      .toMatchObject({ erro: 'sem_comparaveis' });
    expect(await consultarPrecoComparaveis({ termo_busca: 'x' })).toMatchObject({ erro: 'categoria_id_obrigatorio' });
  });

  test('IA: com o rascunho esperando decisão, texto livre não muda nada', async () => {
    const estado = await estadoAguardandoAprovacao();
    chamadaEstruturada.mockClear();

    const r = await rodarAgente({ estado, mensagemVendedor: 'muda o preço pra 10', vendedorId: VENDEDOR });

    expect(r.status).toBe('aguardando_aprovacao');
    expect(r.mensagem_agente).toMatch(/botões/);
    expect(chamadaEstruturada).not.toHaveBeenCalled();
  });

  // ── Decisão do vendedor ──
  test('IA: vendedor aprova e o anúncio é publicado com as fotos', async () => {
    const estado = await estadoAguardandoAprovacao();
    const client = clientePublicacao();

    const r = await decidirPendencia({ estado, acao: 'aprovar', imagens: [IMAGEM], vendedorId: VENDEDOR });

    expect(r.status).toBe('publicado');
    expect(r.anuncio.id).toBe(77);
    expect(client.query.mock.calls.some(([sql]) => /INSERT INTO anuncios/.test(sql))).toBe(true);
  });

  test('IA: aprovar duas vezes não cria dois anúncios', async () => {
    const estado = await estadoAguardandoAprovacao();
    clientePublicacao();
    const primeira = await decidirPendencia({ estado, acao: 'aprovar', imagens: [IMAGEM], vendedorId: VENDEDOR });
    pool.connect.mockClear();

    const segunda = await decidirPendencia({ estado: primeira.estado, acao: 'aprovar', imagens: [IMAGEM], vendedorId: VENDEDOR });

    expect(segunda.anuncio.id).toBe(77);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('IA: aprovar sem foto não publica e mantém o rascunho aberto', async () => {
    const estado = await estadoAguardandoAprovacao();
    const r = await decidirPendencia({ estado, acao: 'aprovar', imagens: [], vendedorId: VENDEDOR });
    expect(r.erro).toMatch(/imagem/);
    expect(r.status).toBe('aguardando_aprovacao');
    expect(r.estado.pendencia).not.toBeNull();
  });

  test('IA: vendedor desiste e nada é publicado', async () => {
    const estado = await estadoAguardandoAprovacao();
    const r = await decidirPendencia({ estado, acao: 'rejeitar', vendedorId: VENDEDOR });
    expect(r.status).toBe('rejeitado');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('IA: edição com preço inválido é ignorada e o vendedor é avisado', async () => {
    const estado = await estadoAguardandoAprovacao();
    clientePublicacao();
    const r = await decidirPendencia({
      estado, acao: 'editar', campos: { preco: -5, titulo: 'Geladeira Brastemp 400 litros' }, imagens: [IMAGEM], vendedorId: VENDEDOR,
    });
    expect(r.status).toBe('publicado');
    expect(r.estado.rascunho).toMatchObject({ preco: 900, titulo: 'Geladeira Brastemp 400 litros' });
    expect(r.mensagem_agente).toMatch(/não foram aplicadas/);
  });

  test('IA: edição que apaga o defeito declarado da descrição traz o defeito de volta', () => {
    const rascunho = { ...RASCUNHO, descricao: 'Porta amassada.', avarias_declaradas: ['porta amassada'] };
    const { rascunho: final } = aplicarEdicoes(rascunho, { descricao: 'Geladeira linda, como nova.' });
    expect(final.descricao).toMatch(/Defeito declarado: porta amassada/);
  });

  test('IA: decisão sem rascunho pendente ou com ação desconhecida é recusada', async () => {
    const novo = await estadoInicial({ cep: '04710150', bairro: 'Campo Belo' });
    expect((await decidirPendencia({ estado: novo, acao: 'aprovar' })).erro).toMatch(/Não há nenhum rascunho/);
    const estado = await estadoAguardandoAprovacao();
    expect((await decidirPendencia({ estado, acao: 'publicar_ja' })).erro).toBe('Ação inválida.');
  });

  // ── Anúncio rápido ──
  test('IA: anúncio rápido monta o rascunho, consulta preço e passa no avaliador', async () => {
    roteiro(
      { titulo: 'Sofá 3 lugares', categoria_id: 20, descricao: 'Sofá retrátil cinza.', preco: 700, estado_conservacao: 'usado', termo_busca: 'sofá' },
      AVALIACAO_OK,
    );
    pool.query.mockResolvedValueOnce(linhas({ id: 1, titulo: 'a', preco: '600' }, { id: 2, titulo: 'b', preco: '700' }, { id: 3, titulo: 'c', preco: '900' }));

    const r = await gerarRascunhoRapido({ mensagem: 'sofá 3 lugares cinza 700', cep: '04710150', bairro: 'Campo Belo' });

    expect(r.rascunho).toMatchObject({ categoria_id: 20, cep: '04710150', bairro: 'Campo Belo' });
    expect(r.observacao_preco.precisao).toBe('bairro_e_termo');
    expect(r.avaliacao.aprovado).toBe(true);
    expect(r.custo_estimado_usd).toBeGreaterThan(0);
  });

  test('IA: anúncio rápido descarta categoria que não existe e não chama o avaliador', async () => {
    roteiro({ titulo: 'Coisa', categoria_id: 999, descricao: null, preco: null, estado_conservacao: null, termo_busca: null });
    const r = await gerarRascunhoRapido({ mensagem: 'coisa', cep: '04710150', bairro: 'Campo Belo' });
    expect(r.rascunho.categoria_id).toBeNull();
    expect(r.avaliacao).toBeNull();
    expect(chamadaEstruturada).toHaveBeenCalledTimes(1);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN09 - Moderação de Conteúdo', () => {
  test('IA: vendedor que recusa declarar defeito vai para revisão humana e nada é publicado', async () => {
    const estado = await estadoComPerguntaDeDefeito();
    roteiro(
      decisao('registrar_indicio', { indicio: 'tela trincada não declarada' }),
      decisao('preencher_rascunho', { rascunho: RASCUNHO }),
      AVALIACAO_OK,
    );
    pool.query.mockResolvedValue(linhas({ id: 5, status: 'pendente' }));

    const r = await rodarAgente({
      estado, mensagemVendedor: 'A tela está trincada, mas não quero colocar isso no anúncio', vendedorId: VENDEDOR,
    });

    expect(r.status).toBe('indicio_registrado');
    expect(r.mensagem_agente).toMatch(/revisão da nossa equipe/);
    const [sql, params] = pool.query.mock.calls.find(([s]) => /INSERT INTO indicios_moderacao/.test(s));
    expect(sql).toMatch(/'pendente'/);
    expect(params[2]).toMatch(/fala do vendedor: "A tela está trincada/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('IA: o indício só vale se o próprio vendedor citou o defeito na conversa', async () => {
    const estado = await estadoComPerguntaDeDefeito();
    roteiro(
      decisao('registrar_indicio', { indicio: 'acho que está quebrada' }),
      decisao('perguntar', { pergunta: 'Pode descrever melhor?' }),
    );

    const r = await rodarAgente({ estado, mensagemVendedor: 'Geladeira ótima, sem problema', vendedorId: VENDEDOR });

    expect(r.estado.indicio).toBeNull();
    expect(r.estado.avaliacao.faltando.join()).toMatch(/recusado pelo código/);
    expect(pool.query.mock.calls.some(([s]) => /indicios_moderacao/.test(s))).toBe(false);
  });
});
