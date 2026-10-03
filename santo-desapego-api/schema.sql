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
  termos_versao      VARCHAR(20),
  termos_aceitos_em  TIMESTAMP,
  recebe_newsletter  BOOLEAN       DEFAULT FALSE,
  foto_perfil        TEXT,
  data_cadastro      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  papel              VARCHAR(20)   NOT NULL DEFAULT 'usuario' CHECK (papel IN ('usuario','administrador')),
  status_conta       VARCHAR(20)   NOT NULL DEFAULT 'ativa' CHECK (status_conta IN ('ativa','suspensa')),
  reset_senha_token  VARCHAR(255),
  reset_senha_expira TIMESTAMP,
  anonimizada_em     TIMESTAMP,

  -- Mercado Pago Marketplace [split de pagamento] — credenciais OAuth da
  -- conta MP do próprio vendedor, usadas pra criar a preference da venda
  -- dele e reter a comissão da plataforma via marketplace_fee.
  mp_user_id         BIGINT,
  mp_access_token    TEXT,
  mp_refresh_token   TEXT,
  mp_public_key      TEXT,
  mp_token_expira_em TIMESTAMPTZ,
  mp_conectado       BOOLEAN       NOT NULL DEFAULT FALSE
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

-- Notificações — in-app e disparo de e-mail [RF18]
CREATE TABLE notificacoes (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(30) NOT NULL
                CHECK (tipo IN ('nova_mensagem','intencao_compra','pagamento_confirmado','avaliacao_pendente','anuncio_expirando')),
  titulo      VARCHAR(150) NOT NULL,
  mensagem    TEXT NOT NULL,
  link        VARCHAR(255),
  lida        BOOLEAN NOT NULL DEFAULT FALSE,
  criada_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Central de Ajuda — mensagens de suporte enviadas por usuários aos administradores
CREATE TABLE mensagens_suporte (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  assunto        VARCHAR(30) NOT NULL
                   CHECK (assunto IN ('duvida_conta','anuncio','pagamento','denuncia_seguranca','outro')),
  mensagem       TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto','em_atendimento','respondido','encerrado')),
  resposta       TEXT,
  respondida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criada_em      TIMESTAMP NOT NULL DEFAULT NOW(),
  respondida_em  TIMESTAMP
);

CREATE TABLE favoritos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anuncio_id  INTEGER NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  criado_em   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, anuncio_id)
);

