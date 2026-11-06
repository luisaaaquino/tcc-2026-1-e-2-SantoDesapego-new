const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { rodarAgente, decidirPendencia, estadoInicial, gerarRascunhoRapido } = require('../services/agenteAnuncioService');
const { registrarClique, gerarSugestaoCompra } = require('../services/agenteCompraService');

const router = express.Router();

const ERROS_LLM = ['LLM_INDISPONIVEL', 'LLM_RESPOSTA_INVALIDA'];

// Suspensão do agente pelo operador (repositório v3.0.0): com SANTO_SUSPENSO=1
// no .env do servidor, as rotas de IA recusam conversas e decisões — dá pra
// desligar a IA sem mexer no código. O registro de cliques não usa IA e segue.
function verificarSuspensao(req, res, next) {
  if ((process.env.SANTO_SUSPENSO || '').trim() === '1') {
    return res.status(503).json({ erro: 'O assistente está temporariamente fora do ar. Tente mais tarde.' });
  }
  return next();
}

// Resposta comum das duas rotas do agente de anúncio
function respostaAgente(conversaId, resultado) {
  const e = resultado.estado;
  return {
    conversa_id: conversaId,
    mensagem_agente: resultado.mensagem_agente,
    status: resultado.status,
    conversa: e.conversa,
    anuncio: resultado.anuncio || null,
    indicio: resultado.indicio || null,
    // Edições recusadas na aprovação (controle C3) — o chat mostra antes de sair
    edicoes_ignoradas: resultado.edicoes_ignoradas || null,
    // Rascunho esperando a decisão do vendedor (aprovar / editar / desistir)
    pendencia: e.pendencia || null,
    // Anúncios comparáveis da consulta de preço — o chat mostra como cards clicáveis
    observacao_preco: e.faixa_preco,
  };
}

async function salvarConversa(client, conversaId, resultado) {
  const e = resultado.estado;
  await client.query(
    `UPDATE conversas_ia_anuncio
        SET estado = $1, finalizado = $2, status_final = $3, anuncio_id = $4, atualizada_em = NOW()
      WHERE id = $5`,
    [JSON.stringify(e), e.finalizado, e.finalizado ? resultado.status : null,
      resultado.anuncio?.id || e.anuncio_publicado?.id || null, conversaId]
  );
}

