const express = require('express');
const pool = require('../db');
const { autenticarAdmin } = require('../middleware/auth');
const { registrarLog } = require('../utils/log');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');
const { excluirOuAnonimizarUsuario } = require('../utils/usuarios');

const router = express.Router();

// ════════════════════════════════════════════════════════════
//  PAINEL ADMINISTRATIVO [RF20]
//  Todas as rotas abaixo exigem papel = 'administrador'.
// ════════════════════════════════════════════════════════════

// ============================================================
//  GET DASHBOARD — resumo geral da plataforma
// ============================================================
router.get('/api/admin/dashboard', autenticarAdmin, async (req, res) => {
  try {
    const [usuariosR, anunciosR, comprasR, denunciasR, categoriasR, cadastrosR, suporteR] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status_conta = 'suspensa') AS suspensos
                  FROM usuarios`),
      pool.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status = 'ativo') AS ativos,
                    COUNT(*) FILTER (WHERE status = 'pausado') AS pausados,
                    COUNT(*) FILTER (WHERE status = 'vendido') AS vendidos
                  FROM anuncios`),
      pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(preco), 0) AS volume
                  FROM compras WHERE status = 'approved'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
                    COUNT(*) AS total
                  FROM denuncias`),
      pool.query(`SELECT c.nome, COUNT(a.id) AS total
                  FROM categorias c JOIN anuncios a ON a.categoria_id = c.id
                  GROUP BY c.id ORDER BY total DESC LIMIT 5`),
      pool.query(`SELECT gs::date AS dia, COUNT(u.id) AS total
                  FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') gs
                  LEFT JOIN usuarios u ON date_trunc('day', u.data_cadastro) = gs
                  GROUP BY gs ORDER BY gs`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('aberto', 'em_atendimento')) AS pendentes,
                    COUNT(*) AS total
                  FROM mensagens_suporte`),
    ]);

    return res.json({
      usuarios: { total: parseInt(usuariosR.rows[0].total), suspensos: parseInt(usuariosR.rows[0].suspensos) },
      anuncios: {
        total: parseInt(anunciosR.rows[0].total),
        ativos: parseInt(anunciosR.rows[0].ativos),
        pausados: parseInt(anunciosR.rows[0].pausados),
        vendidos: parseInt(anunciosR.rows[0].vendidos),
      },
      compras: { total: parseInt(comprasR.rows[0].total), volume: parseFloat(comprasR.rows[0].volume) },
      denuncias: { pendentes: parseInt(denunciasR.rows[0].pendentes), total: parseInt(denunciasR.rows[0].total) },
      suporte: { pendentes: parseInt(suporteR.rows[0].pendentes), total: parseInt(suporteR.rows[0].total) },
      top_categorias: categoriasR.rows.map((r) => ({ nome: r.nome, total: parseInt(r.total) })),
      cadastros_30_dias: cadastrosR.rows.map((r) => ({ dia: r.dia, total: parseInt(r.total) })),
    });
  } catch (erro) {
    console.error('Erro ao carregar dashboard administrativo:', erro);
    return res.status(500).json({ erro: 'Erro ao carregar o dashboard.' });
  }
});

