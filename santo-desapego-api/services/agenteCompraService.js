/**
 * Consultor de Compra (IA) — "Agente A" do case acadêmico
 * agents-llm-senac-2026. Infere a intenção de compra do comprador a partir
 * dos cliques dele no catálogo (sem ele dizer explicitamente o que quer) e
 * sugere itens reais: ativos, dentro da faixa de preço inferida, priorizando
 * o bairro dele, nunca anúncios do próprio usuário.
 *
 * Fiel ao design original:
 * - Cold start: com menos de 2 produtos distintos clicados, não arrisca —
 *   mostra descoberta genérica em vez de inventar uma intenção.
 * - Sinal fraco: mesmo com vários cliques, se o LLM não achar um padrão
 *   coerente (`intencao_clara: false`), também cai pra descoberta genérica —
 *   "admite que não sabe" em vez de chutar.
 * - O LLM nunca escolhe os produtos finais — só interpreta o sinal
 *   (categorias + faixa de preço). A escolha real vem de uma consulta ao
 *   banco, com o mesmo espírito de "ferramenta com dado real" do Agente B.
 */
const pool = require('../db');
const { chamarLLMValidado } = require('./llmClient');
const { categoriasDisponiveis } = require('./categoriasCache');
const fs = require('fs');
const path = require('path');

const PROMPT_CONSULTOR = fs.readFileSync(path.join(__dirname, '../prompts/consultor-compra.md'), 'utf8');

const JANELA_DIAS_SINAL = 14;
const MAX_CLIQUES_CONSIDERADOS = 20;
const MIN_PRODUTOS_DISTINTOS = 2; // abaixo disso, cold start — não arrisca

/* ════════════════════════════════════════════════════════════
   Registra um clique (visualização de anúncio) — snapshot de
   categoria/preço/bairro no momento, pra sobreviver a edição/venda/
   remoção do anúncio depois (caso "estoque volátil" do case).
   ════════════════════════════════════════════════════════════ */
