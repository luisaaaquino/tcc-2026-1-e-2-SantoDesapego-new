/**
 * Consultor de Compra (IA) — "Agente A" do repositório agents-llm-senac-2026,
 * Parte 2 (src/nos_compra.py), portado pra este backend Node/PostgreSQL.
 *
 * É um workflow, não um agente com laço: no máximo 2 chamadas de modelo.
 *   1. interpretar  [modelo] o texto livre vira parâmetros de busca
 *                            (categorias, orçamento, bairro);
 *   2. completar    [código] sem categoria, usa os cliques recentes do
 *                            comprador; sem nada, pergunta o que ele procura;
 *   3. buscar       [código] uma busca por categoria, em paralelo, mais uma
 *                            busca pelas palavras do pedido no título e na
 *                            descrição (acha o produto mesmo se o vendedor
 *                            escolheu outra categoria): itens ativos, de
 *                            outros vendedores, até o teto de preço;
 *   4. montar       pedido simples ("quero brinquedos"): [código] mostra as
 *                            opções encontradas, da mais perto para a mais
 *                            longe, sem descartar nenhuma por critério inventado;
 *                   kit com orçamento ("montar a cozinha com R$ 800", 2+
 *                            categorias): [modelo] escolhe 1 item por categoria;
 *   5. conferir     [código] ids reais, sem categoria repetida e soma dentro
 *                            do orçamento (sai a categoria de menor prioridade).
 * O modelo nunca inventa produto: só escolhe entre candidatos reais do banco.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { chamadaEstruturada, anulavel } = require('./llmClient');
const { categoriasDisponiveis } = require('./categoriasCache');
const { BAIRRO_COORDS, distanciaEntreBairros } = require('../utils/geolocalizacao');

const ler = (nome) => fs.readFileSync(path.join(__dirname, '../prompts', nome), 'utf8');
const PROMPT_INTERPRETAR = ler('compra-interpretar.md');
const PROMPT_SUGESTAO = ler('compra-sugestao.md');

const MAX_CATEGORIAS = 4;        // ramos paralelos de busca no catálogo
const CANDIDATOS_POR_CATEGORIA = 5;
const MAX_TERMOS = 8;            // palavras do pedido procuradas no título/descrição
const CANDIDATOS_POR_TERMOS = 10;
const MAX_ITENS_MOSTRADOS = 4;   // cards no painel do assistente
const JANELA_DIAS_CLIQUES = 14;
const BAIRROS = Object.keys(BAIRRO_COORDS);

/* ════════════════════════════════════════════════════════════
   Registra um clique (visualização de anúncio) — snapshot de
   categoria/preço/bairro no momento, pra sobreviver a edição/venda/
   remoção do anúncio depois.
   ════════════════════════════════════════════════════════════ */
