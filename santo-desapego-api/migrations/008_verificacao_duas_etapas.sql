-- ============================================================
-- 008_verificacao_duas_etapas.sql
-- Verificação em duas etapas por e-mail: ao se cadastrar e a cada
-- login com senha, o usuário recebe um código de 6 dígitos e só
-- entra depois de digitá-lo. O login com Google não pede código
-- (o Google já verificou o e-mail).
--
-- O código é guardado só como hash (SHA-256). O "desafio" é um
-- identificador aleatório que o front guarda entre a senha e o código.
--
-- Idempotente: pode rodar mais de uma vez.
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/008_verificacao_duas_etapas.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS codigos_verificacao (
  id              SERIAL PRIMARY KEY,
  desafio         VARCHAR(64) NOT NULL UNIQUE,
  usuario_id      INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  finalidade      VARCHAR(10) NOT NULL CHECK (finalidade IN ('cadastro', 'login')),
  codigo_hash     VARCHAR(64) NOT NULL,
  tentativas      SMALLINT    NOT NULL DEFAULT 0,
  expira_em       TIMESTAMP   NOT NULL,
  ultimo_envio_em TIMESTAMP   NOT NULL DEFAULT NOW(),
  usado_em        TIMESTAMP,
  criado_em       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codigos_verificacao_usuario ON codigos_verificacao(usuario_id);
