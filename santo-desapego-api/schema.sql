-- ============================================================
-- schema.sql — Estrutura do banco Santo Desapego
-- Gerado a partir das queries usadas em server.js
-- ============================================================

CREATE TABLE usuarios (
  id                 SERIAL PRIMARY KEY,
  nome               VARCHAR(100)  NOT NULL,
  sobrenome          VARCHAR(100)  NOT NULL,
  telefone           VARCHAR(20),
  email              VARCHAR(150)  NOT NULL UNIQUE,
  senha              VARCHAR(255)  NOT NULL,
  cep                VARCHAR(10),
  logradouro         VARCHAR(255),
  numero             VARCHAR(20),
  complemento        VARCHAR(100),
  bairro             VARCHAR(100),
  cpf                CHAR(11)      NOT NULL UNIQUE,
  aceita_termos      BOOLEAN       NOT NULL DEFAULT FALSE,
  recebe_newsletter  BOOLEAN       DEFAULT FALSE,
  foto_perfil        TEXT,
  data_cadastro      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  papel              VARCHAR(20)   NOT NULL DEFAULT 'usuario' CHECK (papel IN ('usuario','administrador')),
  status_conta       VARCHAR(20)   NOT NULL DEFAULT 'ativa' CHECK (status_conta IN ('ativa','suspensa'))
);

CREATE TABLE categorias (
  id             SERIAL PRIMARY KEY,
  nome           VARCHAR(80) NOT NULL,
  slug           VARCHAR(80) NOT NULL UNIQUE,
  icone          VARCHAR(10),
  categoria_pai  INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  ordem          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE anuncios (
  id                  SERIAL PRIMARY KEY,
  vendedor_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id        INTEGER NOT NULL REFERENCES categorias(id),
  titulo              VARCHAR(120) NOT NULL,
  descricao           TEXT NOT NULL,
  preco               NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  aceita_troca        BOOLEAN NOT NULL DEFAULT FALSE,
  estado_conservacao  VARCHAR(20) NOT NULL
                        CHECK (estado_conservacao IN ('novo','seminovo','usado','para-reparo')),
  cep                 VARCHAR(8) NOT NULL,
  bairro              VARCHAR(80),
  status              VARCHAR(20) NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo','reservado','em-negociacao','vendido','pausado','expirado')),
  data_criacao        TIMESTAMP NOT NULL DEFAULT NOW(),
  data_atualizacao    TIMESTAMP NOT NULL DEFAULT NOW(),
  data_expiracao      TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '60 days'),
  visualizacoes       INTEGER NOT NULL DEFAULT 0,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7)
);

