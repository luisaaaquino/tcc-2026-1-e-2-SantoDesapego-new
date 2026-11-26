jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const express = require('express');
const request = require('supertest');
const pool = require('../db');
const { situacaoDaConta } = require('../utils/situacaoConta'); // simulado em tests/setup.js
const { autenticar, autenticarOpcional, autenticarAdmin } = require('../middleware/auth');
const { tokenDe, linhas } = require('./helpers');

// App mínimo: uma rota logada, uma opcional e uma de administrador
const app = express();
app.get('/logada', autenticar, (req, res) => res.json({ userId: req.userId }));
app.get('/opcional', autenticarOpcional, (req, res) => res.json({ userId: req.userId ?? null }));
app.get('/admin', autenticarAdmin, (req, res) => res.json({ ok: true }));

beforeEach(() => {
  jest.clearAllMocks();
  situacaoDaConta.mockResolvedValue('ativa');
});

describe('RN10 / RF20 - Sessão de conta excluída ou suspensa', () => {
  test('conta ativa continua acessando as rotas logadas', async () => {
    const res = await request(app).get('/logada').set('Authorization', tokenDe(7));
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(7);
    expect(situacaoDaConta).toHaveBeenCalledWith(7);
  });

  test('conta excluída/anonimizada perde o acesso na hora, mesmo com token válido', async () => {
    situacaoDaConta.mockResolvedValue('removida');
    const res = await request(app).get('/logada').set('Authorization', tokenDe(7));
    expect(res.status).toBe(401);
    // Mesma mensagem que o front usa para limpar a sessão e levar ao login
    expect(res.body.erro).toBe('Token inválido ou expirado.');
  });

  test('conta suspensa pelo Admin perde o acesso na hora', async () => {
    situacaoDaConta.mockResolvedValue('suspensa');
    const res = await request(app).get('/logada').set('Authorization', tokenDe(7));
    expect(res.status).toBe(401);
    expect(res.body.erro).toBe('Token inválido ou expirado.');
  });

  test('administrador suspenso também perde o acesso ao painel', async () => {
    situacaoDaConta.mockResolvedValue('suspensa');
    const res = await request(app).get('/admin').set('Authorization', tokenDe(1));
    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled(); // nem chega a consultar o papel
  });

  test('em rota pública, conta excluída ou suspensa navega como visitante', async () => {
    situacaoDaConta.mockResolvedValue('removida');
    const res = await request(app).get('/opcional').set('Authorization', tokenDe(7));
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  test('falha ao consultar a conta não deixa passar (erro 500)', async () => {
    situacaoDaConta.mockRejectedValue(new Error('banco fora do ar'));
    const res = await request(app).get('/logada').set('Authorization', tokenDe(7));
    expect(res.status).toBe(500);
  });
});

describe('situacaoDaConta - leitura no banco', () => {
  const { situacaoDaConta: real } = jest.requireActual('../utils/situacaoConta');

  test.each([
    ['usuário apagado', 'removida', []],
    ['conta anonimizada', 'removida', [{ status_conta: 'ativa', anonimizada_em: new Date() }]],
    ['conta suspensa', 'suspensa', [{ status_conta: 'suspensa', anonimizada_em: null }]],
    ['conta ativa', 'ativa', [{ status_conta: 'ativa', anonimizada_em: null }]],
  ])('%s → %s', async (_nome, esperado, rows) => {
    pool.query.mockResolvedValueOnce(linhas(...rows));
    await expect(real(5)).resolves.toBe(esperado);
  });
});

describe('Mercado Pago - reconexão de conta excluída', () => {
  test('o retorno da autorização não reconecta conta excluída ou suspensa', async () => {
    jest.resetModules();
    jest.doMock('../services/mercadoPagoService', () => ({
      getAuthorizationUrl: jest.fn(), exchangeCodeForToken: jest.fn(),
    }));
    const jwt = require('jsonwebtoken');
    const { situacaoDaConta: situacao } = require('../utils/situacaoConta');
    const servico = require('../services/mercadoPagoService');
    const banco = require('../db');
    const rotas = express().use(require('../routes/mercadoPago'));
    situacao.mockResolvedValue('removida');

    const state = jwt.sign({ id: 7 }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const res = await request(rotas).get(`/api/mp/callback?code=abc&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/mp=erro/);
    expect(servico.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(banco.query).not.toHaveBeenCalled();
  });
});
