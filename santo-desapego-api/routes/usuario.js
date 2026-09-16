const express = require('express');
const bcrypt  = require('bcrypt');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { validarSenhaForte } = require('../utils/validacao');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');
const { excluirOuAnonimizarUsuario } = require('../utils/usuarios');

const router = express.Router();

// ============================================================
//  GET PERFIL PÚBLICO — dados não sensíveis de qualquer usuário [RF05]
//  Sem autenticação: qualquer visitante pode ver o perfil público de
//  um vendedor/comprador (nome, foto, reputação, tempo de cadastro,
//  quantidade de transações, anúncios ativos). Nunca expõe e-mail,
//  CPF, telefone ou endereço — só o que já é público na plataforma.
// ============================================================
router.get('/api/usuarios/:id/publico', async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ erro: 'ID de usuário inválido.' });
    }

    const resultado = await pool.query(
      `SELECT id, nome, sobrenome, foto_perfil, data_cadastro
         FROM usuarios WHERE id = $1 AND anonimizada_em IS NULL`,
      [id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    const usuario = resultado.rows[0];

    const avaliacoes = await pool.query(
      `SELECT AVG(nota)::float AS media, COUNT(*) AS total
         FROM avaliacoes WHERE avaliado_id = $1`,
      [id]
    );

    const transacoes = await pool.query(
      `SELECT COUNT(*) AS total FROM compras
        WHERE (comprador_id = $1 OR vendedor_id = $1) AND status = 'approved'`,
      [id]
    );

    const anuncios = await pool.query(
      `SELECT a.id, a.titulo, a.preco, a.bairro, a.estado_conservacao,
              c.nome AS categoria_nome,
              (SELECT imagem FROM anuncio_imagens
                WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS imagem_principal
         FROM anuncios a
         JOIN categorias c ON c.id = a.categoria_id
        WHERE a.vendedor_id = $1 AND a.status = 'ativo'
        ORDER BY a.data_criacao DESC
        LIMIT 12`,
      [id]
    );

    return res.json({
      usuario: {
        id: usuario.id,
        nome_exibicao: `${usuario.nome} ${usuario.sobrenome}`.trim(),
        foto_perfil: usuario.foto_perfil,
        membro_desde: usuario.data_cadastro,
      },
      reputacao: {
        media: avaliacoes.rows[0]?.media ?? null,
        total_avaliacoes: parseInt(avaliacoes.rows[0]?.total) || 0,
      },
      total_transacoes: parseInt(transacoes.rows[0]?.total) || 0,
      anuncios_ativos: anuncios.rows,
    });
  } catch (erro) {
    console.error('Erro ao buscar perfil público:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar perfil público.' });
  }
});

// ============================================================
//  GET PERFIL — com estatísticas REAIS do banco
// ============================================================
router.get('/api/usuario/perfil', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, sobrenome, cpf, telefone, email,
              cep, logradouro, numero, complemento, bairro,
              recebe_newsletter, aceita_termos, foto_perfil, papel,
              termos_versao, termos_aceitos_em
       FROM usuarios WHERE id = $1`, [req.userId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const usuario = resultado.rows[0];
    // [RF03] Sinaliza se o usuário aceitou uma versão anterior dos Termos
    usuario.termos_versao_atual = TERMOS_VERSAO_ATUAL;
    usuario.termos_atualizados = usuario.termos_versao !== TERMOS_VERSAO_ATUAL;

    // Estatísticas reais do banco
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ativo')   AS anuncios_ativos,
         COUNT(*) FILTER (WHERE status = 'vendido') AS anuncios_vendidos,
         COUNT(*) FILTER (WHERE status = 'pausado') AS anuncios_pausados
       FROM anuncios WHERE vendedor_id = $1`, [req.userId]
    );

    const compras = await pool.query(
      `SELECT COUNT(*) AS total
       FROM compras WHERE comprador_id = $1 AND status = 'approved'`, [req.userId]
    );

    const avaliacoes = await pool.query(
      `SELECT AVG(nota)::float AS media, COUNT(*) AS total
       FROM avaliacoes WHERE avaliado_id = $1`, [req.userId]
    );

    const estatisticas = {
      anuncios_ativos:    parseInt(stats.rows[0]?.anuncios_ativos)   || 0,
      anuncios_vendidos:  parseInt(stats.rows[0]?.anuncios_vendidos) || 0,
      anuncios_pausados:  parseInt(stats.rows[0]?.anuncios_pausados) || 0,
      compras_realizadas: parseInt(compras.rows[0]?.total) || 0,
      reputacao_media:    avaliacoes.rows[0]?.media ?? null,
      total_avaliacoes:   parseInt(avaliacoes.rows[0]?.total) || 0,
      mensagens_nao_lidas: 0,
    };

    return res.json({ usuario, estatisticas });
  } catch (erro) {
    console.error('Erro ao buscar perfil:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar perfil.' });
  }
});

