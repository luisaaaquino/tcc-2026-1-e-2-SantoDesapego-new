const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// ============================================================
//  GET FAVORITOS — lista de itens salvos do usuário logado [RF10]
// ============================================================
router.get('/api/favoritos', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         f.id AS favorito_id, f.criado_em AS favoritado_em,
         a.id, a.titulo, a.preco, a.bairro, a.estado_conservacao, a.status,
         c.nome AS categoria_nome,
         (SELECT imagem FROM anuncio_imagens
           WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS imagem_principal
       FROM favoritos f
       JOIN anuncios a ON a.id = f.anuncio_id
       JOIN categorias c ON c.id = a.categoria_id
       WHERE f.usuario_id = $1
       ORDER BY f.criado_em DESC`,
      [req.userId]
    );
    return res.json({ favoritos: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar favoritos:', erro);
    return res.status(500).json({ erro: 'Erro ao listar favoritos.' });
  }
});

// ============================================================
//  POST FAVORITOS — salva um anúncio na lista de favoritos [RF10]
// ============================================================
router.post('/api/favoritos', autenticar, async (req, res) => {
  try {
    const { anuncio_id } = req.body;
    if (!anuncio_id) {
      return res.status(400).json({ erro: 'Informe o anúncio a favoritar.' });
    }

    const anuncio = await pool.query('SELECT id FROM anuncios WHERE id = $1', [anuncio_id]);
    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }

    await pool.query(
      `INSERT INTO favoritos (usuario_id, anuncio_id) VALUES ($1, $2)
       ON CONFLICT (usuario_id, anuncio_id) DO NOTHING`,
      [req.userId, anuncio_id]
    );

    return res.status(201).json({ mensagem: 'Anúncio salvo nos favoritos.', favoritado: true });
  } catch (erro) {
    console.error('Erro ao favoritar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao favoritar anúncio.' });
  }
});

// ============================================================
//  DELETE FAVORITOS — remove um anúncio da lista de favoritos [RF10]
// ============================================================
router.delete('/api/favoritos/:anuncioId', autenticar, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM favoritos WHERE usuario_id = $1 AND anuncio_id = $2',
      [req.userId, req.params.anuncioId]
    );
    return res.json({ mensagem: 'Anúncio removido dos favoritos.', favoritado: false });
  } catch (erro) {
    console.error('Erro ao remover favorito:', erro);
    return res.status(500).json({ erro: 'Erro ao remover favorito.' });
  }
});

module.exports = router;
