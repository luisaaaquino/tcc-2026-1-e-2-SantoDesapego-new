jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/email', () => ({ enviarEmail: jest.fn() }));
jest.mock('../utils/verificacao', () => ({
  criarDesafio: jest.fn(async () => ({ desafio: 'abc', email_mascarado: 'an***@teste.com', finalidade: 'cadastro' })),
  verificarCodigo: jest.fn(),
  reenviarCodigo: jest.fn(),
}));

const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../db');
const { criarDesafio } = require('../utils/verificacao');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');
const { montarApp, linhas } = require('./helpers');

const app = montarApp(require('../routes/auth'));

const cadastroValido = (extra = {}) => ({
  nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com', senha: 'Desapego@2026',
  cpf: '52998224725', data_nascimento: '1995-07-14', cep: '04710150', bairro: 'Santo Amaro Centro', aceita_termos: true,
  ...extra,
});

const cadastrar = (dados) => request(app).post('/api/auth/cadastro').send(dados);
const insertDoCadastro = () => pool.query.mock.calls.find(([sql]) => /INSERT INTO usuarios/.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue(linhas({ id: 1, nome: 'Ana', email: 'ana@teste.com' }));
});

describe('RN02 - Verificação de Identidade (Compliance)', () => {
  test('cadastro com CPF válido é aceito', async () => {
    const res = await cadastrar(cadastroValido());
    expect(res.status).toBe(201);
  });

  test('cadastro com CPF de dígitos verificadores inválidos é recusado', async () => {
    const res = await cadastrar(cadastroValido({ cpf: '12345678900' }));
    expect(res.status).toBe(400);
  });

  test('cadastro com CPF de dígitos repetidos (111.111.111-11) é recusado', async () => {
    const res = await cadastrar(cadastroValido({ cpf: '11111111111' }));
    expect(res.status).toBe(400);
  });

  test('CPF ou e-mail já cadastrado é recusado (unicidade)', async () => {
    pool.query.mockRejectedValueOnce(Object.assign(new Error('duplicado'), { code: '23505' }));
    const res = await cadastrar(cadastroValido());
    expect(res.status).toBe(409);
  });

  test('primeiro acesso exige confirmar o e-mail por código (cadastro não devolve sessão)', async () => {
    const res = await cadastrar(cadastroValido());
    expect(criarDesafio).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'cadastro');
    expect(res.body.verificacao.desafio).toBe('abc');
    expect(res.body.token).toBeUndefined();
  });

  test('conta suspensa pelo administrador não consegue entrar', async () => {
    pool.query.mockResolvedValueOnce(linhas({
      id: 1, email: 'ana@teste.com', senha: bcrypt.hashSync('Desapego@2026', 4), status_conta: 'suspensa',
    }));
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@teste.com', senha: 'Desapego@2026' });
    expect(res.status).toBe(403);
    expect(res.body.erro).toMatch(/suspensa/);
  });
});

describe('RN03 - Política de Senhas Robustas', () => {
  test('cadastro com senha fraca é recusado pela API', async () => {
    const res = await cadastrar(cadastroValido({ senha: 'ana12345' }));
    expect(res.status).toBe(400);
    expect(insertDoCadastro()).toBeUndefined();
  });

  test('a senha é guardada criptografada (hash bcrypt), nunca em texto puro', async () => {
    await cadastrar(cadastroValido());
    const params = insertDoCadastro()[1];
    expect(params).not.toContain('Desapego@2026');
    expect(params[4]).toMatch(/^\$2[aby]\$/);
  });
});

describe('RN11 - Consentimento Livre e Esclarecido', () => {
  test('cadastro sem aceitar os Termos de Uso é recusado', async () => {
    const res = await cadastrar(cadastroValido({ aceita_termos: false }));
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Termos de Uso/);
    expect(insertDoCadastro()).toBeUndefined();
  });

  test('o aceite registra data/hora (timestamp) e a versão dos termos', async () => {
    await cadastrar(cadastroValido());
    const [sql, params] = insertDoCadastro();
    expect(sql).toMatch(/termos_aceitos_em/);
    expect(sql).toMatch(/NOW\(\)/);
    expect(params).toContain(TERMOS_VERSAO_ATUAL);
  });
});

describe('RN12 - Minimização de Dados', () => {
  test('dados sensíveis enviados no cadastro são descartados', async () => {
    await cadastrar(cadastroValido({ origem_racial: 'parda', religiao: 'católica', biometria: 'xyz' }));
    const [sql, params] = insertDoCadastro();
    expect(sql).not.toMatch(/racial|religiao|biometria/);
    expect(params).not.toEqual(expect.arrayContaining(['parda', 'católica', 'xyz']));
  });

  test('o cadastro grava só os campos necessários (16 colunas)', async () => {
    await cadastrar(cadastroValido());
    const colunas = insertDoCadastro()[0].match(/\(([^)]+)\)\s*VALUES/s)[1].split(',').map((c) => c.trim());
    expect(colunas).toEqual([
      'nome', 'sobrenome', 'telefone', 'email', 'senha', 'cep', 'logradouro', 'numero', 'complemento',
      'bairro', 'cpf', 'data_nascimento', 'aceita_termos', 'recebe_newsletter', 'termos_versao', 'termos_aceitos_em',
    ]);
  });
});

describe('RF27 - Verificação de Maioridade', () => {
  // Datas relativas a hoje, para o teste valer em qualquer dia em que rodar
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const anosAtras = (anos, diasAMais = 0) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - anos);
    d.setDate(d.getDate() + diasAMais);
    return iso(d);
  };

  test('a data de nascimento completa é gravada no cadastro', async () => {
    const res = await cadastrar(cadastroValido({ data_nascimento: '1995-07-14' }));
    expect(res.status).toBe(201);
    expect(insertDoCadastro()[1]).toContain('1995-07-14');
  });

  test('quem completa 18 anos hoje já consegue se cadastrar', async () => {
    expect((await cadastrar(cadastroValido({ data_nascimento: anosAtras(18) }))).status).toBe(201);
  });

  test('quem só completa 18 anos amanhã ainda tem o cadastro bloqueado', async () => {
    const res = await cadastrar(cadastroValido({ data_nascimento: anosAtras(18, 1) }));
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('É preciso ter 18 anos ou mais para se cadastrar no Santo Desapego.');
    expect(insertDoCadastro()).toBeUndefined();
  });

  test('cadastro sem a data de nascimento é recusado', async () => {
    const res = await cadastrar(cadastroValido({ data_nascimento: undefined }));
    expect(res.status).toBe(400);
    expect(insertDoCadastro()).toBeUndefined();
  });

  test.each([
    ['data que não existe (30/02)', '2000-02-30'],
    ['data no futuro', anosAtras(-1)],
    ['antes de 1900', '1850-05-10'],
    ['no formato dd/mm/aaaa', '14/07/1995'],
    ['só o ano', '1995'],
  ])('%s é recusada', async (_caso, data) => {
    expect((await cadastrar(cadastroValido({ data_nascimento: data }))).status).toBe(400);
  });

  test('a data aparece na exportação de dados da LGPD', () => {
    const rota = require('fs').readFileSync(require.resolve('../routes/usuario'), 'utf8');
    const exportar = rota.slice(rota.indexOf("'/api/usuario/exportar'"));
    expect(exportar.slice(0, 600)).toMatch(/data_nascimento/);
  });
});
