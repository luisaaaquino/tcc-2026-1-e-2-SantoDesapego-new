const express = require('express');
const jwt = require('jsonwebtoken');

// Monta um app Express só com a rota testada (sem subir o server.js)
const montarApp = (router) => {
  const app = express();
  app.use(express.json({ limit: '30mb' })); // mesmo limite do server.js
  app.use(router);
  return app;
};

// Header de autenticação de um usuário logado
const tokenDe = (id) => `Bearer ${jwt.sign({ id, email: `u${id}@teste.com` }, process.env.JWT_SECRET)}`;

// Resposta do pool.query no formato do pg
const linhas = (...rows) => ({ rows });

// Cliente de transação (pool.connect) que repassa as consultas ao pool.query
// simulado do teste. Responde sozinho o que só existe dentro da transação:
// BEGIN/COMMIT/ROLLBACK, a trava do anúncio e a busca da compra pelo payment_id.
const transacaoNoPool = (pool, { anuncioStatus = 'ativo', compraExistente = null } = {}) => ({
  query: jest.fn(async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return linhas();
    if (/SELECT status FROM anuncios WHERE id = \$1 FOR UPDATE/.test(sql)) return linhas({ status: anuncioStatus });
    if (/FROM compras WHERE payment_id = \$1 FOR UPDATE/.test(sql)) return linhas(...(compraExistente ? [compraExistente] : []));
    return pool.query(sql, params);
  }),
  release: jest.fn(),
});

module.exports = { montarApp, tokenDe, linhas, transacaoNoPool };
