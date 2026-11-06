jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/email', () => ({ enviarEmail: jest.fn() }));

const crypto = require('crypto');
const pool = require('../db');
const { enviarEmail } = require('../utils/email');
const { criarDesafio, verificarCodigo, reenviarCodigo } = require('../utils/verificacao');
const { excluirOuAnonimizarUsuario } = require('../utils/usuarios');
const { linhas } = require('./helpers');

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Registro de código guardado no banco (codigos_verificacao)
const registro = (extra = {}) => ({
  id: 1, usuario_id: 5, codigo_hash: sha256('123456'), tentativas: 0, usado_em: null, expirado: false,
  ...extra,
});

const clienteComRegistro = (reg) => {
  const client = {
    query: jest.fn(async (sql) => (/FROM codigos_verificacao/.test(sql) ? linhas(...(reg ? [reg] : [])) : linhas())),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

beforeEach(() => jest.clearAllMocks());

describe('RN17 - Verificação em Duas Etapas', () => {
  test('o código enviado vale 10 minutos', async () => {
    pool.query.mockResolvedValue(linhas());
    await criarDesafio({ id: 5, nome: 'Ana', email: 'ana@teste.com' }, 'login');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/expira_em/);
    expect(params[4]).toBe('10');
    expect(enviarEmail).toHaveBeenCalled();
  });

  test('o código é guardado só como hash, nunca em texto puro', async () => {
    pool.query.mockResolvedValue(linhas());
    await criarDesafio({ id: 5, nome: 'Ana', email: 'ana@teste.com' }, 'login');
    const params = pool.query.mock.calls[0][1];
    expect(params[3]).toMatch(/^[a-f0-9]{64}$/);
  });

  test('código correto dentro da validade libera o acesso', async () => {
    clienteComRegistro(registro());
    expect(await verificarCodigo('desafio', '123456')).toEqual({ ok: true, usuarioId: 5 });
  });

  test('código expirado (mais de 10 minutos) é recusado', async () => {
    clienteComRegistro(registro({ expirado: true }));
    const r = await verificarCodigo('desafio', '123456');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/expirou/);
  });

  test('código errado gasta uma tentativa e informa quantas restam', async () => {
    const client = clienteComRegistro(registro({ tentativas: 2 }));
    const r = await verificarCodigo('desafio', '999999');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/mais 2 tentativa/);
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/SET tentativas = \$1/), [3, 1]);
  });

  test('depois de 5 tentativas nem o código certo é aceito', async () => {
    clienteComRegistro(registro({ tentativas: 5 }));
    const r = await verificarCodigo('desafio', '123456');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
  });

  test('código já usado não pode ser reutilizado', async () => {
    clienteComRegistro(registro({ usado_em: new Date() }));
    const r = await verificarCodigo('desafio', '123456');
    expect(r.ok).toBe(false);
  });

  test('reenvio antes de 60 segundos é bloqueado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ ...registro(), segundos: 20, finalidade: 'login', nome: 'Ana', email: 'a@t.com' }));
    const r = await reenviarCodigo('desafio');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(r.erro).toMatch(/Aguarde 40 segundos/);
  });

  test('reenvio depois de 60 segundos gera um novo código', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ ...registro(), segundos: 61, finalidade: 'login', nome: 'Ana', email: 'a@t.com' }))
      .mockResolvedValueOnce(linhas());
    const r = await reenviarCodigo('desafio');
    expect(r.ok).toBe(true);
    expect(enviarEmail).toHaveBeenCalled();
  });
});

describe('RN10 - Exclusão de Dados Pessoais', () => {
  test('conta sem transações é apagada de verdade', async () => {
    pool.query.mockResolvedValueOnce(linhas()).mockResolvedValueOnce(linhas());
    const r = await excluirOuAnonimizarUsuario(5);
    expect(r.anonimizada).toBe(false);
    expect(pool.query.mock.calls[1][0]).toMatch(/DELETE FROM usuarios/);
  });

  test('conta com transações é anonimizada, não apagada (guarda fiscal de 5 anos)', async () => {
    pool.query.mockResolvedValueOnce(linhas({ 1: 1 })).mockResolvedValueOnce(linhas());
    const r = await excluirOuAnonimizarUsuario(5);
    expect(r.anonimizada).toBe(true);
    const sqls = pool.query.mock.calls.map(([sql]) => sql).join('\n');
    expect(sqls).not.toMatch(/DELETE/);
    expect(sqls).toMatch(/anonimizada_em = NOW\(\)/);
  });

  test('na anonimização, nome, e-mail e CPF deixam de identificar a pessoa', async () => {
    pool.query.mockResolvedValueOnce(linhas({ 1: 1 })).mockResolvedValueOnce(linhas());
    await excluirOuAnonimizarUsuario(5);
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toMatch(/nome = 'Usuário removido'/);
    expect(sql).toMatch(/telefone = NULL/);
    expect(sql).toMatch(/cep = NULL/);
    expect(params[0]).toBe('removido+5@santodesapego.invalid');
    expect(params[2]).toBe('ANON0000005');
  });
});