// ============================================================
//  PUT ACEITAR TERMOS — (re)registra o aceite eletrônico dos
//  Termos de Uso / Política de Privacidade [RF03]. Usada tanto
//  para o aceite inicial quanto para reaceite após uma revisão
//  relevante do documento (quando termos_atualizados = true).
// ============================================================
router.put('/api/usuario/aceitar-termos', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios
          SET aceita_termos = TRUE, termos_versao = $1, termos_aceitos_em = NOW()
        WHERE id = $2
        RETURNING termos_versao, termos_aceitos_em`,
      [TERMOS_VERSAO_ATUAL, req.userId]
    );

    return res.json({
      mensagem: 'Termos de Uso e Política de Privacidade aceitos com sucesso.',
      ...resultado.rows[0],
    });
  } catch (erro) {
    console.error('Erro ao registrar aceite dos termos:', erro);
    return res.status(500).json({ erro: 'Erro ao registrar o aceite dos termos.' });
  }
});

// ============================================================
//  PUT PERFIL
// ============================================================
router.put('/api/usuario/perfil', autenticar, async (req, res) => {
  try {
    const {
      nome, sobrenome, telefone,
      cep, logradouro, numero, complemento, bairro,
      recebe_newsletter
    } = req.body;

    if (!nome || !sobrenome) {
      return res.status(400).json({ erro: 'Nome e sobrenome são obrigatórios.' });
    }

    const resultado = await pool.query(
      `UPDATE usuarios SET
         nome = $1, sobrenome = $2, telefone = $3,
         cep = $4, logradouro = $5, numero = $6,
         complemento = $7, bairro = $8,
         recebe_newsletter = $9
       WHERE id = $10
       RETURNING id, nome, sobrenome, email, bairro, foto_perfil`,
      [
        nome.trim(), sobrenome.trim(), telefone || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null,
        recebe_newsletter === true,
        req.userId
      ]
    );

    return res.json({
      mensagem: 'Perfil atualizado com sucesso!',
      usuario: resultado.rows[0]
    });
  } catch (erro) {
    console.error('Erro ao atualizar perfil:', erro);
    return res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
  }
});

// ============================================================
//  PUT FOTO DE PERFIL
// ============================================================
router.put('/api/usuario/foto', autenticar, async (req, res) => {
  try {
    const { foto_perfil } = req.body;

    if (foto_perfil !== null && typeof foto_perfil !== 'string') {
      return res.status(400).json({ erro: 'Formato de foto inválido.' });
    }

    if (foto_perfil && foto_perfil.length > 700000) {
      return res.status(400).json({
        erro: 'A foto está muito grande. Tente uma imagem menor.'
      });
    }

    if (foto_perfil && !foto_perfil.startsWith('data:image/')) {
      return res.status(400).json({ erro: 'Formato de imagem não suportado.' });
    }

    await pool.query(
      'UPDATE usuarios SET foto_perfil = $1 WHERE id = $2',
      [foto_perfil, req.userId]
    );

    return res.json({
      mensagem: foto_perfil ? 'Foto atualizada!' : 'Foto removida!',
      foto_perfil
    });
  } catch (erro) {
    console.error('Erro ao atualizar foto:', erro);
    return res.status(500).json({ erro: 'Erro ao atualizar foto.' });
  }
});

// ============================================================
//  PUT SENHA
// ============================================================
router.put('/api/usuario/senha', autenticar, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
    }

    const resultado = await pool.query(
      'SELECT nome, sobrenome, senha FROM usuarios WHERE id = $1',
      [req.userId]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const usuario = resultado.rows[0];
    const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    const erroSenha = validarSenhaForte(novaSenha, {
      nome: usuario.nome, sobrenome: usuario.sobrenome
    });
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    const igualAntiga = await bcrypt.compare(novaSenha, usuario.senha);
    if (igualAntiga) {
      return res.status(400).json({ erro: 'A nova senha deve ser diferente da atual.' });
    }

    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [novaSenhaHash, req.userId]);

    return res.json({ mensagem: 'Senha alterada com sucesso!' });
  } catch (erro) {
    console.error('Erro ao trocar senha:', erro);
    return res.status(500).json({ erro: 'Erro ao alterar senha.' });
  }
});

// ============================================================
//  GET EXPORTAR — LGPD
// ============================================================
router.get('/api/usuario/exportar', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, sobrenome, cpf, telefone, email,
              cep, logradouro, numero, complemento, bairro,
              recebe_newsletter, aceita_termos, termos_versao, termos_aceitos_em
       FROM usuarios WHERE id = $1`, [req.userId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const usuario = resultado.rows[0];

    // [RF04] Exportação em CSV, além do JSON padrão
    if ((req.query.formato || '').toLowerCase() === 'csv') {
      const campos = Object.keys(usuario);
      const escapar = (v) => `"${v === null || v === undefined ? '' : String(v).replace(/"/g, '""')}"`;
      const csv = [
        campos.map(escapar).join(','),
        campos.map((c) => escapar(usuario[c])).join(','),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="santo-desapego-meus-dados.csv"');
      return res.send('﻿' + csv); // BOM — acentos corretos ao abrir no Excel
    }

    const dados = {
      exportadoEm: new Date().toISOString(),
      base_legal: 'Lei nº 13.709/2018 (LGPD), Art. 18, II — Direito de acesso aos dados',
      plataforma: 'Santo Desapego',
      usuario,
    };
    return res.json(dados);
  } catch (erro) {
    console.error('Erro ao exportar dados:', erro);
    return res.status(500).json({ erro: 'Erro ao exportar dados.' });
  }
});