async function registrarClique({ usuarioId, anuncioId }) {
  const { rows } = await pool.query('SELECT categoria_id, preco, bairro FROM anuncios WHERE id = $1', [anuncioId]);
  if (rows.length === 0) return;
  const { categoria_id, preco, bairro } = rows[0];
  await pool.query(
    `INSERT INTO cliques_comprador (usuario_id, anuncio_id, categoria_id, preco, bairro)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, anuncioId, categoria_id, preco, bairro]
  );
}

/* ════════════════════════════════════════════════════════════
   Schemas (esquemas.py: PedidoCompra, Sugestao)
   ════════════════════════════════════════════════════════════ */
const SCHEMA_PEDIDO = {
  type: 'object',
  properties: {
    intencao: anulavel({ type: 'string' }),
    categorias_ids: { type: 'array', items: { type: 'integer' } },
    termos_busca: { type: 'array', items: { type: 'string' } },
    orcamento_total: anulavel({ type: 'number' }),
    preco_max_item: anulavel({ type: 'number' }),
    bairro: anulavel({ type: 'string', enum: BAIRROS }),
    faltando: { type: 'array', items: { type: 'string', enum: ['o_que_procura'] } },
    ambiguidade: anulavel({ type: 'string' }),
    escolha: anulavel({ type: 'string' }),
  },
  required: ['intencao', 'categorias_ids', 'termos_busca', 'orcamento_total', 'preco_max_item', 'bairro', 'faltando', 'ambiguidade', 'escolha'],
};

const SCHEMA_SUGESTAO = {
  type: 'object',
  properties: {
    itens_ids: { type: 'array', items: { type: 'integer' } },
    justificativa: { type: 'string' },
    categorias_de_fora: { type: 'array', items: { type: 'string' } },
  },
  required: ['itens_ids', 'justificativa', 'categorias_de_fora'],
};

const validarPedido = (p) => (!p || !Array.isArray(p.categorias_ids) ? '"categorias_ids" precisa ser um array' : null);
const validarSugestao = (s) => (!s || !Array.isArray(s.itens_ids) || typeof s.justificativa !== 'string'
  ? '"itens_ids" (array) e "justificativa" (texto) são obrigatórios' : null);

const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

/* ════════════════════════════════════════════════════════════
   Ferramentas (código)
   ════════════════════════════════════════════════════════════ */
async function categoriasDosCliques(usuarioId) {
  const { rows } = await pool.query(
    `SELECT categoria_id, MAX(data_clique) AS ultimo
       FROM cliques_comprador
      WHERE usuario_id = $1 AND categoria_id IS NOT NULL
        AND data_clique > NOW() - INTERVAL '${JANELA_DIAS_CLIQUES} days'
      GROUP BY categoria_id
      ORDER BY ultimo DESC
      LIMIT ${MAX_CATEGORIAS}`,
    [usuarioId]
  );
  return rows.map((r) => r.categoria_id);
}

// Um ramo: itens ativos da categoria, de outros vendedores, até o teto.
async function buscarCategoria({ categoria, precoMax, bairro, usuarioId }) {
  const params = [categoria.id, usuarioId];
  let where = `a.status = 'ativo' AND a.categoria_id = $1 AND a.vendedor_id != $2`;
  if (precoMax) {
    params.push(precoMax);
    where += ` AND a.preco <= $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.titulo, a.preco, a.bairro,
            (SELECT imagem FROM anuncio_imagens WHERE anuncio_id = a.id AND is_principal = true LIMIT 1) AS imagem
       FROM anuncios a WHERE ${where}
      ORDER BY a.data_criacao DESC LIMIT 40`,
    params
  );
  const itens = rows.map((r) => {
    const dist = bairro ? distanciaEntreBairros(bairro, r.bairro) : null;
    return { id: r.id, titulo: r.titulo, preco: Number(r.preco), bairro: r.bairro, imagem: r.imagem,
      categoria: categoria.nome, categoria_id: categoria.id,
      dist_km: dist == null ? null : Number(dist.toFixed(1)) };
  });
  itens.sort(porProximidade);
  return itens.slice(0, CANDIDATOS_POR_CATEGORIA);
}

// Palavras do pedido -> padrões do ILIKE (sem curinga vindo do modelo)
const padroesDeBusca = (termos) => [...new Set((termos || [])
  .map((t) => String(t).trim().toLowerCase().replace(/[%_\\]/g, ''))
  .filter((t) => t.length >= 3))]
  .slice(0, MAX_TERMOS)
  .map((t) => `%${t}%`);

// Outro ramo: as palavras do pedido no título ou na descrição, em qualquer
// categoria — acha o produto mesmo quando o vendedor escolheu outra categoria
// (ex.: um boneco cadastrado em "Diversos" para quem pediu "brinquedos").
async function buscarPorTermos({ padroes, precoMax, bairro, usuarioId }) {
  if (!padroes.length) return [];
  const params = [usuarioId, padroes];
  let where = `a.status = 'ativo' AND a.vendedor_id != $1 AND (a.titulo ILIKE ANY($2) OR a.descricao ILIKE ANY($2))`;
  if (precoMax) {
    params.push(precoMax);
    where += ` AND a.preco <= $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.titulo, a.preco, a.bairro, a.categoria_id, c.nome AS categoria,
            (SELECT imagem FROM anuncio_imagens WHERE anuncio_id = a.id AND is_principal = true LIMIT 1) AS imagem
       FROM anuncios a JOIN categorias c ON c.id = a.categoria_id
      WHERE ${where}
      ORDER BY a.data_criacao DESC LIMIT 40`,
    params
  );
  return rows.map((r) => {
    const dist = bairro ? distanciaEntreBairros(bairro, r.bairro) : null;
    return { id: r.id, titulo: r.titulo, preco: Number(r.preco), bairro: r.bairro, imagem: r.imagem,
      categoria: r.categoria, categoria_id: r.categoria_id,
      dist_km: dist == null ? null : Number(dist.toFixed(1)) };
  });
}

// Mais perto primeiro (sem bairro, mais barato primeiro)
const porProximidade = (a, b) => (a.dist_km ?? 0) - (b.dist_km ?? 0) || a.preco - b.preco;

// Sem resultado: os únicos anúncios assim são da própria pessoa? (eles nunca
// aparecem para ela — sem esse aviso, parecia que o assistente não os achou)
async function temAnunciosProprios({ usuarioId, categoriasIds, padroes }) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM anuncios a
      WHERE a.status = 'ativo' AND a.vendedor_id = $1
        AND (a.categoria_id = ANY($2) OR a.titulo ILIKE ANY($3) OR a.descricao ILIKE ANY($3))`,
    [usuarioId, categoriasIds, padroes]
  );
  return (rows[0]?.total || 0) > 0;
}

