-- ============================================================
-- 002_indicios_moderacao.sql
-- Indícios de avaria não declarada, levantados pelo Agente de
-- Anúncio (IA) quando o vendedor recusa declarar um defeito
-- detectado na conversa. Fica pendente de revisão humana — o
-- anúncio NÃO é publicado automaticamente nesse caso.
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/002_indicios_moderacao.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS indicios_moderacao (
  id             SERIAL PRIMARY KEY,
  vendedor_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rascunho       JSONB NOT NULL,
  indicio        TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente','aprovado','rejeitado')),
  anuncio_id     INTEGER REFERENCES anuncios(id) ON DELETE SET NULL,
  resolvido_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  resolucao      TEXT,
  data_criacao   TIMESTAMP NOT NULL DEFAULT NOW(),
  resolvido_em   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_indicios_status   ON indicios_moderacao(status, data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_indicios_vendedor ON indicios_moderacao(vendedor_id);