// ============================================================
//  DELETE CONTA
// ============================================================
router.delete('/api/usuario/conta', autenticar, async (req, res) => {
  try {
    const { senhaConfirmacao } = req.body;
    if (!senhaConfirmacao) {
      return res.status(400).json({ erro: 'Informe sua senha para confirmar a exclusão.' });
    }

    const resultado = await pool.query('SELECT senha FROM usuarios WHERE id = $1', [req.userId]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await bcrypt.compare(senhaConfirmacao, resultado.rows[0].senha);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Senha incorreta.' });
    }

    // [RF04 / RN10] Anonimiza em vez de apagar se houver transações financeiras a preservar
    const { anonimizada } = await excluirOuAnonimizarUsuario(req.userId);
    console.log(
      anonimizada
        ? `🕶️  Conta anonimizada (possui transações) — usuário ID ${req.userId}`
        : `🗑️  Conta excluída — usuário ID ${req.userId}`
    );

    return res.json({
      anonimizada,
      mensagem: anonimizada
        ? 'Seus dados pessoais foram anonimizados. Como você possui transações concluídas, os registros financeiros são mantidos por 5 anos por exigência legal (RN10), sem identificar você.'
        : 'Conta excluída com sucesso. Sentiremos sua falta!',
    });
  } catch (erro) {
    console.error('Erro ao excluir conta:', erro);
    return res.status(500).json({ erro: 'Erro ao excluir conta.' });
  }
});