/**
 * O schema garante uma lista de ints; não garante que sejam ids reais, nem
 * que a soma caiba. Corrige e registra o que corrigiu.
 */
function conferirSugestao(sug, candidatos, orcamento, prioridade) {
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const correcoes = [];
  const itens = [];
  for (const id of sug.itens_ids) {
    const c = porId.get(id);
    if (!c) correcoes.push(`id ${id} não está entre os candidatos — removido`);
    else if (itens.some((x) => x.categoria_id === c.categoria_id)) correcoes.push(`id ${id} repete a categoria ${c.categoria} — removido`);
    else itens.push(c);
  }
  // Se passar do orçamento, sai a categoria de menor prioridade (o modelo
  // ordenou da mais para a menos importante), não a mais cara.
  const ordem = new Map((prioridade || []).map((c, i) => [c, i]));
  const peso = (x) => ordem.get(x.categoria_id) ?? ordem.size;
  while (orcamento && itens.length && itens.reduce((s, x) => s + x.preco, 0) > orcamento) {
    const menos = itens.reduce((pior, x) => (peso(x) > peso(pior) || (peso(x) === peso(pior) && x.preco > pior.preco) ? x : pior));
    itens.splice(itens.indexOf(menos), 1);
    correcoes.push(`soma acima de ${reais(orcamento)} — removida a categoria de menor prioridade: ${menos.categoria} (id ${menos.id})`);
  }
  return { itens, correcoes };
}

/* ════════════════════════════════════════════════════════════
   Workflow
   ════════════════════════════════════════════════════════════ */
const PERGUNTA = 'Me conta o que você está procurando — um produto específico (ex.: uma geladeira) '
  + 'ou o que quer resolver (ex.: montar a cozinha)? Se puder, diga também quanto quer gastar.';

