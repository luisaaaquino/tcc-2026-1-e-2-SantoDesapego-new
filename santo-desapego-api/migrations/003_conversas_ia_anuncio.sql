-- ============================================================
-- 003_conversas_ia_anuncio.sql
-- Estado do Agente de Anúncio (IA) por conversa — autoritativo no
-- backend (o front só guarda o id). Evita que o cliente adultere
-- rascunho/avaliação/orçamento entre requisições HTTP.
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/003_conversas_ia_anuncio.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS conversas_ia_anuncio (
  id            SERIAL PRIMARY KEY,
  vendedor_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado        JSONB NOT NULL,
  finalizado    BOOLEAN NOT NULL DEFAULT FALSE,
  status_final  VARCHAR(30),
  anuncio_id    INTEGER REFERENCES anuncios(id) ON DELETE SET NULL,
  criada_em     TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizada_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversas_ia_vendedor ON conversas_ia_anuncio(vendedor_id, atualizada_em DESC);
