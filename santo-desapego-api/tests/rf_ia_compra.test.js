// Assistente de Compra com IA. O modelo é simulado; o que se testa é o
// código: só sugerir anúncios reais e ativos, 1 por categoria, dentro do
// orçamento, perto do comprador, e usar os cliques quando ele não diz nada.
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/categoriasCache', () => ({ categoriasDisponiveis: jest.fn() }));
jest.mock('../services/llmClient', () => ({
  ...jest.requireActual('../services/llmClient'),
  chamadaEstruturada: jest.fn(),
}));

const pool = require('../db');
const { categoriasDisponiveis } = require('../services/categoriasCache');
const { chamadaEstruturada } = require('../services/llmClient');
const { gerarSugestaoCompra, registrarClique, conferirSugestao } = require('../services/agenteCompraService');
const { linhas } = require('./helpers');

const COMPRADOR = 1;
const CATEGORIAS = [
  { id: 10, nome: 'Geladeiras', categoria_pai: 'Eletrodomésticos' },
  { id: 11, nome: 'Fogões', categoria_pai: 'Eletrodomésticos' },
  { id: 20, nome: 'Mesas', categoria_pai: 'Móveis' },
];

const pedido = (extra = {}) => ({
  intencao: 'montar a cozinha', categorias_ids: [10, 11], orcamento_total: 1000, preco_max_item: null,
  bairro: null, faltando: [], ambiguidade: null, escolha: null, ...extra,
});

// Catálogo simulado: anúncios ativos por categoria (a busca filtra no SQL)
const CATALOGO = {
  10: [{ id: 101, titulo: 'Geladeira Consul', preco: '700', bairro: 'Campo Belo' },
    { id: 102, titulo: 'Geladeira Brastemp', preco: '650', bairro: 'Granja Julieta' }],
  11: [{ id: 111, titulo: 'Fogão 4 bocas', preco: '400', bairro: 'Santo Amaro Centro' }],
  20: [],
};

// porTermos: anúncios achados pelas palavras do pedido (qualquer categoria)
// proprios: quantos anúncios ativos da própria pessoa batem com o pedido
const montarBanco = ({ cliques = [], porTermos = [], proprios = 0 } = {}) => pool.query.mockImplementation(async (sql, params) => {
  if (/FROM cliques_comprador/.test(sql)) return linhas(...cliques.map((c) => ({ categoria_id: c })));
  if (/COUNT\(\*\)::int AS total FROM anuncios/.test(sql)) return linhas({ total: proprios });
  if (/FROM anuncios a JOIN categorias/.test(sql)) return linhas(...porTermos);
  if (/FROM anuncios a WHERE/.test(sql)) return linhas(...(CATALOGO[params[0]] || []));
  return linhas();
});

