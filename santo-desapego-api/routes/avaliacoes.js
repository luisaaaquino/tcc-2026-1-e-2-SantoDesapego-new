const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// ============================================================
//  POST AVALIAÇÃO — comprador avalia o vendedor de uma compra
// ============================================================
router.post('/api/avaliacoes', autenticar, async (req, res) => {
  try {
    const { compra_id, nota, comentario } = req.body;

    if (!compra_id) {
      return res.status(400).json({ erro: 'Informe a compra que está sendo avaliada.' });
    }
    const notaNum = parseInt(nota);
    if (!notaNum || notaNum < 1 || notaNum > 5) {
      return res.status(400).json({ erro: 'A nota deve ser um número de 1 a 5.' });
    }
    if (comentario && comentario.length > 500) {
      return res.status(400).json({ erro: 'Comentário muito longo (máximo 500 caracteres).' });
    }

    const compra = await pool.query(
      'SELECT comprador_id, vendedor_id FROM compras WHERE id = $1',
      [compra_id]
    );

    if (compra.rows.length === 0) {
      return res.status(404).json({ erro: 'Compra não encontrada.' });
    }
    if (compra.rows[0].comprador_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode avaliar suas próprias compras.' });
    }

    const jaAvaliada = await pool.query(
      'SELECT id FROM avaliacoes WHERE compra_id = $1', [compra_id]
    );
    if (jaAvaliada.rows.length > 0) {
      return res.status(409).json({ erro: 'Você já avaliou esta compra.' });
    }

    const nova = await pool.query(
      `INSERT INTO avaliacoes (compra_id, avaliador_id, avaliado_id, nota, comentario)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nota, comentario, criada_em`,
      [compra_id, req.userId, compra.rows[0].vendedor_id, notaNum, comentario?.trim() || null]
    );

    return res.status(201).json({
      mensagem: 'Avaliação enviada com sucesso!',
      avaliacao: nova.rows[0],
    });
  } catch (erro) {
    console.error('Erro ao registrar avaliação:', erro);
    return res.status(500).json({ erro: 'Erro ao registrar avaliação.' });
  }
});

// ============================================================
//  POST DENÚNCIA — usuário denuncia anúncio ou perfil [RF19]
// ============================================================
router.post('/api/denuncias', autenticar, async (req, res) => {
  try {
    const { anuncio_id, usuario_denunciado_id, motivo, descricao } = req.body;

    const motivosValidos = ['conteudo_inadequado', 'fraude', 'violacao_termos', 'outro'];
    if (!motivo || !motivosValidos.includes(motivo)) {
      return res.status(400).json({ erro: 'Selecione um motivo válido para a denúncia.' });
    }
    if (!anuncio_id && !usuario_denunciado_id) {
      return res.status(400).json({ erro: 'Informe o anúncio ou o usuário que está sendo denunciado.' });
    }
    if (descricao && descricao.length > 1000) {
      return res.status(400).json({ erro: 'Descrição muito longa (máximo 1000 caracteres).' });
    }

    let denunciadoId = usuario_denunciado_id || null;

    if (anuncio_id) {
      const anuncio = await pool.query('SELECT vendedor_id FROM anuncios WHERE id = $1', [anuncio_id]);
      if (anuncio.rows.length === 0) {
        return res.status(404).json({ erro: 'Anúncio não encontrado.' });
      }
      if (anuncio.rows[0].vendedor_id === req.userId) {
        return res.status(400).json({ erro: 'Você não pode denunciar seu próprio anúncio.' });
      }
      denunciadoId = denunciadoId || anuncio.rows[0].vendedor_id;
    }

    if (denunciadoId === req.userId) {
      return res.status(400).json({ erro: 'Você não pode denunciar a si mesmo.' });
    }

    const nova = await pool.query(
      `INSERT INTO denuncias (denunciante_id, anuncio_id, usuario_denunciado_id, motivo, descricao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, criada_em`,
      [req.userId, anuncio_id || null, denunciadoId, motivo, descricao?.trim() || null]
    );

    return res.status(201).json({
      mensagem: 'Denúncia registrada. Nossa equipe vai analisar em breve.',
      denuncia: nova.rows[0],
    });
  } catch (erro) {
    console.error('Erro ao registrar denúncia:', erro);
    return res.status(500).json({ erro: 'Erro ao registrar denúncia.' });
  }
});

// ============================================================
//  GET MINHAS DENÚNCIAS — usuário vê o retorno dos administradores
// ============================================================
router.get('/api/denuncias', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT d.id, d.motivo, d.descricao, d.status, d.resolucao, d.criada_em, d.resolvida_em,
         a.id AS anuncio_id, a.titulo AS anuncio_titulo,
         alvo.id AS denunciado_id, alvo.nome AS denunciado_nome
       FROM denuncias d
       LEFT JOIN anuncios a ON a.id = d.anuncio_id
       LEFT JOIN usuarios alvo ON alvo.id = d.usuario_denunciado_id
       WHERE d.denunciante_id = $1
       ORDER BY d.criada_em DESC`,
      [req.userId]
    );
    return res.json({ denuncias: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar minhas denúncias:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar suas denúncias.' });
  }
});

// ============================================================
//  CENTRAL DE AJUDA — mensagens de suporte dos usuários
//  [Central de ajuda direcionada aos administradores]
// ============================================================

//  POST — usuário envia uma nova mensagem de suporte
router.post('/api/suporte', autenticar, async (req, res) => {
  try {
    const { assunto, mensagem } = req.body;

    const assuntosValidos = ['duvida_conta', 'anuncio', 'pagamento', 'denuncia_seguranca', 'outro'];
    if (!assunto || !assuntosValidos.includes(assunto)) {
      return res.status(400).json({ erro: 'Selecione um assunto válido.' });
    }
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ erro: 'Escreva sua mensagem antes de enviar.' });
    }
    if (mensagem.length > 2000) {
      return res.status(400).json({ erro: 'Mensagem muito longa (máximo 2000 caracteres).' });
    }

    const nova = await pool.query(
      `INSERT INTO mensagens_suporte (usuario_id, assunto, mensagem)
       VALUES ($1, $2, $3)
       RETURNING id, assunto, mensagem, status, criada_em`,
      [req.userId, assunto, mensagem.trim()]
    );

    return res.status(201).json({
      mensagem_confirmacao: 'Sua mensagem foi enviada! Nossa equipe vai responder em breve.',
      solicitacao: nova.rows[0],
    });
  } catch (erro) {
    console.error('Erro ao registrar mensagem de suporte:', erro);
    return res.status(500).json({ erro: 'Erro ao enviar sua mensagem.' });
  }
});

//  GET — usuário vê o histórico das próprias solicitações de suporte
router.get('/api/suporte', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, assunto, mensagem, status, resposta, criada_em, respondida_em
       FROM mensagens_suporte WHERE usuario_id = $1 ORDER BY criada_em DESC`,
      [req.userId]
    );
    return res.json({ solicitacoes: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar mensagens de suporte:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar suas solicitações.' });
  }
});

module.exports = router;
