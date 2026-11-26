-- ============================================================
-- 010 — Uma compra aprovada por anúncio [RNF09]
-- Mesmo que dois pagamentos do mesmo item sejam aprovados ao mesmo
-- tempo, o banco só aceita UMA compra com status 'approved' por
-- anúncio. O segundo pagamento é reembolsado pela API
-- (routes/pagamentos.js) e fica no histórico como 'refunded'.
-- Compras pendentes e recusadas também passam a ser gravadas [RF17].
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_aprovada_unica
  ON compras(anuncio_id) WHERE status = 'approved';
