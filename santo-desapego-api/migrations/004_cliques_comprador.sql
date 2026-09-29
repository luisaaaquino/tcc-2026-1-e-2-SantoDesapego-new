-- ============================================================
-- 004_cliques_comprador.sql
-- Sinal de intenção de compra pro Agente A (Consultor de Compra):
-- cada clique do comprador num anúncio vira um registro aqui. Guarda
-- uma "foto" da categoria/preço/bairro no momento do clique (não só
-- o anuncio_id) pra continuar servindo de sinal mesmo se o anúncio
-- for editado, vendido ou apagado depois (caso "estoque volátil" do
-- case original).
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/004_cliques_comprador.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS cliques_comprador (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anuncio_id    INTEGER REFERENCES anuncios(id) ON DELETE SET NULL,
  categoria_id  INTEGER,
  preco         NUMERIC(10,2),
  bairro        VARCHAR(100),
  data_clique   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliques_comprador_usuario ON cliques_comprador(usuario_id, data_clique DESC);