// ============================================================
//  GET USUÁRIOS — lista com busca e paginação [Gerenciar Usuários]
// ============================================================
router.get('/api/admin/usuarios', autenticarAdmin, async (req, res) => {
  try {
    const { busca, status, pagina = 1, limite = 20 } = req.query;

    let query = `
      SELECT id, nome, sobrenome, email, bairro, papel, status_conta, data_cadastro,
             termos_versao, termos_aceitos_em
      FROM usuarios WHERE 1=1`;
    const params = [];

    if (busca) {
      params.push(`%${busca}%`);
      query += ` AND (nome ILIKE $${params.length} OR sobrenome ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    if (status) {
      params.push(status);
      query += ` AND status_conta = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY data_cadastro DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limite, (pagina - 1) * limite);

    const resultado = await pool.query(query, params);

    // [RF03] Sinaliza pra cada usuário se o aceite dos termos está desatualizado
    const usuarios = resultado.rows.map((u) => ({
      ...u,
      termos_atualizados: u.termos_versao !== TERMOS_VERSAO_ATUAL,
    }));

    return res.json({
      usuarios,
      paginacao: { pagina_atual: parseInt(pagina), total_paginas: Math.ceil(total / limite), total_itens: total },
    });
  } catch (erro) {
    console.error('Erro ao listar usuários (admin):', erro);
    return res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

// ============================================================
//  PUT SUSPENDER CONTA
// ============================================================
router.put('/api/admin/usuarios/:id/suspender', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (parseInt(id) === req.userId) {
      return res.status(400).json({ erro: 'Você não pode suspender sua própria conta.' });
    }

    const alvo = await pool.query('SELECT papel, nome, email FROM usuarios WHERE id = $1', [id]);
    if (alvo.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    if (alvo.rows[0].papel === 'administrador') {
      return res.status(400).json({ erro: 'Não é possível suspender outra conta de administrador.' });
    }

    await pool.query(`UPDATE usuarios SET status_conta = 'suspensa' WHERE id = $1`, [id]);
    registrarLog(req.userId, 'suspender_usuario', 'usuario', id, { motivo: motivo || null, email: alvo.rows[0].email });

    return res.json({ mensagem: `Conta de ${alvo.rows[0].nome} suspensa com sucesso.` });
  } catch (erro) {
    console.error('Erro ao suspender usuário:', erro);
    return res.status(500).json({ erro: 'Erro ao suspender usuário.' });
  }
});

// ============================================================
//  PUT REATIVAR CONTA
// ============================================================
router.put('/api/admin/usuarios/:id/reativar', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const alvo = await pool.query('SELECT nome, email FROM usuarios WHERE id = $1', [id]);
    if (alvo.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    await pool.query(`UPDATE usuarios SET status_conta = 'ativa' WHERE id = $1`, [id]);
    registrarLog(req.userId, 'reativar_usuario', 'usuario', id, { email: alvo.rows[0].email });

    return res.json({ mensagem: `Conta de ${alvo.rows[0].nome} reativada com sucesso.` });
  } catch (erro) {
    console.error('Erro ao reativar usuário:', erro);
    return res.status(500).json({ erro: 'Erro ao reativar usuário.' });
  }
});

// ============================================================
//  DELETE EXCLUIR CONTA (LGPD) — exclusão administrativa
// ============================================================
router.delete('/api/admin/usuarios/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (parseInt(id) === req.userId) {
      return res.status(400).json({ erro: 'Você não pode excluir sua própria conta por aqui.' });
    }

    const alvo = await pool.query('SELECT papel, nome, email FROM usuarios WHERE id = $1', [id]);
    if (alvo.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    if (alvo.rows[0].papel === 'administrador') {
      return res.status(400).json({ erro: 'Não é possível excluir outra conta de administrador.' });
    }

    // [RF04 / RN10] Anonimiza em vez de apagar se houver transações financeiras a preservar
    const { anonimizada } = await excluirOuAnonimizarUsuario(id);
    registrarLog(req.userId, anonimizada ? 'anonimizar_usuario' : 'excluir_usuario', 'usuario', id, {
      motivo: motivo || null, nome: alvo.rows[0].nome, email: alvo.rows[0].email,
    });

    return res.json({
      anonimizada,
      mensagem: anonimizada
        ? `Conta de ${alvo.rows[0].nome} anonimizada (possui transações financeiras preservadas por obrigação legal — RN10).`
        : `Conta de ${alvo.rows[0].nome} excluída com sucesso.`,
    });
  } catch (erro) {
    console.error('Erro ao excluir usuário (admin):', erro);
    return res.status(500).json({ erro: 'Erro ao excluir usuário.' });
  }
});

