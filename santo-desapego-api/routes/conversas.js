const express = require('express');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { conteudoTemPalavrasProibidas } = require('../utils/validacao');
const { criarNotificacao } = require('../utils/notificacoes');

const router = express.Router();

// ============================================================
//  CHAT — abre (ou reaproveita) uma conversa sobre um anúncio
//  O comprador clica em "Conversar com o anunciante".
// ============================================================
router.post('/api/conversas', autenticar, async (req, res) => {
  try {
    const { anuncio_id } = req.body;

    if (!anuncio_id) {
      return res.status(400).json({ erro: 'Informe o anúncio.' });
    }

    const anuncio = await pool.query(
      'SELECT id, vendedor_id, status FROM anuncios WHERE id = $1',
      [anuncio_id]
    );

    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }

    const vendedorId = anuncio.rows[0].vendedor_id;

    if (vendedorId === req.userId) {
      return res.status(400).json({ erro: 'Você não pode conversar no seu próprio anúncio.' });
    }

    // ON CONFLICT: se a conversa já existe, devolve ela em vez de duplicar
    const conversa = await pool.query(
      `INSERT INTO conversas (anuncio_id, comprador_id, vendedor_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (anuncio_id, comprador_id)
       DO UPDATE SET anuncio_id = EXCLUDED.anuncio_id
       RETURNING id, anuncio_id, comprador_id, vendedor_id, criada_em`,
      [anuncio_id, req.userId, vendedorId]
    );

    return res.status(201).json({ conversa: conversa.rows[0] });

  } catch (erro) {
    console.error('Erro ao abrir conversa:', erro);
    return res.status(500).json({ erro: 'Erro ao abrir conversa.' });
  }
});