async function registrarClique({ usuarioId, anuncioId }) {
  const { rows } = await pool.query(
    'SELECT categoria_id, preco, bairro FROM anuncios WHERE id = $1',
    [anuncioId]
  );
  if (rows.length === 0) return; // anúncio não existe (mais) — nada a registrar

  const { categoria_id, preco, bairro } = rows[0];
  await pool.query(
    `INSERT INTO cliques_comprador (usuario_id, anuncio_id, categoria_id, preco, bairro)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, anuncioId, categoria_id, preco, bairro]
  );
}

const SELECT_ITEM = `
  a.id, a.titulo, a.preco, a.bairro,
  (SELECT imagem FROM anuncio_imagens WHERE anuncio_id = a.id AND is_principal = true LIMIT 1) AS imagem
`;

/* ════════════════════════════════════════════════════════════
   Descoberta genérica — sem LLM, usada em cold start ou quando o
   sinal é fraco demais pra apostar numa intenção.
   ════════════════════════════════════════════════════════════ */
async function descobertaGenerica({ usuarioId, bairro }) {
  // Tenta primeiro no mesmo bairro; se não tiver o suficiente, abre pra
  // cidade toda — mesmo padrão de cascata do Agente B.
  const tentativas = bairro ? [{ usarBairro: true }, { usarBairro: false }] : [{ usarBairro: false }];

  for (const t of tentativas) {
    const params = [usuarioId];
    let where = `status = 'ativo' AND vendedor_id != $1`;
    if (t.usarBairro) {
      params.push(bairro);
      where += ` AND bairro = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${SELECT_ITEM} FROM anuncios a WHERE ${where} ORDER BY a.data_criacao DESC LIMIT 4`,
      params
    );
    if (rows.length > 0) {
      return {
        tipo: 'descoberta_generica',
        intencao_descrita: null,
        justificativa: 'Ainda não conheço seu gosto — aqui vão alguns anúncios recentes por perto.',
        itens: rows,
      };
    }
  }
  return { tipo: 'descoberta_generica', intencao_descrita: null, justificativa: null, itens: [] };
}

function validarSugestaoLLM(conteudo) {
  if (typeof conteudo !== 'object' || conteudo === null) return 'não é um objeto';
  if (typeof conteudo.intencao_clara !== 'boolean') return '"intencao_clara" precisa ser booleano';
  if (!Array.isArray(conteudo.categorias_id)) return '"categorias_id" precisa ser um array';
  if (conteudo.categorias_id.some((c) => typeof c !== 'number')) return '"categorias_id" precisa ter só números';
  return null;
}

/* ════════════════════════════════════════════════════════════
   Sugestão principal — chamada pelo botão flutuante do site.
   ════════════════════════════════════════════════════════════ */
async function gerarSugestaoCompra({ usuarioId, bairro }) {
  const { rows: cliques } = await pool.query(
    `SELECT c.anuncio_id, c.categoria_id, c.preco, c.bairro, a.titulo
       FROM cliques_comprador c
       LEFT JOIN anuncios a ON a.id = c.anuncio_id
      WHERE c.usuario_id = $1 AND c.data_clique > NOW() - INTERVAL '${JANELA_DIAS_SINAL} days'
      ORDER BY c.data_clique DESC
      LIMIT ${MAX_CLIQUES_CONSIDERADOS}`,
    [usuarioId]
  );

  const produtosDistintos = new Set(cliques.map((c) => c.anuncio_id).filter(Boolean));
  if (produtosDistintos.size < MIN_PRODUTOS_DISTINTOS) {
    return descobertaGenerica({ usuarioId, bairro });
  }

  const categorias = await categoriasDisponiveis();
  const nomeCategoria = Object.fromEntries(categorias.map((c) => [c.id, c.nome]));

  const cliquesContexto = cliques
    .filter((c) => c.categoria_id != null)
    .map((c) => ({
      categoria: nomeCategoria[c.categoria_id] || null,
      titulo: c.titulo,
      preco: c.preco != null ? Number(c.preco) : null,
    }));

  const mensagens = [
    { role: 'system', content: PROMPT_CONSULTOR },
    {
      role: 'system',
      content: `Categorias disponíveis (JSON): ${JSON.stringify(categorias)}`,
    },
    {
      role: 'user',
      content: JSON.stringify({ cliques_recentes: cliquesContexto, bairro }),
    },
  ];

  let conteudo;
  try {
    ({ conteudo } = await chamarLLMValidado(mensagens, validarSugestaoLLM));
  } catch {
    // LLM indisponível/inválido — não trava a experiência do comprador,
    // cai pra descoberta genérica em vez de mostrar erro.
    return descobertaGenerica({ usuarioId, bairro });
  }

  if (!conteudo.intencao_clara || conteudo.categorias_id.length === 0) {
    return descobertaGenerica({ usuarioId, bairro });
  }

  // Cascata: mesmo bairro + categorias + faixa de preço → cidade toda +
  // categorias + faixa → só categorias, sem faixa. Pra pra na primeira
  // tentativa com pelo menos 1 resultado (sugestão é enxuta por natureza,
  // não precisa de volume como a consulta de preço do Agente B).
  const precoMin = conteudo.preco_min != null ? Number(conteudo.preco_min) * 0.7 : null;
  const precoMax = conteudo.preco_max != null ? Number(conteudo.preco_max) * 1.3 : null;

  const tentativas = [
    { usarBairro: true, usarFaixa: true },
    { usarBairro: false, usarFaixa: true },
    { usarBairro: false, usarFaixa: false },
  ];

  for (const t of tentativas) {
    if (t.usarBairro && !bairro) continue;
    const params = [usuarioId, conteudo.categorias_id];
    let where = `status = 'ativo' AND vendedor_id != $1 AND categoria_id = ANY($2)`;
    if (t.usarBairro) {
      params.push(bairro);
      where += ` AND bairro = $${params.length}`;
    }
    if (t.usarFaixa && precoMin != null && precoMax != null) {
      params.push(precoMin, precoMax);
      where += ` AND preco BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${SELECT_ITEM} FROM anuncios a WHERE ${where} ORDER BY a.data_criacao DESC LIMIT 4`,
      params
    );
    if (rows.length > 0) {
      return {
        tipo: 'sugestao',
        intencao_descrita: conteudo.intencao_descrita,
        justificativa: conteudo.justificativa,
        itens: rows,
      };
    }
  }

  // Categorias certas, mas estoque zerado no momento (caso "estoque
  // volátil" do case) — melhor mostrar descoberta genérica do que nada.
  return descobertaGenerica({ usuarioId, bairro });
}

module.exports = { registrarClique, gerarSugestaoCompra };
