-- ============================================================
-- 006_remove_aceita_troca.sql
-- A plataforma deixou de oferecer troca — agora é só venda. Remove
-- a coluna que marcava se o anúncio aceitava propostas de troca.
--
-- Idempotente: pode rodar mais de uma vez (IF EXISTS).
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/006_remove_aceita_troca.sql
-- ============================================================

ALTER TABLE anuncios DROP COLUMN IF EXISTS aceita_troca;