async function gerarSugestaoCompra({ usuarioId, bairroPerfil, mensagens = [] }) {
  const categorias = await categoriasDisponiveis();
  const porId = new Map(categorias.map((c) => [c.id, c]));

  // 1. interpretar [modelo] — só se a pessoa escreveu algo
  let pedido = { intencao: null, categorias_ids: [], orcamento_total: null, preco_max_item: null,
    bairro: null, faltando: ['o_que_procura'], ambiguidade: null, escolha: null };
  if (mensagens.length) {
    const { conteudo } = await chamadaEstruturada({
      sistema: PROMPT_INTERPRETAR,
      usuario: JSON.stringify({
        conversa: mensagens.map((m) => `comprador: ${m}`),
        categorias_disponiveis: categorias,
        bairros: BAIRROS,
      }),
      schema: SCHEMA_PEDIDO,
      nomeSchema: 'pedido_compra',
      validar: validarPedido,
      maxTokens: 400, // cabe também a lista de termos_busca
    });
    pedido = conteudo;
    // Só ids reais, sem repetição, no máximo 4
    pedido.categorias_ids = [...new Set(pedido.categorias_ids.filter((id) => porId.has(id)))].slice(0, MAX_CATEGORIAS);
    // Achado do caso 08 (repositório v3.0.0): o modelo às vezes chuta uma
    // categoria (ex.: "Diversos") e ao mesmo tempo diz que não sabe o que a
    // pessoa procura. Nesse caso a categoria não vale: segue pros cliques ou
    // pra pergunta, em vez de buscar algo que ninguém pediu.
    if (pedido.faltando.includes('o_que_procura')) pedido.categorias_ids = [];
  }
  const padroes = pedido.faltando?.includes('o_que_procura') ? [] : padroesDeBusca(pedido.termos_busca);

  // 2. completar [código] — sem categoria, tenta os cliques; sem bairro dito, usa o do perfil
  const escolhas = pedido.escolha ? [pedido.escolha] : [];
  if (!pedido.categorias_ids.length) {
    const cats = await categoriasDosCliques(usuarioId);
    if (cats.length && pedido.faltando.includes('o_que_procura')) {
      pedido.categorias_ids = cats.filter((id) => porId.has(id));
      pedido.faltando = [];
      escolhas.push(`você não disse o que procura; usei as categorias dos anúncios que você abriu recentemente: ${pedido.categorias_ids.map((id) => porId.get(id).nome).join(', ')}`);
    }
  }
  if (!pedido.categorias_ids.length && !padroes.length) {
    // Disse o que quer, mas não há categoria pra isso: não finge que não entendeu.
    const texto = pedido.intencao && !pedido.faltando.includes('o_que_procura')
      ? `Entendi que você procura: ${pedido.intencao}. Não temos uma categoria para isso no momento — `
        + 'tente descrever de outro jeito ou dê uma olhada no Explorar.'
      : PERGUNTA;
    return { tipo: 'pergunta', texto, itens: [], pedido, escolha_declarada: null };
  }
  const bairro = pedido.bairro || bairroPerfil || null;
  if (!bairro) escolhas.push('não sei seu bairro; ordenei por preço, sem distância');
  const escolhaDeclarada = escolhas.join('; ') || null;

  // 3. buscar [código] — uma busca por categoria e uma pelas palavras do
  // pedido, em paralelo; o mesmo anúncio achado pelos dois entra uma vez só
  const teto = pedido.preco_max_item || pedido.orcamento_total || null;
  const [ramosTermos, ...ramos] = await Promise.all([
    buscarPorTermos({ padroes, precoMax: teto, bairro, usuarioId }),
    ...pedido.categorias_ids.map((id) => buscarCategoria({
      categoria: porId.get(id), precoMax: teto, bairro, usuarioId,
    })),
  ]);
  const vistos = new Set();
  const candidatos = [...ramos.flat(), ...ramosTermos.sort(porProximidade).slice(0, CANDIDATOS_POR_TERMOS)]
    .filter((c) => (vistos.has(c.id) ? false : vistos.add(c.id)));
  const semItens = pedido.categorias_ids.filter((_, i) => !ramos[i].length).map((id) => porId.get(id).nome);
  const nomesCategorias = pedido.categorias_ids.map((id) => porId.get(id).nome);

  if (!candidatos.length) {
    const oQue = nomesCategorias.length ? nomesCategorias.join(', ') : (pedido.intencao || 'o que você pediu');
    let texto = `Procurei ${oQue} ativos${teto ? ` até ${reais(teto)}` : ''} e não há `
      + 'nenhum anúncio assim agora.';
    texto += await temAnunciosProprios({ usuarioId, categoriasIds: pedido.categorias_ids, padroes })
      ? ' Os únicos que encontrei são anúncios seus — eles não aparecem para você aqui.'
      : ' Itens usados somem rápido: vale aumentar o orçamento ou voltar em alguns dias.';
    return { tipo: 'recusa', texto, itens: [], pedido, escolha_declarada: escolhaDeclarada };
  }

  // 4a. pedido simples (uma categoria ou sem orçamento total): mostra as opções
  // encontradas, da mais perto para a mais longe. O texto é montado pelo
  // código, só com fatos — o modelo não escolhe entre elas, então não tem
  // como descartar uma por um critério que a pessoa não pediu.
  const ehKit = !!pedido.orcamento_total && pedido.categorias_ids.length >= 2;
  if (!ehKit) {
    const ordenados = [...candidatos].sort(porProximidade);
    const itens = ordenados.slice(0, MAX_ITENS_MOSTRADOS);
    const total = ordenados.length;
    const texto = `Encontrei ${total} ${total === 1 ? 'anúncio' : 'anúncios'} para o seu pedido`
      + (teto ? `, até ${reais(teto)}` : '')
      + (bairro ? ', do mais perto para o mais longe de você' : '') + '.'
      + (total > itens.length ? ` Aqui estão os ${itens.length} primeiros; o resto está no catálogo.` : '');
    return {
      tipo: 'sugestao', texto, escolha_declarada: escolhaDeclarada, itens,
      pedido: { intencao: pedido.intencao, categorias: nomesCategorias, orcamento_total: pedido.orcamento_total,
        preco_max_item: pedido.preco_max_item, bairro },
      sem_itens: semItens, correcoes: [],
    };
  }

  // 4b. kit com orçamento [modelo] — escolhe no máximo 1 item por categoria
  const { conteudo: sug } = await chamadaEstruturada({
    sistema: PROMPT_SUGESTAO,
    usuario: JSON.stringify({
      pedido: { intencao: pedido.intencao, categorias: nomesCategorias, orcamento_total: pedido.orcamento_total,
        preco_max_item: pedido.preco_max_item, bairro },
      candidatos: candidatos.map(({ imagem, categoria_id, ...c }) => c),
      categorias_sem_itens: semItens,
    }),
    schema: SCHEMA_SUGESTAO,
    nomeSchema: 'sugestao',
    validar: validarSugestao,
    maxTokens: 300,
  });

  // 5. conferir [código]
  const { itens, correcoes } = conferirSugestao(sug, candidatos, pedido.orcamento_total, pedido.categorias_ids);
  let justificativa = sug.justificativa;
  if (correcoes.length || !itens.length) {
    // Se o código mudou a seleção, o texto do modelo não vale mais.
    const soma = itens.reduce((s, x) => s + x.preco, 0);
    const escolhidas = new Set(itens.map((i) => i.categoria));
    const cortadas = [...new Set(candidatos.filter((c) => sug.itens_ids.includes(c.id)).map((c) => c.categoria))]
      .filter((c) => !escolhidas.has(c));
    justificativa = itens.length
      ? `Separei ${itens.length} ${itens.length === 1 ? 'item ativo' : 'itens ativos'} perto de você, somando ${reais(soma)}`
        + (pedido.orcamento_total ? ` (dentro dos ${reais(pedido.orcamento_total)})` : '') + '.'
        + (cortadas.length ? ` Ficou de fora: ${cortadas.join(', ')}, porque não coube no orçamento.` : '')
      : 'Encontrei anúncios nessas categorias, mas nenhuma combinação coube no que você pediu.';
  }

  return {
    tipo: itens.length ? 'sugestao' : 'recusa',
    texto: justificativa,
    escolha_declarada: escolhaDeclarada,
    itens,
    pedido: { intencao: pedido.intencao, categorias: nomesCategorias, orcamento_total: pedido.orcamento_total,
      preco_max_item: pedido.preco_max_item, bairro },
    sem_itens: semItens,
    correcoes,
  };
}

module.exports = { registrarClique, gerarSugestaoCompra, conferirSugestao };
