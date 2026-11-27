const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { recomendarParaVoce } = require('../services/recomendacaoService');

const router = express.Router();

// ============================================================
//  GET /api/recomendacoes — seção "Para você" da Home [RF24]
//  Anúncios ativos das categorias que a pessoa visualizou nos
//  últimos dias, priorizando a faixa de preço e o bairro dela.
//  Sem histórico, devolve lista vazia (a Home esconde a seção).
// ============================================================
router.get('/api/recomendacoes', autenticar, async (req, res) => {
  try {
    const perfil = await pool.query('SELECT bairro FROM usuarios WHERE id = $1', [req.userId]);
    const resultado = await recomendarParaVoce({
      usuarioId: req.userId,
      bairroPerfil: perfil.rows[0]?.bairro || null,
    });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro ao montar recomendações:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar as recomendações.' });
  }
});

module.exports = router;
