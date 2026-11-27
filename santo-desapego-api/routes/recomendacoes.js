const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { recomendarParaVoce, LIMITE, LIMITE_MAXIMO } = require('../services/recomendacaoService');

const router = express.Router();

// ============================================================
//  GET /api/recomendacoes — seção "Para você" da Home [RF24]
//  Anúncios ativos das categorias que a pessoa visualizou nos
//  últimos dias, priorizando a faixa de preço e o bairro dela.
//  Sem histórico, devolve lista vazia (a Home esconde a seção).
//  ?limite=N (1 a 20): a Home pede 5; a tela do anúncio pede 20.
// ============================================================
router.get('/api/recomendacoes', autenticar, async (req, res) => {
  try {
    const perfil = await pool.query('SELECT bairro FROM usuarios WHERE id = $1', [req.userId]);
    const pedido = parseInt(req.query.limite, 10);
    const limite = Number.isInteger(pedido) ? Math.min(Math.max(pedido, 1), LIMITE_MAXIMO) : LIMITE;
    const resultado = await recomendarParaVoce({
      usuarioId: req.userId,
      bairroPerfil: perfil.rows[0]?.bairro || null,
      limite,
    });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro ao montar recomendações:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar as recomendações.' });
  }
});

module.exports = router;
