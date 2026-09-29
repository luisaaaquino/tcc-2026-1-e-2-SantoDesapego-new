/**
 * Cache simples da lista de categorias (folhas/subcategorias), reaproveitado
 * pelos dois agentes de IA (Agente B — Assistente de Anúncio, Agente A —
 * Consultor de Compra). Extraído de agenteAnuncioService.js quando o
 * segundo agente passou a precisar da mesma lista.
 *
 * O site tem categorias-pai (Móveis & Casa, Eletrônicos, ...) e cada uma tem
 * subcategorias — o formulário manual exige a subcategoria sempre que a
 * categoria-pai tem alguma (ver Anunciar.jsx). Pra ficar coerente com o
 * resto do site (filtros/busca usam a subcategoria), os agentes só podem
 * escolher entre as subcategorias (folhas), nunca a categoria-pai direto —
 * por isso a consulta abaixo já filtra `categoria_pai IS NOT NULL` e inclui
 * o nome da categoria-pai, pra dar contexto sem o LLM precisar cruzar os
 * dois níveis sozinho.
 */
const pool = require('../db');

let categoriasCache = null;
let categoriasCacheEm = 0;

async function categoriasDisponiveis() {
  if (categoriasCache && Date.now() - categoriasCacheEm < 5 * 60 * 1000) return categoriasCache;
  const { rows } = await pool.query(`
    SELECT c.id, c.nome, p.nome AS categoria_pai
    FROM categorias c
    JOIN categorias p ON c.categoria_pai = p.id
    ORDER BY p.ordem, c.ordem
  `);
  categoriasCache = rows;
  categoriasCacheEm = Date.now();
  return rows;
}

module.exports = { categoriasDisponiveis };
