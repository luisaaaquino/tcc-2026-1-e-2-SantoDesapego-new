-- ============================================================
-- 011 — Limite de troca de endereço [RN01]
-- O anúncio usa o CEP do cadastro. Para dificultar quem troca o CEP
-- só para conseguir anunciar em Santo Amaro:
--   - a 1ª troca de CEP/bairro depois do cadastro é livre (corrigir erro);
--   - da 2ª em diante, só 30 dias depois da troca anterior.
-- Logradouro, número e complemento continuam livres.
-- ============================================================
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS endereco_trocas     INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS endereco_trocado_em TIMESTAMP;
