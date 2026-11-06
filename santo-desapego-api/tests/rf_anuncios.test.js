jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const pool = require('../db');
const { validarDadosAnuncio, inserirAnuncio } = require('../services/anuncioService');
const { montarApp, tokenDe, linhas } = require('./helpers');

const app = montarApp(require('../routes/anuncios'));
const appCategorias = montarApp(require('../routes/categorias'));

const VENDEDOR = 2;
const OUTRO = 9;
const IMAGEM = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const anuncioValido = (extra = {}) => ({
  titulo: 'Bicicleta aro 29',
  descricao: 'Bicicleta em bom estado, pouco usada, com marchas Shimano.',
  preco: 800,
  estado_conservacao: 'usado',
  categoria_id: 3,
  cep: '04710-150',
  bairro: 'Santo Amaro Centro',
  imagens: [IMAGEM],
  ...extra,
});

// Cliente de transação simulado (pool.connect)
const clienteTransacao = (respostas = {}) => {
  const client = {
    query: jest.fn(async (sql) => {
      for (const [padrao, resposta] of Object.entries(respostas)) {
        if (new RegExp(padrao).test(sql)) return resposta;
      }
      return linhas({ id: 3 });
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

const sqlsExecutados = (fn) => fn.mock.calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
});

/* ─────────────────────────────────────────────────────────── */
describe('RF06 - Anúncio de Produtos', () => {
  test('vendedor logado publica anúncio manual e ele nasce ativo', async () => {
    pool.query.mockResolvedValue(linhas({ id: 3 }));
    clienteTransacao({ 'INSERT INTO anuncios': linhas({ id: 50, titulo: 'Bicicleta aro 29', status: 'ativo' }) });

    const res = await request(app).post('/api/anuncios').set('Authorization', tokenDe(VENDEDOR)).send(anuncioValido());

    expect(res.status).toBe(201);
    expect(res.body.anuncio.status).toBe('ativo');
  });

  test('visitante sem login não publica anúncio', async () => {
    const res = await request(app).post('/api/anuncios').send(anuncioValido());
    expect(res.status).toBe(401);
  });

  test('título com menos de 5 caracteres é recusado', async () => {
    const res = await request(app).post('/api/anuncios').set('Authorization', tokenDe(VENDEDOR))
      .send(anuncioValido({ titulo: 'Bike' }));
    expect(res.status).toBe(400);
  });

  test('descrição com menos de 20 caracteres é recusada', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ descricao: 'Bike boa' }))).toMatch(/Descrição/);
  });

  test('preço precisa ser informado', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ preco: 0 }))).toMatch(/preço/);
  });

  test('categoria inexistente é recusada', async () => {
    pool.query.mockResolvedValue(linhas());
    expect(await validarDadosAnuncio(anuncioValido({ categoria_id: 999 }))).toMatch(/Categoria inválida/);
  });

  test('página do anúncio traz os dados e as fotos com a principal primeiro', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ id: 50, titulo: 'Bicicleta aro 29', status: 'ativo' }))
      .mockResolvedValueOnce(linhas({ imagem: 'principal' }, { imagem: 'segunda' }));

    const res = await request(app).get('/api/anuncios/50');

    expect(res.status).toBe(200);
    expect(res.body.anuncio.imagens).toEqual(['principal', 'segunda']);
    expect(pool.query.mock.calls[1][0]).toMatch(/ORDER BY is_principal DESC/);
  });

  test('anúncio inexistente retorna 404', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(app).get('/api/anuncios/999');
    expect(res.status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF07 - Busca por Filtros', () => {
  const buscar = (query) => {
    pool.query.mockImplementation(async (sql) => (/COUNT\(\*\)/.test(sql) ? linhas({ count: '25' }) : linhas()));
    return request(app).get('/api/anuncios').query(query);
  };
  const consultaPrincipal = () => pool.query.mock.calls[0];

  test('a busca só mostra anúncios ativos', async () => {
    await buscar({});
    expect(consultaPrincipal()[0]).toMatch(/a\.status = 'ativo'/);
  });

  test('filtro por categoria inclui as subcategorias dela', async () => {
    await buscar({ categoria_id: 1 });
    const [sql, params] = consultaPrincipal();
    expect(sql).toMatch(/a\.categoria_id = \$1 OR c\.categoria_pai = \$1/);
    expect(params[0]).toBe('1');
  });

  test('filtro por faixa de preço (mínimo e máximo)', async () => {
    await buscar({ preco_min: 100, preco_max: 500 });
    const [sql, params] = consultaPrincipal();
    expect(sql).toMatch(/a\.preco >= \$1/);
    expect(sql).toMatch(/a\.preco <= \$2/);
    expect(params.slice(0, 2)).toEqual(['100', '500']);
  });

  test('filtro por estado de conservação aceita mais de um estado', async () => {
    await buscar({ estado_conservacao: 'usado,seminovo' });
    const [sql, params] = consultaPrincipal();
    expect(sql).toMatch(/estado_conservacao = ANY/);
    expect(params[0]).toEqual(['usado', 'seminovo']);
  });

  test('busca por texto ignora acentos, maiúsculas e ordem das palavras', async () => {
    await buscar({ busca: 'Geladéira  BRASTEMP' });
    const params = consultaPrincipal()[1];
    expect(params.slice(0, 2)).toEqual(['%geladeira%', '%brastemp%']);
  });

  test('ordenação por menor preço', async () => {
    await buscar({ ordenacao: 'preco-menor' });
    expect(consultaPrincipal()[0]).toMatch(/ORDER BY a\.preco ASC/);
  });

  test('ordenação por maior preço', async () => {
    await buscar({ ordenacao: 'preco-maior' });
    expect(consultaPrincipal()[0]).toMatch(/ORDER BY a\.preco DESC/);
  });

  test('paginação calcula o total de páginas com os mesmos filtros', async () => {
    const res = await buscar({ preco_max: 500, limite: 12 });
    expect(res.body.paginacao).toMatchObject({ total_itens: 25, total_paginas: 3 });
    const contagem = pool.query.mock.calls.find(([sql]) => /COUNT\(\*\)/.test(sql));
    expect(contagem[0]).toMatch(/a\.preco <= \$1/);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF08 - Busca Geolocalizada por Proximidade', () => {
  const anuncios = [
    { id: 1, bairro: 'Brooklin', data_criacao: '2026-10-01' },
    { id: 2, bairro: 'Bairro Desconhecido', data_criacao: '2026-10-03' },
    { id: 3, bairro: 'Santo Amaro Centro', data_criacao: '2026-10-02' },
    { id: 4, bairro: 'Granja Julieta', data_criacao: '2026-10-04' },
  ];

  test('ordena do bairro mais perto para o mais longe', async () => {
    pool.query.mockResolvedValue(linhas(...anuncios));
    const res = await request(app).get('/api/anuncios')
      .query({ ordenacao: 'distancia', origem_bairro: 'Santo Amaro Centro' });

    expect(res.body.anuncios.map((a) => a.id)).toEqual([3, 4, 1, 2]);
    expect(res.body.anuncios[0].distancia_km).toBe(0);
  });

  test('anúncio de bairro sem coordenadas vai para o fim da lista', async () => {
    pool.query.mockResolvedValue(linhas(...anuncios));
    const res = await request(app).get('/api/anuncios')
      .query({ ordenacao: 'distancia', origem_bairro: 'Brooklin' });

    const ultimo = res.body.anuncios[res.body.anuncios.length - 1];
    expect(ultimo.id).toBe(2);
    expect(ultimo.distancia_km).toBeNull();
  });

  test('usa o bairro do comprador logado quando nenhum bairro é informado', async () => {
    pool.query.mockImplementation(async (sql) => (
      /SELECT bairro FROM usuarios/.test(sql) ? linhas({ bairro: 'Granja Julieta' }) : linhas(...anuncios)
    ));
    const res = await request(app).get('/api/anuncios')
      .set('Authorization', tokenDe(1)).query({ ordenacao: 'distancia' });

    expect(res.body.anuncios[0].id).toBe(4);
  });

  test('filtra anúncios por bairro', async () => {
    pool.query.mockImplementation(async (sql) => (/COUNT\(\*\)/.test(sql) ? linhas({ count: '0' }) : linhas()));
    await request(app).get('/api/anuncios').query({ bairro: 'Brooklin' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/a\.bairro = \$1/);
    expect(params[0]).toBe('Brooklin');
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF09 - Categorização Hierárquica de Produtos', () => {
  const categorias = [
    { id: 1, nome: 'Eletrônicos', categoria_pai: null, ordem: 1 },
    { id: 2, nome: 'Móveis & Casa', categoria_pai: null, ordem: 2 },
    { id: 10, nome: 'Celulares', categoria_pai: 1, ordem: 1 },
    { id: 11, nome: 'Notebooks', categoria_pai: 1, ordem: 2 },
    { id: 20, nome: 'Sofás', categoria_pai: 2, ordem: 1 },
  ];

  test('organiza as subcategorias dentro da categoria principal', async () => {
    pool.query.mockResolvedValueOnce(linhas(...categorias));
    const res = await request(appCategorias).get('/api/categorias');

    const eletronicos = res.body.categorias.find((c) => c.nome === 'Eletrônicos');
    expect(eletronicos.subcategorias.map((s) => s.nome)).toEqual(['Celulares', 'Notebooks']);
  });

  test('subcategoria não aparece como categoria principal', async () => {
    pool.query.mockResolvedValueOnce(linhas(...categorias));
    const res = await request(appCategorias).get('/api/categorias');
    expect(res.body.categorias.map((c) => c.nome)).toEqual(['Eletrônicos', 'Móveis & Casa']);
  });

  test('erro no banco devolve mensagem amigável', async () => {
    pool.query.mockRejectedValueOnce(new Error('fora do ar'));
    const res = await request(appCategorias).get('/api/categorias');
    expect(res.status).toBe(500);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF11 - Upload e Gestão de Imagens', () => {
  beforeEach(() => pool.query.mockResolvedValue(linhas({ id: 3 })));

  test('aceita de 1 a 6 imagens', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ imagens: [IMAGEM] }))).toBeNull();
    expect(await validarDadosAnuncio(anuncioValido({ imagens: Array(6).fill(IMAGEM) }))).toBeNull();
  });

  test('recusa anúncio sem imagem', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ imagens: [] }))).toMatch(/pelo menos 1 imagem/);
  });

  test('recusa mais de 6 imagens', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ imagens: Array(7).fill(IMAGEM) }))).toMatch(/Máximo de 6/);
  });

  test('recusa imagens acima de 5 MB no total', async () => {
    const grande = `data:image/jpeg;base64,${'A'.repeat(3 * 1024 * 1024)}`;
    expect(await validarDadosAnuncio(anuncioValido({ imagens: [grande, grande] }))).toMatch(/muito grandes/);
  });

  test('recusa arquivo que não é imagem', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ imagens: ['data:application/pdf;base64,JVBERi0='] })))
      .toMatch(/formato inválido/);
  });

  test('a primeira imagem vira a capa (principal) do anúncio', async () => {
    const client = clienteTransacao({ 'INSERT INTO anuncios': linhas({ id: 50 }) });
    await inserirAnuncio({ vendedorId: VENDEDOR, ...anuncioValido({ imagens: ['img1', 'img2', 'img3'] }) });

    const inserts = client.query.mock.calls.filter(([sql]) => /INSERT INTO anuncio_imagens/.test(sql));
    expect(inserts.map(([, p]) => p[3])).toEqual([true, false, false]);
    expect(inserts.map(([, p]) => p[2])).toEqual([0, 1, 2]);
  });

  test('se gravar uma imagem falhar, nada do anúncio é salvo (ROLLBACK)', async () => {
    const client = clienteTransacao({ 'INSERT INTO anuncios': linhas({ id: 50 }) });
    client.query.mockImplementation(async (sql) => {
      if (/INSERT INTO anuncio_imagens/.test(sql)) throw new Error('falhou');
      return linhas({ id: 50 });
    });

    await expect(inserirAnuncio({ vendedorId: VENDEDOR, ...anuncioValido() })).rejects.toThrow();
    expect(sqlsExecutados(client.query)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF12 - Gestão do Ciclo de Vida do Anúncio', () => {
  const editar = (usuario, dados) => request(app).put('/api/anuncios/50')
    .set('Authorization', tokenDe(usuario)).send(dados);

  test('vendedor edita o próprio anúncio', async () => {
    const client = clienteTransacao({
      'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'ativo' }),
      'UPDATE anuncios SET': linhas({ id: 50, titulo: 'Bicicleta aro 29' }),
    });
    const res = await editar(VENDEDOR, anuncioValido());

    expect(res.status).toBe(200);
    expect(sqlsExecutados(client.query)).toContain('COMMIT');
  });

  test('editar com novas fotos substitui as antigas', async () => {
    const client = clienteTransacao({
      'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'ativo' }),
      'UPDATE anuncios SET': linhas({ id: 50 }),
    });
    await editar(VENDEDOR, anuncioValido({ imagens: [IMAGEM, IMAGEM] }));

    const sqls = sqlsExecutados(client.query);
    expect(sqls.some((s) => /DELETE FROM anuncio_imagens/.test(s))).toBe(true);
    expect(sqls.filter((s) => /INSERT INTO anuncio_imagens/.test(s))).toHaveLength(2);
  });

  test('editar sem mandar fotos mantém as fotos atuais', async () => {
    const client = clienteTransacao({
      'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'ativo' }),
      'UPDATE anuncios SET': linhas({ id: 50 }),
    });
    await editar(VENDEDOR, anuncioValido({ imagens: undefined }));
    expect(sqlsExecutados(client.query).some((s) => /anuncio_imagens/.test(s))).toBe(false);
  });

  test('não edita anúncio de outro vendedor', async () => {
    clienteTransacao({ 'SELECT vendedor_id': linhas({ vendedor_id: OUTRO, status: 'ativo' }) });
    expect((await editar(VENDEDOR, anuncioValido())).status).toBe(403);
  });

  test('não edita anúncio já vendido', async () => {
    clienteTransacao({ 'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'vendido' }) });
    expect((await editar(VENDEDOR, anuncioValido())).status).toBe(400);
  });

  test('edição passa pelas mesmas regras do cadastro (CEP fora da área)', async () => {
    clienteTransacao({ 'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'ativo' }) });
    const res = await editar(VENDEDOR, anuncioValido({ cep: '01310-100' }));
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/\[RN01\]/);
  });

  test('edição sem CEP é recusada com mensagem de validação', async () => {
    clienteTransacao({ 'SELECT vendedor_id': linhas({ vendedor_id: VENDEDOR, status: 'ativo' }) });
    const res = await editar(VENDEDOR, anuncioValido({ cep: undefined }));
    expect(res.status).toBe(400);
  });

  test('pausa um anúncio ativo', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, status: 'ativo' })).mockResolvedValueOnce(linhas());
    const res = await request(app).put('/api/anuncios/50/pausar').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[1][0]).toMatch(/status = 'pausado'/);
  });

  test('só pausa anúncio que está ativo', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, status: 'expirado' }));
    const res = await request(app).put('/api/anuncios/50/pausar').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(400);
  });

  test('reativa um anúncio pausado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, status: 'pausado' })).mockResolvedValueOnce(linhas());
    const res = await request(app).put('/api/anuncios/50/reativar').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[1][0]).toMatch(/status = 'ativo'/);
  });

  test('anúncio expirado não é reativado: precisa ser renovado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, status: 'expirado' }));
    const res = await request(app).put('/api/anuncios/50/reativar').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/renovados/);
  });

  test('exclui anúncio sem compras', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, titulo: 'Bicicleta' }))
      .mockResolvedValueOnce(linhas({ count: '0' }))
      .mockResolvedValueOnce(linhas());
    const res = await request(app).delete('/api/anuncios/50').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[2][0]).toMatch(/DELETE FROM anuncios/);
  });

  test('anúncio com compras não pode ser excluído (preserva o histórico)', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR, titulo: 'Bicicleta' }))
      .mockResolvedValueOnce(linhas({ count: '1' }));
    const res = await request(app).delete('/api/anuncios/50').set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(409);
  });

  test.each([
    ['pausar', 'put', '/api/anuncios/50/pausar'],
    ['reativar', 'put', '/api/anuncios/50/reativar'],
    ['excluir', 'delete', '/api/anuncios/50'],
  ])('não deixa %s anúncio de outro vendedor', async (_acao, metodo, url) => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: OUTRO, status: 'pausado', titulo: 'x' }));
    const res = await request(app)[metodo](url).set('Authorization', tokenDe(VENDEDOR));
    expect(res.status).toBe(403);
  });
});