// ============================================================
//  GET ANÚNCIOS — lista para moderação [Gerenciar Anúncios]
// ============================================================
router.get('/api/admin/anuncios', autenticarAdmin, async (req, res) => {
  try {
    const { busca, status, pagina = 1, limite = 20 } = req.query;

    let query = `
      SELECT a.id, a.titulo, a.preco, a.status, a.data_criacao,
        u.id AS vendedor_id, u.nome AS vendedor_nome, u.email AS vendedor_email,
        c.nome AS categoria_nome,
        (SELECT COUNT(*) FROM denuncias WHERE anuncio_id = a.id) AS total_denuncias
      FROM anuncios a
      JOIN usuarios u ON u.id = a.vendedor_id
      JOIN categorias c ON c.id = a.categoria_id
      WHERE 1=1`;
    const params = [];

    if (busca) {
      params.push(`%${busca}%`);
      query += ` AND a.titulo ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND a.status = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY total_denuncias DESC, a.data_criacao DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limite, (pagina - 1) * limite);

    const resultado = await pool.query(query, params);
    resultado.rows.forEach((r) => { r.total_denuncias = parseInt(r.total_denuncias); });

    return res.json({
      anuncios: resultado.rows,
      paginacao: { pagina_atual: parseInt(pagina), total_paginas: Math.ceil(total / limite), total_itens: total },
    });
  } catch (erro) {
    console.error('Erro ao listar anúncios (admin):', erro);
    return res.status(500).json({ erro: 'Erro ao listar anúncios.' });
  }
});

// ============================================================
//  PUT MODERAR ANÚNCIO — pausa ou reativa
// ============================================================
router.put('/api/admin/anuncios/:id/moderar', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { acao, motivo } = req.body;

    if (!['pausar', 'reativar'].includes(acao)) {
      return res.status(400).json({ erro: "Ação inválida. Use 'pausar' ou 'reativar'." });
    }

    const anuncio = await pool.query('SELECT titulo, status FROM anuncios WHERE id = $1', [id]);
    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (anuncio.rows[0].status === 'vendido') {
      return res.status(400).json({ erro: 'Não é possível moderar um anúncio já vendido.' });
    }

    const novoStatus = acao === 'pausar' ? 'pausado' : 'ativo';
    await pool.query('UPDATE anuncios SET status = $1 WHERE id = $2', [novoStatus, id]);
    registrarLog(req.userId, 'moderar_anuncio', 'anuncio', id, {
      acao, motivo: motivo || null, titulo: anuncio.rows[0].titulo,
    });

    return res.json({ mensagem: `Anúncio "${anuncio.rows[0].titulo}" ${acao === 'pausar' ? 'pausado' : 'reativado'} com sucesso.` });
  } catch (erro) {
    console.error('Erro ao moderar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao moderar anúncio.' });
  }
});

// ============================================================
//  DELETE REMOVER ANÚNCIO — exclusão definitiva
//  Bloqueada se já existirem compras vinculadas (histórico
//  financeiro deve ser preservado); nesse caso, use "moderar".
// ============================================================
router.delete('/api/admin/anuncios/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const anuncio = await pool.query('SELECT titulo FROM anuncios WHERE id = $1', [id]);
    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }

    const compras = await pool.query('SELECT COUNT(*) FROM compras WHERE anuncio_id = $1', [id]);
    if (parseInt(compras.rows[0].count) > 0) {
      return res.status(409).json({
        erro: 'Este anúncio possui compras registradas e não pode ser removido. Use "pausar" para tirá-lo de circulação.',
      });
    }

    await pool.query('DELETE FROM anuncios WHERE id = $1', [id]);
    registrarLog(req.userId, 'remover_anuncio', 'anuncio', id, {
      motivo: motivo || null, titulo: anuncio.rows[0].titulo,
    });

    return res.json({ mensagem: `Anúncio "${anuncio.rows[0].titulo}" removido com sucesso.` });
  } catch (erro) {
    console.error('Erro ao remover anúncio (admin):', erro);
    return res.status(500).json({ erro: 'Erro ao remover anúncio.' });
  }
});

// ============================================================
//  GET CATEGORIAS (ADMIN) — lista plana com uso [Gerenciar Categorias]
// ============================================================
router.get('/api/admin/categorias', autenticarAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT c.id, c.nome, c.slug, c.icone, c.categoria_pai, c.ordem,
        (SELECT COUNT(*) FROM anuncios WHERE categoria_id = c.id) AS total_anuncios
      FROM categorias c
      ORDER BY c.categoria_pai NULLS FIRST, c.ordem, c.nome`);
    resultado.rows.forEach((r) => { r.total_anuncios = parseInt(r.total_anuncios); });
    return res.json({ categorias: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar categorias (admin):', erro);
    return res.status(500).json({ erro: 'Erro ao listar categorias.' });
  }
});

// ============================================================
//  POST CATEGORIA — cria categoria ou subcategoria
// ============================================================
router.post('/api/admin/categorias', autenticarAdmin, async (req, res) => {
  try {
    const { nome, slug, icone, categoria_pai, ordem } = req.body;
    if (!nome || !slug) {
      return res.status(400).json({ erro: 'Nome e slug são obrigatórios.' });
    }

    const nova = await pool.query(
      `INSERT INTO categorias (nome, slug, icone, categoria_pai, ordem)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome.trim(), slug.trim().toLowerCase(), icone || null, categoria_pai || null, ordem || 0]
    );
    registrarLog(req.userId, 'criar_categoria', 'categoria', nova.rows[0].id, { nome });

    return res.status(201).json({ mensagem: 'Categoria criada com sucesso!', categoria: nova.rows[0] });
  } catch (erro) {
    if (erro.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma categoria com esse slug.' });
    }
    console.error('Erro ao criar categoria:', erro);
    return res.status(500).json({ erro: 'Erro ao criar categoria.' });
  }
});

// ============================================================
//  PUT CATEGORIA — edita categoria existente
// ============================================================
router.put('/api/admin/categorias/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, slug, icone, categoria_pai, ordem } = req.body;
    if (!nome || !slug) {
      return res.status(400).json({ erro: 'Nome e slug são obrigatórios.' });
    }
    if (parseInt(categoria_pai) === parseInt(id)) {
      return res.status(400).json({ erro: 'Uma categoria não pode ser subcategoria de si mesma.' });
    }

    const atualizada = await pool.query(
      `UPDATE categorias SET nome = $1, slug = $2, icone = $3, categoria_pai = $4, ordem = $5
       WHERE id = $6 RETURNING *`,
      [nome.trim(), slug.trim().toLowerCase(), icone || null, categoria_pai || null, ordem || 0, id]
    );
    if (atualizada.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' });
    }
    registrarLog(req.userId, 'editar_categoria', 'categoria', id, { nome });

    return res.json({ mensagem: 'Categoria atualizada com sucesso!', categoria: atualizada.rows[0] });
  } catch (erro) {
    if (erro.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma categoria com esse slug.' });
    }
    console.error('Erro ao editar categoria:', erro);
    return res.status(500).json({ erro: 'Erro ao editar categoria.' });
  }
});

// ============================================================
//  DELETE CATEGORIA
// ============================================================
router.delete('/api/admin/categorias/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const categoria = await pool.query('SELECT nome FROM categorias WHERE id = $1', [id]);
    if (categoria.rows.length === 0) {
      return res.status(404).json({ erro: 'Categoria não encontrada.' });
    }

    await pool.query('DELETE FROM categorias WHERE id = $1', [id]);
    registrarLog(req.userId, 'excluir_categoria', 'categoria', id, { nome: categoria.rows[0].nome });

    return res.json({ mensagem: 'Categoria removida com sucesso!' });
  } catch (erro) {
    if (erro.code === '23503') {
      return res.status(409).json({
        erro: 'Esta categoria possui anúncios ou subcategorias vinculadas e não pode ser removida.',
      });
    }
    console.error('Erro ao excluir categoria:', erro);
    return res.status(500).json({ erro: 'Erro ao excluir categoria.' });
  }
});

// ============================================================
//  GET DENÚNCIAS — fila de moderação [Visualizar denúncias]
// ============================================================
router.get('/api/admin/denuncias', autenticarAdmin, async (req, res) => {
  try {
    const { status, pagina = 1, limite = 20 } = req.query;

    let query = `
      SELECT d.id, d.motivo, d.descricao, d.status, d.resolucao, d.criada_em, d.resolvida_em,
        den.id AS denunciante_id, den.nome AS denunciante_nome,
        alvo.id AS denunciado_id, alvo.nome AS denunciado_nome,
        a.id AS anuncio_id, a.titulo AS anuncio_titulo
      FROM denuncias d
      JOIN usuarios den ON den.id = d.denunciante_id
      LEFT JOIN usuarios alvo ON alvo.id = d.usuario_denunciado_id
      LEFT JOIN anuncios a ON a.id = d.anuncio_id
      WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND d.status = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY d.criada_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limite, (pagina - 1) * limite);

    const resultado = await pool.query(query, params);

    return res.json({
      denuncias: resultado.rows,
      paginacao: { pagina_atual: parseInt(pagina), total_paginas: Math.ceil(total / limite), total_itens: total },
    });
  } catch (erro) {
    console.error('Erro ao listar denúncias:', erro);
    return res.status(500).json({ erro: 'Erro ao listar denúncias.' });
  }
});

// ============================================================
//  PUT DENÚNCIA — atualiza status/resolução [Mediar disputas]
// ============================================================
router.put('/api/admin/denuncias/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolucao } = req.body;

    const statusValidos = ['pendente', 'em_analise', 'resolvida', 'arquivada'];
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const finalizando = ['resolvida', 'arquivada'].includes(status);
    const atualizada = await pool.query(
      `UPDATE denuncias SET status = $1, resolucao = $2,
         resolvida_por = ${finalizando ? '$3' : 'resolvida_por'},
         resolvida_em = ${finalizando ? 'NOW()' : 'resolvida_em'}
       WHERE id = ${finalizando ? '$4' : '$3'} RETURNING *`,
      finalizando ? [status, resolucao || null, req.userId, id] : [status, resolucao || null, id]
    );

    if (atualizada.rows.length === 0) {
      return res.status(404).json({ erro: 'Denúncia não encontrada.' });
    }
    registrarLog(req.userId, 'resolver_denuncia', 'denuncia', id, { status, resolucao: resolucao || null });

    return res.json({ mensagem: 'Denúncia atualizada com sucesso!', denuncia: atualizada.rows[0] });
  } catch (erro) {
    console.error('Erro ao atualizar denúncia:', erro);
    return res.status(500).json({ erro: 'Erro ao atualizar denúncia.' });
  }
});

