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

module.exports = { montarApp, tokenDe, linhas };
