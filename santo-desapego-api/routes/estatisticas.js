const express = require('express');
const pool = require('../db');
const { BAIRRO_COORDS } = require('../utils/geolocalizacao');

const router = express.Router();

// ============================================================
//  GET /api/estatisticas — números reais da plataforma
//  Usado na tela de Login (antes tinha números fixos/fabricados
//  no front, tipo "4.800+ itens" e "93% satisfação", que não
//  batiam com o que o site realmente tem). Pública, sem dado
//  sensível — só contagens agregadas.
// ============================================================
router.get('/api/estatisticas', async (req, res) => {
  try {
    const [anuncios, usuarios] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM anuncios WHERE status = 'ativo'"),
      pool.query('SELECT COUNT(*) FROM usuarios WHERE anonimizada_em IS NULL'),
    ]);

    return res.json({
      itens_ativos: parseInt(anuncios.rows[0].count, 10),
      vizinhos_cadastrados: parseInt(usuarios.rows[0].count, 10),
      // Cobertura da plataforma (RN01/RN12) — quantos bairros o Santo
      // Desapego atende, não quantos JÁ têm anúncio ativo agora (esse
      // segundo número seria pequeno e enganoso enquanto o catálogo
      // ainda está começando, mesmo cobrindo a região toda).
      bairros_atendidos: Object.keys(BAIRRO_COORDS).length,
    });
  } catch (erro) {
    console.error('Erro ao buscar estatísticas:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar estatísticas.' });
  }
});

module.exports = router;