// ============================================================
//  CHAT — lista as conversas do usuário logado
//  Traz a última mensagem e quantas não lidas, numa consulta só.
// ============================================================
router.get('/api/conversas', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         c.id,
         c.anuncio_id,
         c.ultima_mensagem_em,
         CASE WHEN c.comprador_id = $1 THEN 'comprador' ELSE 'vendedor' END AS meu_papel,
         a.titulo  AS anuncio_titulo,
         a.preco   AS anuncio_preco,
         a.status  AS anuncio_status,
         (SELECT imagem FROM anuncio_imagens
           WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS anuncio_imagem,
         o.id          AS outro_id,
         o.nome        AS outro_nome,
         o.foto_perfil AS outro_foto,
         ultima.conteudo     AS ultima_mensagem,
         ultima.remetente_id AS ultima_remetente_id,
         COALESCE(nao_lidas.qtd, 0)::int AS nao_lidas
       FROM conversas c
       JOIN anuncios a ON a.id = c.anuncio_id
       JOIN usuarios o
         ON o.id = CASE WHEN c.comprador_id = $1 THEN c.vendedor_id ELSE c.comprador_id END
       LEFT JOIN LATERAL (
         SELECT conteudo, remetente_id
           FROM mensagens m
          WHERE m.conversa_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
       ) ultima ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS qtd
           FROM mensagens m
          WHERE m.conversa_id = c.id
            AND m.remetente_id <> $1
            AND m.lida = FALSE
       ) nao_lidas ON TRUE
       WHERE c.comprador_id = $1 OR c.vendedor_id = $1
       ORDER BY c.ultima_mensagem_em DESC
       LIMIT 50`,
      [req.userId]
    );

    const total_nao_lidas = resultado.rows.reduce((soma, c) => soma + c.nao_lidas, 0);

    return res.json({ conversas: resultado.rows, total_nao_lidas });

  } catch (erro) {
    console.error('Erro ao listar conversas:', erro);
    return res.status(500).json({ erro: 'Erro ao listar conversas.' });
  }
});

// ============================================================
//  CHAT — mensagens de uma conversa
//  ?antes_de=<id>  → carrega o histórico mais antigo (rolagem)
//  ?depois_de=<id> → busca só o que chegou depois (atualização)
// ============================================================
router.get('/api/conversas/:id/mensagens', autenticar, async (req, res) => {
  try {
    const conversaId = req.params.id;
    const { antes_de, depois_de } = req.query;
    const limite = Math.min(parseInt(req.query.limite) || 30, 100);

    // Confere se o usuário faz parte da conversa
    const conversa = await pool.query(
      `SELECT c.id, c.anuncio_id, c.comprador_id, c.vendedor_id,
              a.titulo AS anuncio_titulo, a.preco AS anuncio_preco, a.status AS anuncio_status,
              (SELECT imagem FROM anuncio_imagens
                WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS anuncio_imagem
         FROM conversas c
         JOIN anuncios a ON a.id = c.anuncio_id
        WHERE c.id = $1`,
      [conversaId]
    );

    if (conversa.rows.length === 0) {
      return res.status(404).json({ erro: 'Conversa não encontrada.' });
    }

    const dadosConversa = conversa.rows[0];
    const participa =
      dadosConversa.comprador_id === req.userId || dadosConversa.vendedor_id === req.userId;

    if (!participa) {
      return res.status(403).json({ erro: 'Esta conversa não é sua.' });
    }

    let mensagens;

    if (depois_de) {
      // Só o que chegou depois — é o que a tela pede de tempos em tempos
      mensagens = await pool.query(
        `SELECT id, conteudo, remetente_id, lida, enviada_em
           FROM mensagens
          WHERE conversa_id = $1 AND id > $2
          ORDER BY id ASC
          LIMIT $3`,
        [conversaId, depois_de, limite]
      );
    } else {
      // Histórico: pega as mais novas (ou anteriores a um id) e inverte
      mensagens = await pool.query(
        `SELECT id, conteudo, remetente_id, lida, enviada_em
           FROM mensagens
          WHERE conversa_id = $1
            AND ($2::bigint IS NULL OR id < $2)
          ORDER BY id DESC
          LIMIT $3`,
        [conversaId, antes_de || null, limite]
      );
      mensagens.rows.reverse();
    }

    // Marca como lidas as mensagens que o outro mandou
    await pool.query(
      `UPDATE mensagens
          SET lida = TRUE
        WHERE conversa_id = $1 AND remetente_id <> $2 AND lida = FALSE`,
      [conversaId, req.userId]
    );

    return res.json({
      mensagens: mensagens.rows,
      // com menos que o limite, chegamos no começo da conversa
      tem_mais: !depois_de && mensagens.rows.length === limite,
      conversa: {
        id: dadosConversa.id,
        anuncio_id: dadosConversa.anuncio_id,
        anuncio_titulo: dadosConversa.anuncio_titulo,
        anuncio_preco: dadosConversa.anuncio_preco,
        anuncio_status: dadosConversa.anuncio_status,
        anuncio_imagem: dadosConversa.anuncio_imagem,
        meu_papel: dadosConversa.comprador_id === req.userId ? 'comprador' : 'vendedor',
      },
    });

  } catch (erro) {
    console.error('Erro ao buscar mensagens:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar mensagens.' });
  }
});

// ============================================================
//  CHAT — envia uma mensagem
// ============================================================
router.post('/api/conversas/:id/mensagens', autenticar, async (req, res) => {
  try {
    const conversaId = req.params.id;
    const { conteudo } = req.body;

    if (!conteudo || conteudo.trim().length === 0) {
      return res.status(400).json({ erro: 'A mensagem não pode ficar vazia.' });
    }
    if (conteudo.length > 1000) {
      return res.status(400).json({ erro: 'Mensagem muito longa (máximo 1000 caracteres).' });
    }

    // RN09 — mesma moderação usada nos anúncios
    if (conteudoTemPalavrasProibidas(conteudo)) {
      return res.status(400).json({
        erro: 'Sua mensagem contém conteúdo não permitido pelos Termos de Uso. [RN09]',
      });
    }

    const conversa = await pool.query(
      `SELECT c.comprador_id, c.vendedor_id, a.titulo AS anuncio_titulo, r.nome AS remetente_nome
         FROM conversas c
         JOIN anuncios a ON a.id = c.anuncio_id
         JOIN usuarios r ON r.id = $2
        WHERE c.id = $1`,
      [conversaId, req.userId]
    );

    if (conversa.rows.length === 0) {
      return res.status(404).json({ erro: 'Conversa não encontrada.' });
    }

    const { comprador_id, vendedor_id, anuncio_titulo, remetente_nome } = conversa.rows[0];
    if (comprador_id !== req.userId && vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Esta conversa não é sua.' });
    }

    const nova = await pool.query(
      `INSERT INTO mensagens (conversa_id, remetente_id, conteudo)
       VALUES ($1, $2, $3)
       RETURNING id, conteudo, remetente_id, lida, enviada_em`,
      [conversaId, req.userId, conteudo.trim()]
    );

    // Mantém a conversa no topo da lista
    await pool.query(
      'UPDATE conversas SET ultima_mensagem_em = NOW() WHERE id = $1',
      [conversaId]
    );

    // [RF18] Notifica quem recebeu a mensagem (in-app + e-mail)
    const destinatarioId = req.userId === comprador_id ? vendedor_id : comprador_id;
    criarNotificacao(
      destinatarioId,
      'nova_mensagem',
      `Nova mensagem de ${remetente_nome}`,
      `${remetente_nome} enviou uma mensagem sobre o anúncio "${anuncio_titulo}": "${conteudo.trim().slice(0, 140)}"`,
      '/mensagens'
    );

    return res.status(201).json({ mensagem: nova.rows[0] });

  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    return res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

module.exports = router;