// ============================================================
//  GET SUPORTE (ADMIN) — fila da Central de Ajuda
// ============================================================
router.get('/api/admin/suporte', autenticarAdmin, async (req, res) => {
  try {
    const { status, pagina = 1, limite = 20 } = req.query;

    let query = `
      SELECT s.id, s.assunto, s.mensagem, s.status, s.resposta, s.criada_em, s.respondida_em,
        u.id AS usuario_id, u.nome AS usuario_nome, u.email AS usuario_email
      FROM mensagens_suporte s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND s.status = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY s.criada_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limite, (pagina - 1) * limite);

    const resultado = await pool.query(query, params);

    return res.json({
      solicitacoes: resultado.rows,
      paginacao: { pagina_atual: parseInt(pagina), total_paginas: Math.ceil(total / limite), total_itens: total },
    });
  } catch (erro) {
    console.error('Erro ao listar mensagens de suporte:', erro);
    return res.status(500).json({ erro: 'Erro ao listar mensagens de suporte.' });
  }
});

// ============================================================
//  PUT SUPORTE (ADMIN) — responde e/ou atualiza o status
// ============================================================
router.put('/api/admin/suporte/:id', autenticarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resposta } = req.body;

    const statusValidos = ['aberto', 'em_atendimento', 'respondido', 'encerrado'];
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const respondendo = ['respondido', 'encerrado'].includes(status);
    const atualizada = await pool.query(
      `UPDATE mensagens_suporte SET status = $1, resposta = $2,
         respondida_por = ${respondendo ? '$3' : 'respondida_por'},
         respondida_em = ${respondendo ? 'NOW()' : 'respondida_em'}
       WHERE id = ${respondendo ? '$4' : '$3'} RETURNING *`,
      respondendo ? [status, resposta || null, req.userId, id] : [status, resposta || null, id]
    );

    if (atualizada.rows.length === 0) {
      return res.status(404).json({ erro: 'Mensagem de suporte não encontrada.' });
    }
    registrarLog(req.userId, 'responder_suporte', 'mensagem_suporte', id, { status, resposta: resposta || null });

    return res.json({ mensagem: 'Solicitação atualizada com sucesso!', solicitacao: atualizada.rows[0] });
  } catch (erro) {
    console.error('Erro ao atualizar mensagem de suporte:', erro);
    return res.status(500).json({ erro: 'Erro ao atualizar a solicitação.' });
  }
});

// ============================================================
//  GET LOGS DE AUDITORIA [Consultar Logs de Auditoria]
// ============================================================
router.get('/api/admin/logs', autenticarAdmin, async (req, res) => {
  try {
    const { pagina = 1, limite = 30 } = req.query;

    const total = await pool.query('SELECT COUNT(*) FROM logs_auditoria');
    const resultado = await pool.query(
      `SELECT l.id, l.acao, l.alvo_tipo, l.alvo_id, l.detalhes, l.criada_em,
         a.nome AS admin_nome, a.email AS admin_email
       FROM logs_auditoria l
       LEFT JOIN usuarios a ON a.id = l.admin_id
       ORDER BY l.criada_em DESC LIMIT $1 OFFSET $2`,
      [limite, (pagina - 1) * limite]
    );

    return res.json({
      logs: resultado.rows,
      paginacao: {
        pagina_atual: parseInt(pagina),
        total_paginas: Math.ceil(parseInt(total.rows[0].count) / limite),
        total_itens: parseInt(total.rows[0].count),
      },
    });
  } catch (erro) {
    console.error('Erro ao listar logs de auditoria:', erro);
    return res.status(500).json({ erro: 'Erro ao listar logs de auditoria.' });
  }
});

module.exports = router;