// ============================================================
//  POST /api/ia/agente-anuncio — Agente de Anúncio (IA)
//  Conversa turno a turno com o vendedor pra montar o anúncio. O
//  estado (rascunho, faixa de preço, avaliação, trajetória) fica no
//  banco (conversas_ia_anuncio) — o cliente só guarda o conversa_id,
//  nunca o estado em si (evita adulteração, ex. forjar aprovação do
//  avaliador). O agente nunca publica: rascunho aprovado volta como
//  `pendencia`, e quem decide é o vendedor (rota /decisao abaixo).
// ============================================================
router.post('/api/ia/agente-anuncio', autenticar, verificarSuspensao, async (req, res) => {
  const { conversa_id, mensagem } = req.body;
  if (!mensagem || !String(mensagem).trim()) {
    return res.status(400).json({ erro: 'Escreva uma mensagem.' });
  }

  const client = await pool.connect();
  try {
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
      // Conversas do agente antigo (antes do porte da Parte 2) não têm `versao`
      if (linha.rows[0].estado.versao !== 2) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Esta conversa é de uma versão antiga do assistente. Inicie uma nova.' });
      }
      estado = linha.rows[0].estado;
    }

    const resultado = await rodarAgente({
      estado,
      mensagemVendedor: String(mensagem).trim().slice(0, 1000),
      vendedorId: req.userId,
    });

    await salvarConversa(client, conversaId, resultado);
    await client.query('COMMIT');
    return res.json(respostaAgente(conversaId, resultado));
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro no agente de anúncio (IA):', erro);
    if (ERROS_LLM.includes(erro.codigo)) {
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
//  POST /api/ia/agente-anuncio/decisao — o vendedor decide
//  Ponto de parada humano: com o rascunho aprovado pelo avaliador,
//  só o vendedor publica. acao = aprovar | editar | rejeitar;
//  `campos` (editar) só aceita titulo, descricao, preco e
//  estado_conservacao. As fotos vêm aqui (são exigidas pra publicar).
//  Idempotente: aprovar duas vezes não cria dois anúncios.
// ============================================================
router.post('/api/ia/agente-anuncio/decisao', autenticar, verificarSuspensao, async (req, res) => {
  const { conversa_id, acao, campos, imagens } = req.body;
  if (!conversa_id) return res.status(400).json({ erro: 'conversa_id é obrigatório.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const linha = await client.query(
      `SELECT estado FROM conversas_ia_anuncio WHERE id = $1 AND vendedor_id = $2 FOR UPDATE`,
      [conversa_id, req.userId]
    );
    if (linha.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Conversa não encontrada.' });
    }

    const resultado = await decidirPendencia({
      estado: linha.rows[0].estado, acao, campos, imagens: imagens || [], vendedorId: req.userId,
    });
    if (resultado.erro && !resultado.estado) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: resultado.erro });
    }

    await salvarConversa(client, conversa_id, resultado);
    await client.query('COMMIT');
    if (resultado.erro) {
      // Ex.: sem foto — a pendência continua aberta pra corrigir
      return res.status(400).json({ erro: resultado.erro, ...respostaAgente(conversa_id, resultado) });
    }
    return res.json(respostaAgente(conversa_id, resultado));
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro na decisão do vendedor (IA):', erro);
    return res.status(500).json({ erro: 'Erro ao registrar sua decisão.' });
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
router.post('/api/ia/anuncio-rapido', autenticar, verificarSuspensao, async (req, res) => {
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

    const resultado = await gerarRascunhoRapido({ mensagem: mensagem.trim().slice(0, 1000), cep, bairro });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro no anúncio rápido (IA):', erro);
    if (ERROS_LLM.includes(erro.codigo)) {
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
//  sinal usado quando ele não diz o que procura. Falha silenciosa
//  (não atrapalha a navegação se der erro).
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
//  POST /api/ia/sugestao-compra — Consultor de Compra (Agente A)
//  O comprador escreve o que procura ("to montando a cozinha, até
//  700"); o agente interpreta, busca no catálogo e monta a sugestão.
//  `mensagens`: as falas do comprador neste painel (refinamento).
//  Sem texto, usa os cliques recentes dele. GET mantido por
//  compatibilidade (equivale a POST sem mensagens).
// ============================================================
async function responderSugestao(req, res, mensagens) {
  try {
    const perfil = await pool.query('SELECT bairro FROM usuarios WHERE id = $1', [req.userId]);
    const resultado = await gerarSugestaoCompra({
      usuarioId: req.userId,
      bairroPerfil: perfil.rows[0]?.bairro || null,
      mensagens,
    });
    return res.json(resultado);
  } catch (erro) {
    console.error('Erro ao gerar sugestão de compra (Agente A):', erro);
    if (ERROS_LLM.includes(erro.codigo)) {
      return res.status(503).json({ erro: 'O assistente está indisponível no momento. Tente de novo em instantes.' });
    }
    return res.status(500).json({ erro: 'Erro ao gerar sugestão.' });
  }
}

router.post('/api/ia/sugestao-compra', autenticar, verificarSuspensao, (req, res) => {
  const mensagens = (Array.isArray(req.body?.mensagens) ? req.body.mensagens : [])
    .filter((m) => typeof m === 'string' && m.trim())
    .slice(-6)
    .map((m) => m.trim().slice(0, 500));
  return responderSugestao(req, res, mensagens);
});

router.get('/api/ia/sugestao-compra', autenticar, verificarSuspensao, (req, res) => responderSugestao(req, res, []));

module.exports = router;
