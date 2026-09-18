const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const {
  getAuthorizationUrl,
  exchangeCodeForToken,
} = require('../services/mercadoPagoService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const router = express.Router();

// ============================================================
//  GET CONNECT — gera a URL de autorização do Mercado Pago pro
//  vendedor logado. O front redireciona o navegador pra essa URL.
// ============================================================
router.get('/api/mp/connect', autenticar, async (req, res) => {
  try {
    // "state" curto e assinado — evita que o /callback seja usado por
    // qualquer requisição forjada e identifica de quem é a autorização
    // quando o Mercado Pago redireciona de volta.
    const state = jwt.sign({ id: req.userId }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const url = getAuthorizationUrl(state);
    return res.json({ url });
  } catch (erro) {
    console.error('Erro ao gerar URL de autorização do Mercado Pago:', erro);
    return res.status(500).json({ erro: 'Não foi possível iniciar a conexão com o Mercado Pago.' });
  }
});

// ============================================================
//  GET CALLBACK — o Mercado Pago redireciona pra cá depois que o
//  vendedor autoriza (ou recusa) a autorização, com ?code&state.
// ============================================================
router.get('/api/mp/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/perfil?mp=erro`);
  }

  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    const vendedorId = payload.id;

    const tokenMp = await exchangeCodeForToken(code);
    const expiraEm = new Date(Date.now() + tokenMp.expires_in * 1000);

    await pool.query(
      `UPDATE usuarios SET
         mp_user_id = $1, mp_access_token = $2, mp_refresh_token = $3,
         mp_public_key = $4, mp_token_expira_em = $5, mp_conectado = TRUE
       WHERE id = $6`,
      [tokenMp.user_id, tokenMp.access_token, tokenMp.refresh_token, tokenMp.public_key, expiraEm, vendedorId]
    );

    console.log(`💳 Vendedor #${vendedorId} conectou a conta do Mercado Pago (mp_user_id ${tokenMp.user_id})`);

    return res.redirect(`${FRONTEND_URL}/perfil?mp=conectado`);
  } catch (erro) {
    console.error('Erro no callback do Mercado Pago:', erro.message, erro.detalhe || '');
    return res.redirect(`${FRONTEND_URL}/perfil?mp=erro`);
  }
});

module.exports = router;