// ============================================================
//  GET MEUS ANÚNCIOS — anúncios do vendedor logado (todos status)
//  Usado na aba "Anúncios" do perfil.
// ============================================================
router.get('/api/usuario/anuncios', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         a.id, a.titulo, a.preco, a.status, a.estado_conservacao, a.data_criacao,
         c.nome AS categoria_nome,
         (SELECT imagem FROM anuncio_imagens
           WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS imagem_principal
       FROM anuncios a
       JOIN categorias c ON c.id = a.categoria_id
       WHERE a.vendedor_id = $1
       ORDER BY a.data_criacao DESC`,
      [req.userId]
    );

    return res.json({ anuncios: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar meus anúncios:', erro);
    return res.status(500).json({ erro: 'Erro ao listar seus anúncios.' });
  }
});

// ============================================================
//  GET MINHAS COMPRAS — compras do comprador logado [RF17]
//  Usado na aba "Compras" do perfil. Aceita filtro por status e
//  por período (data_inicio/data_fim, sobre a data da transação).
// ============================================================
router.get('/api/usuario/compras', autenticar, async (req, res) => {
  try {
    const { status, data_inicio, data_fim } = req.query;
    const params = [req.userId];
    let filtro = '';

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      params.push(statuses);
      filtro += ` AND co.status = ANY($${params.length}::text[])`;
    }
    if (data_inicio) {
      params.push(data_inicio);
      filtro += ` AND co.criada_em >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim);
      filtro += ` AND co.criada_em < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const resultado = await pool.query(
      `SELECT
         co.id, co.preco, co.status, co.metodo_pagamento, co.parcelas, co.criada_em,
         a.id AS anuncio_id, a.titulo AS anuncio_titulo,
         u.id AS vendedor_id, u.nome AS vendedor_nome, u.sobrenome AS vendedor_sobrenome,
         (SELECT imagem FROM anuncio_imagens
           WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS anuncio_imagem,
         (av.id IS NOT NULL) AS ja_avaliei
       FROM compras co
       JOIN anuncios a ON a.id = co.anuncio_id
       JOIN usuarios u ON u.id = co.vendedor_id
       LEFT JOIN avaliacoes av ON av.compra_id = co.id
       WHERE co.comprador_id = $1${filtro}
       ORDER BY co.criada_em DESC`,
      params
    );

    return res.json({ compras: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar compras:', erro);
    return res.status(500).json({ erro: 'Erro ao listar suas compras.' });
  }
});

// ============================================================
//  GET MINHAS VENDAS — vendas do vendedor logado [RF17]
//  Usado na aba "Vendas" do perfil. Mesmos filtros de compras.
// ============================================================
router.get('/api/usuario/vendas', autenticar, async (req, res) => {
  try {
    const { status, data_inicio, data_fim } = req.query;
    const params = [req.userId];
    let filtro = '';

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      params.push(statuses);
      filtro += ` AND co.status = ANY($${params.length}::text[])`;
    }
    if (data_inicio) {
      params.push(data_inicio);
      filtro += ` AND co.criada_em >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim);
      filtro += ` AND co.criada_em < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const resultado = await pool.query(
      `SELECT
         co.id, co.preco, co.status, co.metodo_pagamento, co.parcelas, co.criada_em,
         a.id AS anuncio_id, a.titulo AS anuncio_titulo,
         u.id AS comprador_id, u.nome AS comprador_nome, u.sobrenome AS comprador_sobrenome,
         (SELECT imagem FROM anuncio_imagens
           WHERE anuncio_id = a.id AND is_principal = TRUE LIMIT 1) AS anuncio_imagem
       FROM compras co
       JOIN anuncios a ON a.id = co.anuncio_id
       JOIN usuarios u ON u.id = co.comprador_id
       WHERE co.vendedor_id = $1${filtro}
       ORDER BY co.criada_em DESC`,
      params
    );

    return res.json({ vendas: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar vendas:', erro);
    return res.status(500).json({ erro: 'Erro ao listar suas vendas.' });
  }
});

// ============================================================
//  GET AVALIAÇÕES RECEBIDAS — avaliações de quem comprou de mim
//  Usado na aba "Avaliações" do perfil.
// ============================================================
router.get('/api/usuario/avaliacoes', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         av.id, av.nota, av.comentario, av.criada_em,
         u.nome AS avaliador_nome, u.foto_perfil AS avaliador_foto,
         a.titulo AS anuncio_titulo
       FROM avaliacoes av
       JOIN usuarios u ON u.id = av.avaliador_id
       JOIN compras co ON co.id = av.compra_id
       JOIN anuncios a ON a.id = co.anuncio_id
       WHERE av.avaliado_id = $1
       ORDER BY av.criada_em DESC`,
      [req.userId]
    );

    const mediaResultado = await pool.query(
      `SELECT AVG(nota)::float AS media, COUNT(*) AS total
       FROM avaliacoes WHERE avaliado_id = $1`,
      [req.userId]
    );

    return res.json({
      avaliacoes: resultado.rows,
      media: mediaResultado.rows[0]?.media ?? null,
      total: parseInt(mediaResultado.rows[0]?.total) || 0,
    });
  } catch (erro) {
    console.error('Erro ao listar avaliações:', erro);
    return res.status(500).json({ erro: 'Erro ao listar avaliações.' });
  }
});

// ============================================================
//  NOTIFICAÇÕES — sino do usuário [RF18]
// ============================================================
router.get('/api/notificacoes', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, tipo, titulo, mensagem, link, lida, criada_em
       FROM notificacoes WHERE usuario_id = $1
       ORDER BY criada_em DESC LIMIT 30`,
      [req.userId]
    );
    const naoLidas = await pool.query(
      `SELECT COUNT(*) FROM notificacoes WHERE usuario_id = $1 AND lida = FALSE`,
      [req.userId]
    );
    return res.json({
      notificacoes: resultado.rows,
      total_nao_lidas: parseInt(naoLidas.rows[0].count),
    });
  } catch (erro) {
    console.error('Erro ao listar notificações:', erro);
    return res.status(500).json({ erro: 'Erro ao listar notificações.' });
  }
});

router.put('/api/notificacoes/lidas-todas', autenticar, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND lida = FALSE`,
      [req.userId]
    );
    return res.json({ mensagem: 'Notificações marcadas como lidas.' });
  } catch (erro) {
    console.error('Erro ao marcar notificações como lidas:', erro);
    return res.status(500).json({ erro: 'Erro ao marcar notificações como lidas.' });
  }
});

router.put('/api/notificacoes/:id/lida', autenticar, async (req, res) => {
  try {
    const atualizada = await pool.query(
      `UPDATE notificacoes SET lida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [req.params.id, req.userId]
    );
    if (atualizada.rows.length === 0) {
      return res.status(404).json({ erro: 'Notificação não encontrada.' });
    }
    return res.json({ mensagem: 'Notificação marcada como lida.' });
  } catch (erro) {
    console.error('Erro ao marcar notificação como lida:', erro);
    return res.status(500).json({ erro: 'Erro ao marcar notificação como lida.' });
  }
});

module.exports = router;
