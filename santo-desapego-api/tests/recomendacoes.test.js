jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const pool = require('../db');
const { montarApp, tokenDe, linhas } = require('./helpers');

const app = montarApp(require('../routes/recomendacoes'));

const anuncio = (id, preco, bairro, dias = 0) => ({
  id, titulo: `Item ${id}`, preco: String(preco), estado_conservacao: 'usado', bairro, status: 'ativo',
  data_criacao: new Date(Date.now() - dias * 86400000).toISOString(), categoria_nome: 'Mesas e cadeiras',
  vendedor_recebe_pagamentos: true, imagem_principal: null,
});

beforeEach(() => jest.clearAllMocks());

describe('RF24 - Seção "Para você" (recomendações da Home)', () => {
  test('exige usuário logado', async () => {
    const res = await request(app).get('/api/recomendacoes');
    expect(res.status).toBe(401);
  });

  test('sem nada visualizado, devolve lista vazia (a seção não aparece)', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ bairro: 'Campo Belo' }))  // perfil
      .mockResolvedValueOnce(linhas());                          // nenhum clique
    const res = await request(app).get('/api/recomendacoes').set('Authorization', tokenDe(7));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ anuncios: [], categorias: [] });
    expect(pool.query).toHaveBeenCalledTimes(2);                 // nem consulta anúncios
  });

  test('busca só anúncios ativos de outros vendedores, nas categorias que a pessoa viu', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ bairro: 'Campo Belo' }))
      .mockResolvedValueOnce(linhas({ familia: 1, familia_nome: 'Móveis', preco: '200.00' }))
      .mockResolvedValueOnce(linhas(anuncio(10, 150, 'Campo Belo')));
    const res = await request(app).get('/api/recomendacoes').set('Authorization', tokenDe(7));

    expect(res.status).toBe(200);
    expect(res.body.categorias).toEqual(['Móveis']);
    const [sql, params] = pool.query.mock.calls[2];
    expect(sql).toMatch(/a\.status = 'ativo'/);
    expect(sql).toMatch(/a\.vendedor_id <> \$1/);
    expect(params).toEqual([7, [1]]);
  });

  test('prioriza a faixa de preço vista e, dentro dela, o bairro mais perto', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ bairro: 'Campo Belo' }))
      .mockResolvedValueOnce(linhas({ familia: 1, familia_nome: 'Móveis', preco: '100.00' }))  // teto = 150
      .mockResolvedValueOnce(linhas(
        anuncio(1, 900, 'Campo Belo'),          // fora da faixa
        anuncio(2, 120, 'Socorro'),             // na faixa, longe
        anuncio(3, 90, 'Campo Belo'),           // na faixa, no bairro
      ));
    const res = await request(app).get('/api/recomendacoes').set('Authorization', tokenDe(7));
    expect(res.body.anuncios.map((a) => a.id)).toEqual([3, 2, 1]);
  });

  test('devolve no máximo 5 anúncios (uma linha)', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ bairro: null }))
      .mockResolvedValueOnce(linhas({ familia: 1, familia_nome: 'Móveis', preco: '100.00' }))
      .mockResolvedValueOnce(linhas(...Array.from({ length: 12 }, (_, i) => anuncio(i + 1, 50, 'Campo Belo', i))));
    const res = await request(app).get('/api/recomendacoes').set('Authorization', tokenDe(7));
    expect(res.body.anuncios).toHaveLength(5);
  });

  test.each([
    ['20', 20],   // tela do anúncio pede 20
    ['99', 20],   // acima do máximo: corta em 20
    ['0', 1],     // abaixo do mínimo: sobe para 1
    ['abc', 5],   // inválido: usa o padrão da Home
  ])('?limite=%s devolve %i anúncios', async (pedido, esperado) => {
    pool.query
      .mockResolvedValueOnce(linhas({ bairro: null }))
      .mockResolvedValueOnce(linhas({ familia: 1, familia_nome: 'Móveis', preco: '100.00' }))
      .mockResolvedValueOnce(linhas(...Array.from({ length: 30 }, (_, i) => anuncio(i + 1, 50, 'Campo Belo', i))));
    const res = await request(app).get(`/api/recomendacoes?limite=${pedido}`).set('Authorization', tokenDe(7));
    expect(res.body.anuncios).toHaveLength(esperado);
  });

  test('erro no banco responde 500 sem derrubar a página', async () => {
    pool.query.mockRejectedValueOnce(new Error('banco fora do ar'));
    const res = await request(app).get('/api/recomendacoes').set('Authorization', tokenDe(7));
    expect(res.status).toBe(500);
  });
});
