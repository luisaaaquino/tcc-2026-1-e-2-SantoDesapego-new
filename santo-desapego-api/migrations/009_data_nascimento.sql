-- ============================================================
-- 009 — Verificação de maioridade [RF27 / RN11]
-- O cadastro passa a pedir a data de nascimento (dia, mês e ano)
-- e só é concluído para quem já completou 18 anos.
-- Contas antigas ficam com o campo vazio (NULL).
-- ============================================================
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS data_nascimento DATE
  CHECK (data_nascimento >= DATE '1900-01-01');
