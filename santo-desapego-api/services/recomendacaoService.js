/* ════════════════════════════════════════════════════════════
   Seção "Para você" da Home [RF24]
   Recomenda anúncios ativos com base no que a própria pessoa
   visualizou (tabela cliques_comprador, a mesma do Agente A):
     - categorias: a família (categoria principal) dos anúncios
       vistos nos últimos 14 dias;
     - faixa de preço: até 1,5× o maior preço visto;
     - bairro: os mais perto do bairro do perfil vêm antes.
   Só consulta o banco (sem IA): é instantâneo e não gasta a cota
   do modelo a cada visita à Home. Nenhum vendedor tem prioridade:
   a ordem vem só da navegação de quem está vendo.
   ════════════════════════════════════════════════════════════ */
const pool = require('../db');
const { distanciaEntreBairros } = require('../utils/geolocalizacao');

const JANELA_DIAS = 14;          // mesma janela do Agente A
const FATOR_TETO_PRECO = 1.5;    // aceita até 50% acima do maior preço visto
const LIMITE = 5;

async function recomendarParaVoce({ usuarioId, bairroPerfil }) {
  // O que a pessoa viu: família da categoria e preço
  const { rows: vistos } = await pool.query(
    `SELECT COALESCE(c.categoria_pai, c.id) AS familia, cp.nome AS familia_nome, cl.preco
       FROM cliques_comprador cl
       JOIN categorias c ON c.id = cl.categoria_id
       JOIN categorias cp ON cp.id = COALESCE(c.categoria_pai, c.id)
      WHERE cl.usuario_id = $1
        AND cl.data_clique > NOW() - make_interval(days => $2)`,
    [usuarioId, JANELA_DIAS]
  );
  if (vistos.length === 0) return { anuncios: [], categorias: [] };

  const familias = [...new Set(vistos.map((v) => v.familia))];
  const nomes = [...new Set(vistos.map((v) => v.familia_nome))];
  const precos = vistos.map((v) => Number(v.preco)).filter((p) => p > 0);
  const teto = precos.length ? Math.max(...precos) * FATOR_TETO_PRECO : null;

  const { rows } = await pool.query(
    `SELECT a.id, a.titulo, a.preco, a.estado_conservacao, a.bairro, a.status, a.data_criacao,
            c.nome AS categoria_nome,
            u.mp_conectado AS vendedor_recebe_pagamentos,
            (SELECT imagem FROM anuncio_imagens WHERE anuncio_id = a.id AND is_principal = true LIMIT 1) AS imagem_principal
       FROM anuncios a
       JOIN categorias c ON c.id = a.categoria_id
       JOIN usuarios u ON u.id = a.vendedor_id
      WHERE a.status = 'ativo'
        AND a.vendedor_id <> $1
        AND COALESCE(c.categoria_pai, c.id) = ANY($2::int[])
      ORDER BY a.data_criacao DESC
      LIMIT 60`,
    [usuarioId, familias]
  );

  // Dentro da faixa de preço primeiro; depois o mais perto; depois o mais novo
  const pontuar = (a) => ({
    fora: teto != null && Number(a.preco) > teto ? 1 : 0,
    dist: bairroPerfil ? (distanciaEntreBairros(bairroPerfil, a.bairro) ?? 99) : 0,
  });
  const anuncios = rows
    .map((a) => ({ ...a, _p: pontuar(a) }))
    .sort((x, y) => x._p.fora - y._p.fora || x._p.dist - y._p.dist
      || new Date(y.data_criacao) - new Date(x.data_criacao))
    .slice(0, LIMITE)
    .map(({ _p, ...a }) => a);

  return { anuncios, categorias: nomes };
}

module.exports = { recomendarParaVoce, JANELA_DIAS, FATOR_TETO_PRECO, LIMITE };
