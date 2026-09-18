-- ============================================================
-- 001_mercado_pago_split.sql
-- Adiciona as credenciais OAuth do Mercado Pago por vendedor,
-- necessárias pro split de pagamento (marketplace_fee).
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/001_mercado_pago_split.sql
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS mp_user_id         BIGINT,
  ADD COLUMN IF NOT EXISTS mp_access_token    TEXT,
  ADD COLUMN IF NOT EXISTS mp_refresh_token   TEXT,
  ADD COLUMN IF NOT EXISTS mp_public_key      TEXT,
  ADD COLUMN IF NOT EXISTS mp_token_expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_conectado       BOOLEAN NOT NULL DEFAULT FALSE;