-- Agente de Anúncio (IA) — "Agente B" do case acadêmico agents-llm-senac-2026.
-- Ver migrations/002_indicios_moderacao.sql e 003_conversas_ia_anuncio.sql.
CREATE TABLE indicios_moderacao (
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

CREATE TABLE conversas_ia_anuncio (
  id            SERIAL PRIMARY KEY,
  vendedor_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado        JSONB NOT NULL,
  finalizado    BOOLEAN NOT NULL DEFAULT FALSE,
  status_final  VARCHAR(30),
  anuncio_id    INTEGER REFERENCES anuncios(id) ON DELETE SET NULL,
  criada_em     TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizada_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Agente de Compra (IA) — "Agente A" do case acadêmico agents-llm-senac-2026.
-- Ver migrations/004_cliques_comprador.sql.
CREATE TABLE cliques_comprador (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anuncio_id    INTEGER REFERENCES anuncios(id) ON DELETE SET NULL,
  categoria_id  INTEGER,
  preco         NUMERIC(10,2),
  bairro        VARCHAR(100),
  data_clique   TIMESTAMP NOT NULL DEFAULT NOW()
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
CREATE INDEX idx_suporte_status       ON mensagens_suporte(status, criada_em DESC);
CREATE INDEX idx_suporte_usuario      ON mensagens_suporte(usuario_id, criada_em DESC);
CREATE INDEX idx_notificacoes_usuario ON notificacoes(usuario_id, criada_em DESC);
CREATE INDEX idx_notificacoes_nao_lidas ON notificacoes(usuario_id) WHERE lida = FALSE;
CREATE INDEX idx_favoritos_usuario    ON favoritos(usuario_id, criado_em DESC);
CREATE INDEX idx_favoritos_anuncio    ON favoritos(anuncio_id);
CREATE INDEX idx_indicios_status      ON indicios_moderacao(status, data_criacao DESC);
CREATE INDEX idx_indicios_vendedor    ON indicios_moderacao(vendedor_id);
CREATE INDEX idx_conversas_ia_vendedor ON conversas_ia_anuncio(vendedor_id, atualizada_em DESC);
CREATE INDEX idx_cliques_comprador_usuario ON cliques_comprador(usuario_id, data_clique DESC);

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

-- Subcategorias (mesmo conteúdo de migrations/005_subcategorias.sql)
INSERT INTO categorias (nome, slug, icone, categoria_pai, ordem)
SELECT s.nome, s.slug, NULL, p.id, s.ordem
FROM (VALUES
  ('moveis',          'Sofás e poltronas',          'moveis-sofas-poltronas',        1),
  ('moveis',          'Mesas e cadeiras',           'moveis-mesas-cadeiras',         2),
  ('moveis',          'Camas e colchões',           'moveis-camas-colchoes',         3),
  ('moveis',          'Armários e estantes',        'moveis-armarios-estantes',      4),
  ('moveis',          'Escritório',                 'moveis-escritorio',             5),

  ('eletronicos',     'Celulares e tablets',        'eletronicos-celulares-tablets', 1),
  ('eletronicos',     'Computadores e notebooks',   'eletronicos-computadores',      2),
  ('eletronicos',     'TV e áudio',                 'eletronicos-tv-audio',          3),
  ('eletronicos',     'Videogames',                 'eletronicos-videogames',        4),
  ('eletronicos',     'Eletrodomésticos',           'eletronicos-eletrodomesticos',  5),

  ('roupas',          'Feminino',                   'roupas-feminino',               1),
  ('roupas',          'Masculino',                  'roupas-masculino',              2),
  ('roupas',          'Calçados',                   'roupas-calcados',               3),
  ('roupas',          'Bolsas e acessórios',        'roupas-bolsas-acessorios',      4),

  ('livros',          'Literatura',                 'livros-literatura',             1),
  ('livros',          'Didáticos e acadêmicos',     'livros-didaticos',              2),
  ('livros',          'Infantojuvenis',             'livros-infantojuvenis',         3),
  ('livros',          'Revistas e HQs',             'livros-revistas-hqs',           4),

  ('utensilios-casa', 'Cozinha',                    'casa-cozinha',                  1),
  ('utensilios-casa', 'Decoração',                  'casa-decoracao',                2),
  ('utensilios-casa', 'Cama, mesa e banho',         'casa-cama-mesa-banho',          3),
  ('utensilios-casa', 'Ferramentas e jardim',       'casa-ferramentas-jardim',       4),

  ('esporte-lazer',   'Bicicletas',                 'esporte-bicicletas',            1),
  ('esporte-lazer',   'Fitness e academia',         'esporte-fitness',               2),
  ('esporte-lazer',   'Camping e viagem',           'esporte-camping-viagem',        3),
  ('esporte-lazer',   'Instrumentos musicais',      'lazer-instrumentos-musicais',   4),
  ('esporte-lazer',   'Jogos de tabuleiro',         'lazer-jogos-tabuleiro',         5),

  ('infantil',        'Roupas infantis',            'infantil-roupas',               1),
  ('infantil',        'Brinquedos',                 'infantil-brinquedos',           2),
  ('infantil',        'Carrinhos e cadeirinhas',    'infantil-carrinhos',            3),
  ('infantil',        'Móveis infantis',            'infantil-moveis',               4),

  ('outros',          'Diversos',                   'outros-diversos',               1)
) AS s(pai_slug, nome, slug, ordem)
JOIN categorias p ON p.slug = s.pai_slug AND p.categoria_pai IS NULL
ON CONFLICT (slug) DO NOTHING;
