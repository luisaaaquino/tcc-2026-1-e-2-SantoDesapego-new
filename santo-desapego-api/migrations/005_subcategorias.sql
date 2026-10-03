-- ============================================================
-- 005_subcategorias.sql
-- O schema só criava as 8 categorias principais, sem nenhuma
-- subcategoria. Com isso o campo "Subcategoria" do formulário de
-- anúncio ficava sempre desabilitado e os agentes de IA (que só
-- escolhem entre subcategorias — ver services/categoriasCache.js)
-- recebiam uma lista vazia.
--
-- Idempotente: pode rodar mais de uma vez (ON CONFLICT no slug).
--
-- Rodar uma vez no banco já existente:
--   psql -U postgres -d santo_desapego -f migrations/005_subcategorias.sql
-- ============================================================

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