CREATE TABLE anuncio_imagens (
  id            SERIAL PRIMARY KEY,
  anuncio_id    INTEGER NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  imagem        TEXT NOT NULL,
  ordem         INTEGER NOT NULL DEFAULT 0,
  is_principal  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE conversas (
  id                  SERIAL PRIMARY KEY,
  anuncio_id          INTEGER NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  comprador_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vendedor_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em           TIMESTAMP NOT NULL DEFAULT NOW(),
  ultima_mensagem_em  TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (comprador_id <> vendedor_id),
  UNIQUE (anuncio_id, comprador_id)
);

CREATE TABLE mensagens (
  id           BIGSERIAL PRIMARY KEY,
  conversa_id  INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  remetente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conteudo     TEXT NOT NULL CHECK (length(trim(conteudo)) > 0),
  lida         BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE compras (
  id                 SERIAL PRIMARY KEY,
  anuncio_id         INTEGER NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  comprador_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vendedor_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  preco              NUMERIC(10,2) NOT NULL,
  payment_id         VARCHAR(60) UNIQUE,
  status             VARCHAR(30) NOT NULL DEFAULT 'aguardando',
  metodo_pagamento   VARCHAR(40),
  parcelas           INTEGER,
  avaliado           BOOLEAN NOT NULL DEFAULT FALSE,
  criada_em          TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizada_em      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE avaliacoes (
  id            SERIAL PRIMARY KEY,
  compra_id     INTEGER NOT NULL UNIQUE REFERENCES compras(id) ON DELETE CASCADE,
  avaliador_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  avaliado_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nota          SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario    TEXT,
  criada_em     TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (avaliador_id <> avaliado_id)
);

CREATE TABLE denuncias (
  id                     SERIAL PRIMARY KEY,
  denunciante_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anuncio_id             INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
  usuario_denunciado_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  motivo                 VARCHAR(30) NOT NULL
                           CHECK (motivo IN ('conteudo_inadequado','fraude','violacao_termos','outro')),
  descricao              TEXT,
  status                 VARCHAR(20) NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente','em_analise','resolvida','arquivada')),
  resolucao              TEXT,
  resolvida_por          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criada_em              TIMESTAMP NOT NULL DEFAULT NOW(),
  resolvida_em           TIMESTAMP,
  CHECK (anuncio_id IS NOT NULL OR usuario_denunciado_id IS NOT NULL)
);

CREATE TABLE logs_auditoria (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao        VARCHAR(50) NOT NULL,
  alvo_tipo   VARCHAR(20) NOT NULL,
  alvo_id     INTEGER,
  detalhes    JSONB,
  criada_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_papel       ON usuarios(papel);
CREATE INDEX idx_anuncios_status      ON anuncios(status);
CREATE INDEX idx_anuncios_categoria   ON anuncios(categoria_id);
CREATE INDEX idx_anuncios_vendedor    ON anuncios(vendedor_id);
CREATE INDEX idx_anuncios_cep         ON anuncios(cep);
CREATE INDEX idx_imagens_anuncio      ON anuncio_imagens(anuncio_id);
CREATE INDEX idx_conversas_comprador  ON conversas(comprador_id, ultima_mensagem_em DESC);
CREATE INDEX idx_conversas_vendedor   ON conversas(vendedor_id, ultima_mensagem_em DESC);
CREATE INDEX idx_mensagens_conversa   ON mensagens(conversa_id, id DESC);
CREATE INDEX idx_mensagens_nao_lidas  ON mensagens(conversa_id, remetente_id) WHERE lida = FALSE;
CREATE INDEX idx_compras_comprador    ON compras(comprador_id, criada_em DESC);
CREATE INDEX idx_compras_vendedor     ON compras(vendedor_id, criada_em DESC);
CREATE INDEX idx_compras_payment      ON compras(payment_id);
CREATE INDEX idx_avaliacoes_avaliado  ON avaliacoes(avaliado_id, criada_em DESC);
CREATE INDEX idx_denuncias_status     ON denuncias(status, criada_em DESC);
CREATE INDEX idx_denuncias_anuncio    ON denuncias(anuncio_id);
CREATE INDEX idx_denuncias_denunciado ON denuncias(usuario_denunciado_id);
CREATE INDEX idx_logs_criada_em       ON logs_auditoria(criada_em DESC);
CREATE INDEX idx_logs_admin           ON logs_auditoria(admin_id);

-- ============================================================
-- Categorias iniciais (necessárias para publicar anúncios)
-- ============================================================
INSERT INTO categorias (nome, slug, icone, categoria_pai, ordem) VALUES
  ('Móveis',            'moveis',            'sofa',      NULL, 1),
  ('Eletrônicos',       'eletronicos',       'tv',        NULL, 2),
  ('Roupas e Acessórios','roupas',           'shirt',     NULL, 3),
  ('Livros',            'livros',            'book',      NULL, 4),
  ('Utensílios de Casa','utensilios-casa',   'utensils',  NULL, 5),
  ('Esporte e Lazer',   'esporte-lazer',     'ball',      NULL, 6),
  ('Infantil',          'infantil',          'baby',      NULL, 7),
  ('Outros',            'outros',            'box',       NULL, 8);
