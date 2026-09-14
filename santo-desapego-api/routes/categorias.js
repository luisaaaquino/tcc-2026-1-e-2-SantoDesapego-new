const express = require('express');
const pool = require('../db');

const router = express.Router();

// ============================================================
//  GET CATEGORIAS — lista hierárquica
// ============================================================
router.get('/api/categorias', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, slug, icone, categoria_pai, ordem
       FROM categorias ORDER BY ordem, nome`
    );

    const principais = resultado.rows.filter((c) => c.categoria_pai === null);
    const filhas     = resultado.rows.filter((c) => c.categoria_pai !== null);

    const categorias = principais.map((p) => ({
      ...p,
      subcategorias: filhas.filter((f) => f.categoria_pai === p.id),
    }));

    return res.json({ categorias });
  } catch (erro) {
    console.error('Erro ao listar categorias:', erro);
    return res.status(500).json({ erro: 'Erro ao listar categorias.' });
  }
});

module.exports = router;
