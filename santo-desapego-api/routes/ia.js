const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { rodarAgente, estadoInicial, gerarRascunhoRapido } = require('../services/agenteAnuncioService');
const { registrarClique, gerarSugestaoCompra } = require('../services/agenteCompraService');

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
      // Anúncios comparáveis da última consulta de preço (se já rolou
      // alguma) — o chat mostra como cards clicáveis, pra pessoa ver a
      // concorrência de verdade, não só um resumo de faixa de preço.
      observacao_preco: resultado.estado.observacoes.ultima_consulta_preco,
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

// ============================================================
//  POST /api/ia/anuncio-rapido — "Anúncio rápido" (IA)
//  Modo de tiro único: uma mensagem descrevendo o produto vira um
//  rascunho pra revisão — sem ida-e-volta de perguntas, sem
//  persistir estado no banco (nada aqui publica nada). Quem publica
//  é a própria pessoa, no formulário manual já preenchido com esse
//  rascunho (reaproveita POST /api/anuncios e toda a validação de
//  sempre) — por isso não precisa de transação nem de tabela nova.
// ============================================================
router.post('/api/ia/anuncio-rapido', autenticar, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ erro: 'Descreva o que você quer anunciar.' });
    }

    const perfil = await pool.query('SELECT cep, bairro FROM usuarios WHERE id = $1', [req.userId]);
    const { cep, bairro } = perfil.rows[0] || {};
    if (!cep) {
      return res.status(400).json({
        erro: 'Complete seu CEP no perfil antes de anunciar com IA. Vá em Perfil → Endereço.',
      });
    }

    const resultado = await gerarRascunhoRapido({ mensagem: mensagem.trim(), cep, bairro });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro no anúncio rápido (IA):', erro);
    if (erro.codigo === 'LLM_INDISPONIVEL' || erro.codigo === 'LLM_RESPOSTA_INVALIDA') {
      return res.status(503).json({
        erro: 'O assistente de IA está indisponível no momento. Tente novamente em instantes ou preencha manualmente.',
      });
    }
    return res.status(500).json({ erro: 'Erro ao gerar o rascunho do anúncio.' });
  }
});

// ============================================================
//  POST /api/ia/registrar-clique — Consultor de Compra (Agente A)
//  Registra que o comprador logado visualizou um anúncio — é o
//  sinal de intenção que o Agente A usa depois pra sugerir. Falha
//  silenciosa (não atrapalha a navegação se der erro).
// ============================================================
router.post('/api/ia/registrar-clique', autenticar, async (req, res) => {
  try {
    const { anuncio_id } = req.body;
    if (!anuncio_id) return res.status(400).json({ erro: 'anuncio_id é obrigatório.' });

    await registrarClique({ usuarioId: req.userId, anuncioId: anuncio_id });
    return res.status(204).end();
  } catch (erro) {
    console.error('Erro ao registrar clique (Agente A):', erro);
    return res.status(500).json({ erro: 'Erro ao registrar clique.' });
  }
});

// ============================================================
//  GET /api/ia/sugestao-compra — Consultor de Compra (Agente A)
//  Sugestão de produtos baseada nos cliques recentes do comprador
//  logado. Nunca falha visivelmente pro usuário — qualquer problema
//  (LLM indisponível, sinal insuficiente) cai numa descoberta
//  genérica em vez de mostrar erro no botão flutuante.
// ============================================================
router.get('/api/ia/sugestao-compra', autenticar, async (req, res) => {
  try {
    const perfil = await pool.query('SELECT bairro FROM usuarios WHERE id = $1', [req.userId]);
    const bairro = perfil.rows[0]?.bairro || null;

    const resultado = await gerarSugestaoCompra({ usuarioId: req.userId, bairro });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro ao gerar sugestão de compra (Agente A):', erro);
    return res.status(500).json({ erro: 'Erro ao gerar sugestão.' });
  }
});

module.exports = router;