const roteiro = (...respostas) => respostas.forEach((conteudo) => chamadaEstruturada.mockResolvedValueOnce({ conteudo, uso: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  chamadaEstruturada.mockReset();
  pool.query.mockReset();
  categoriasDisponiveis.mockResolvedValue(CATEGORIAS);
});

describe('RF24 - Assistente de Compra com IA', () => {
  test('sem mensagem e sem histórico, pergunta o que a pessoa procura', async () => {
    montarBanco();
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo' });
    expect(r.tipo).toBe('pergunta');
    expect(r.texto).toMatch(/o que você está procurando/);
    expect(chamadaEstruturada).not.toHaveBeenCalled();
  });

  test('sem mensagem, sugere a partir dos anúncios vistos recentemente', async () => {
    montarBanco({ cliques: [10] });

    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Santo Amaro Centro' });

    expect(r.tipo).toBe('sugestao');
    expect(r.itens.map((i) => i.id)).toEqual([102, 101]); // as duas geladeiras, a mais perto primeiro
    expect(chamadaEstruturada).not.toHaveBeenCalled();
    expect(r.escolha_declarada).toMatch(/anúncios que você abriu recentemente: Geladeiras/);
    const sqlCliques = pool.query.mock.calls.find(([s]) => /cliques_comprador/.test(s))[0];
    expect(sqlCliques).toMatch(/INTERVAL '14 days'/);
  });

  test('busca só anúncios ativos, de outros vendedores e até o teto de preço', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [10], orcamento_total: 800 }), { itens_ids: [101], justificativa: 'ok', categorias_de_fora: [] });

    await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['geladeira até 800'] });

    const [sql, params] = pool.query.mock.calls.find(([s]) => /FROM anuncios a WHERE/.test(s));
    expect(sql).toMatch(/a\.status = 'ativo'/);
    expect(sql).toMatch(/a\.vendedor_id != \$2/);
    expect(sql).toMatch(/a\.preco <= \$3/);
    expect(params).toEqual([10, COMPRADOR, 800]);
  });

  test('opções vêm do mais perto para o mais longe do bairro do comprador', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [10], orcamento_total: null }));

    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Santo Amaro Centro', mensagens: ['geladeira'] });

    expect(r.itens.map((c) => c.id)).toEqual([102, 101]); // Granja Julieta fica mais perto que o Campo Belo
    expect(r.itens[0].dist_km).toBeLessThan(r.itens[1].dist_km);
  });

  test('pedido simples mostra todas as opções, sem descartar nenhuma por critério inventado', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [10], orcamento_total: null, intencao: 'uma geladeira' }));

    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['quero geladeira'] });

    expect(r.tipo).toBe('sugestao');
    expect(r.itens).toHaveLength(2);
    expect(r.texto).toBe('Encontrei 2 anúncios para o seu pedido, do mais perto para o mais longe de você.');
    expect(r.texto).not.toMatch(/custo|benefício|deixad/i);
    expect(chamadaEstruturada).toHaveBeenCalledTimes(1); // o modelo só interpretou; não escolheu entre as opções
  });

  test('acha o produto pelas palavras do pedido mesmo cadastrado em outra categoria', async () => {
    // "Brinquedos" (20 no teste) está vazio, mas o boneco foi cadastrado em outra categoria
    montarBanco({ porTermos: [{ id: 301, titulo: 'Action Figure do Luffy', preco: '200', bairro: 'Campo Belo', categoria_id: 99, categoria: 'Diversos' }] });
    roteiro(pedido({ categorias_ids: [20], orcamento_total: null, termos_busca: ['brinquedo', 'action figure', 'x', '50%_off'] }));

    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['quero brinquedos'] });

    expect(r.itens.map((i) => i.titulo)).toEqual(['Action Figure do Luffy']);
    const [sql, params] = pool.query.mock.calls.find(([s]) => /FROM anuncios a JOIN categorias/.test(s));
    expect(sql).toMatch(/a\.status = 'ativo' AND a\.vendedor_id != \$1/);
    expect(sql).toMatch(/a\.titulo ILIKE ANY\(\$2\) OR a\.descricao ILIKE ANY\(\$2\)/);
    // termos curtos saem e curingas vindos do modelo são limpos
    expect(params).toEqual([COMPRADOR, ['%brinquedo%', '%action figure%', '%50off%']]);
  });

  test('o mesmo anúncio achado pela categoria e pelas palavras aparece uma vez só', async () => {
    montarBanco({ porTermos: [{ id: 101, titulo: 'Geladeira Consul', preco: '700', bairro: 'Campo Belo', categoria_id: 10, categoria: 'Geladeiras' }] });
    roteiro(pedido({ categorias_ids: [10], orcamento_total: null, termos_busca: ['geladeira'] }));
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['geladeira'] });
    expect(r.itens.map((i) => i.id).sort()).toEqual([101, 102]);
  });

  test('sem resultado porque os anúncios são da própria pessoa, avisa isso', async () => {
    montarBanco({ proprios: 2 });
    roteiro(pedido({ categorias_ids: [20], orcamento_total: null, termos_busca: ['brinquedo'] }));
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['quero brinquedos'] });
    expect(r.tipo).toBe('recusa');
    expect(r.texto).toMatch(/Os únicos que encontrei são anúncios seus/);
  });

  test('monta uma sugestão com 1 item por categoria dentro do orçamento', async () => {
    montarBanco();
    roteiro(pedido(), { itens_ids: [101, 111], justificativa: 'Geladeira e fogão por R$ 1.100.', categorias_de_fora: [] });

    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['montar a cozinha até 1000'] });

    // 700 + 400 = 1100 > 1000: sai a categoria de menor prioridade (Fogões, a 2ª)
    expect(r.itens.map((i) => i.id)).toEqual([101]);
    expect(r.correcoes.join()).toMatch(/removida a categoria de menor prioridade: Fogões/);
    expect(r.texto).toMatch(/Ficou de fora: Fogões/);
  });

  test('o modelo não consegue sugerir produto inventado nem 2 da mesma categoria', () => {
    const candidatos = [
      { id: 101, preco: 700, categoria: 'Geladeiras', categoria_id: 10 },
      { id: 102, preco: 650, categoria: 'Geladeiras', categoria_id: 10 },
    ];
    const { itens, correcoes } = conferirSugestao({ itens_ids: [999, 101, 102] }, candidatos, null, [10]);
    expect(itens.map((i) => i.id)).toEqual([101]);
    expect(correcoes).toEqual([
      'id 999 não está entre os candidatos — removido',
      'id 102 repete a categoria Geladeiras — removido',
    ]);
  });

  test('categoria inventada pelo modelo é descartada', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [999, 10, 10] }), { itens_ids: [101], justificativa: 'ok', categorias_de_fora: [] });
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['geladeira'] });
    expect(r.pedido.categorias).toEqual(['Geladeiras']);
  });

  test('se o modelo diz que não entendeu, a categoria que ele chutou não vale', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [20], faltando: ['o_que_procura'], intencao: null }));
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['oi'] });
    expect(r.tipo).toBe('pergunta');
    expect(pool.query.mock.calls.some(([s]) => /FROM anuncios a WHERE/.test(s))).toBe(false);
  });

  test('pedido sem categoria no site é respondido com clareza', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [], intencao: 'uma moto' }));
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['quero uma moto'] });
    expect(r.texto).toMatch(/Entendi que você procura: uma moto\. Não temos uma categoria/);
  });

  test('sem anúncios disponíveis, recusa e explica em vez de inventar', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [20], orcamento_total: 300 }));
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: 'Campo Belo', mensagens: ['mesa até 300'] });
    expect(r.tipo).toBe('recusa');
    expect(r.texto).toMatch(/Procurei Mesas ativos até R\$ 300/);
    expect(chamadaEstruturada).toHaveBeenCalledTimes(1); // nem chamou o modelo para montar
  });

  test('sem bairro conhecido, avisa que ordenou só por preço', async () => {
    montarBanco();
    roteiro(pedido({ categorias_ids: [11] }), { itens_ids: [111], justificativa: 'ok', categorias_de_fora: [] });
    const r = await gerarSugestaoCompra({ usuarioId: COMPRADOR, bairroPerfil: null, mensagens: ['fogão'] });
    expect(r.escolha_declarada).toMatch(/não sei seu bairro/);
  });

  test('registra o anúncio visto com categoria, preço e bairro daquele momento', async () => {
    pool.query.mockResolvedValueOnce(linhas({ categoria_id: 10, preco: '700', bairro: 'Campo Belo' })).mockResolvedValueOnce(linhas());
    await registrarClique({ usuarioId: COMPRADOR, anuncioId: 101 });
    expect(pool.query.mock.calls[1][1]).toEqual([COMPRADOR, 101, 10, '700', 'Campo Belo']);
  });

  test('clique em anúncio que não existe mais não registra nada', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    await registrarClique({ usuarioId: COMPRADOR, anuncioId: 999 });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
