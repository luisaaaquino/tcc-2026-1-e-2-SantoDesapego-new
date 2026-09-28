const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { rodarAgente, estadoInicial } = require('../services/agenteAnuncioService');

const router = express.Router();

// ============================================================
//  POST /api/ia/agente-anuncio — Agente de Anúncio (IA)
//  Conversa turno a turno com o vendedor pra montar e publicar um
//  anúncio. O estado (rascunho, orçamento, trajetória) fica no
//  banco (tabela conversas_ia_anuncio) — o cliente só guarda o
//  conversa_id, nunca o estado em si (evita adulteração do lado
//  do cliente, ex. forjar aprovação do avaliador).
// ============================================================
router.post('/api/ia/agente-anuncio', autenticar, async (req, res) => {
  const client = await pool.connect();
  try {
    const { conversa_id, mensagem, imagens } = req.body;
    let conversaId = conversa_id;
    let estado;

    await client.query('BEGIN');

    if (!conversaId) {
      const perfil = await client.query('SELECT cep, bairro FROM usuarios WHERE id = $1', [req.userId]);
      const { cep, bairro } = perfil.rows[0] || {};

      if (!cep) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          erro: 'Complete seu CEP no perfil antes de anunciar com IA. Vá em Perfil → Endereço.',
        });
      }

      estado = await estadoInicial({ cep, bairro });
      const nova = await client.query(
        `INSERT INTO conversas_ia_anuncio (vendedor_id, estado) VALUES ($1, $2) RETURNING id`,
        [req.userId, JSON.stringify(estado)]
      );
      conversaId = nova.rows[0].id;
    } else {
      const linha = await client.query(
        `SELECT estado, finalizado FROM conversas_ia_anuncio WHERE id = $1 AND vendedor_id = $2 FOR UPDATE`,
        [conversaId, req.userId]
      );
      if (linha.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Conversa não encontrada.' });
      }
      if (linha.rows[0].finalizado) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Esta conversa já foi concluída. Inicie uma nova.' });
      }
      estado = linha.rows[0].estado;
    }

    const resultado = await rodarAgente({
      estado,
      mensagemVendedor: mensagem || null,
      imagens: imagens || [],
      vendedorId: req.userId,
    });

    await client.query(
      `UPDATE conversas_ia_anuncio
          SET estado = $1, finalizado = $2, status_final = $3, anuncio_id = $4, atualizada_em = NOW()
        WHERE id = $5`,
      [
        JSON.stringify(resultado.estado),
        resultado.estado.finalizado,
        resultado.estado.finalizado ? resultado.status : null,
        resultado.anuncio?.id || null,
        conversaId,
      ]
    );
    await client.query('COMMIT');

    return res.json({
      conversa_id: conversaId,
      mensagem_agente: resultado.mensagem_agente,
      status: resultado.status,
      conversa: resultado.estado.conversa,
      anuncio: resultado.anuncio || null,
      indicio: resultado.indicio || null,
    });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro no agente de anúncio (IA):', erro);
    if (erro.codigo === 'LLM_INDISPONIVEL' || erro.codigo === 'LLM_RESPOSTA_INVALIDA') {
      return res.status(503).json({
        erro: 'O assistente de IA está indisponível no momento. Tente novamente em instantes ou use o formulário manual.',
      });
    }
    return res.status(500).json({ erro: 'Erro ao processar a conversa com o assistente.' });
  } finally {
    client.release();
  }
});

module.exports = router;
