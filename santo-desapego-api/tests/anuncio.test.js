jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const pool = require('../db');
const { validarDadosAnuncio } = require('../services/anuncioService');
const { distanciaEntreBairros } = require('../utils/geolocalizacao');
const { montarApp, tokenDe, linhas } = require('./helpers');

const IMAGEM = 'data:image/png;base64,iVBORw0KGgo=';
const anuncioValido = (extra = {}) => ({
  titulo: 'Bicicleta aro 29',
  descricao: 'Bicicleta em bom estado, pouco usada, com marchas Shimano.',
  preco: 800,
  estado_conservacao: 'usado',
  categoria_id: 3,
  cep: '04710-150',
  imagens: [IMAGEM],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue(linhas({ id: 3 })); // categoria existe
});

describe('RN15 - Classificação de Estado de Conservação', () => {
  test.each(['novo', 'seminovo', 'usado', 'para-reparo'])('aceita o estado "%s"', async (estado) => {
    expect(await validarDadosAnuncio(anuncioValido({ estado_conservacao: estado }))).toBeNull();
  });

  test('recusa estado fora da escala (ex.: "bom estado")', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ estado_conservacao: 'bom estado' })))
      .toMatch(/Estado de conservação inválido/);
  });

  test('recusa anúncio sem estado de conservação', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ estado_conservacao: undefined })))
      .toMatch(/Estado de conservação inválido/);
  });
});

describe('RN01 - Restrição Geográfica de Anúncios', () => {
  test('publicação é bloqueada quando o CEP do anúncio está fora da área', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ cep: '01310-100' }))).toMatch(/\[RN01\]/);
  });

  test('publicação é bloqueada quando o anúncio vem sem CEP', async () => {
    expect(await validarDadosAnuncio(anuncioValido({ cep: '' }))).toMatch(/CEP não informado/);
  });
});

describe('RN09 - Moderação de Conteúdo', () => {
  test('anúncio com palavra proibida na descrição é bloqueado antes de publicar', async () => {
    const erro = await validarDadosAnuncio(anuncioValido({
      descricao: 'Acompanha munição e coldre, tudo original de fábrica.',
    }));
    expect(erro).toMatch(/\[RN09\]/);
  });
});

describe('RN07 - Ciclo de Vida do Anúncio', () => {
  const app = montarApp(require('../routes/anuncios'));

  test('renovação estende o anúncio por mais 60 dias e volta a ativo', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ vendedor_id: 1, status: 'expirado' }))
      .mockResolvedValueOnce(linhas({ data_expiracao: '2027-01-05' }));

    const res = await request(app).put('/api/anuncios/10/renovar').set('Authorization', tokenDe(1));

    expect(res.status).toBe(200);
    const sqlUpdate = pool.query.mock.calls[1][0];
    expect(sqlUpdate).toMatch(/status = 'ativo'/);
    expect(sqlUpdate).toMatch(/INTERVAL '60 days'/);
  });

  test('anúncio já vendido não pode ser renovado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: 1, status: 'vendido' }));
    const res = await request(app).put('/api/anuncios/10/renovar').set('Authorization', tokenDe(1));
    expect(res.status).toBe(400);
  });

  test('só o dono pode renovar o anúncio', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: 2, status: 'expirado' }));
    const res = await request(app).put('/api/anuncios/10/renovar').set('Authorization', tokenDe(1));
    expect(res.status).toBe(403);
  });
});

describe('RN13 - Priorização por Proximidade', () => {
  test('distância de um bairro para ele mesmo é zero', () => {
    expect(distanciaEntreBairros('Campo Belo', 'Campo Belo')).toBe(0);
  });

  test('calcula a distância entre bairros vizinhos (Jardim Cordeiro x Jardim Petrópolis, ~1 km)', () => {
    const d = distanciaEntreBairros('Jardim Cordeiro', 'Jardim Petrópolis');
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(2);
  });

  test('bairro mais distante fica com distância maior (ordenação por proximidade)', () => {
    const perto = distanciaEntreBairros('Santo Amaro Centro', 'Granja Julieta');
    const longe = distanciaEntreBairros('Santo Amaro Centro', 'Campo Belo');
    expect(perto).toBeLessThan(longe);
  });

  test('bairro fora da lista não recebe distância', () => {
    expect(distanciaEntreBairros('Campo Belo', 'Copacabana')).toBeNull();
  });

  test('o Brooklin não é bairro atendido (os CEPs dele ficam fora da faixa da RN01)', () => {
    expect(distanciaEntreBairros('Brooklin', 'Santo Amaro Centro')).toBeNull();
  });
});
