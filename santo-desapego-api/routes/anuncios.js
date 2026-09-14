const express = require('express');
const pool = require('../db');
const { autenticar, autenticarOpcional } = require('../middleware/auth');
const { validarCEPSantoAmaro, conteudoTemPalavrasProibidas } = require('../utils/validacao');
const { distanciaEntreBairros } = require('../utils/geolocalizacao');

const router = express.Router();

// ============================================================
//  POST ANÚNCIO — cria com validações
// ============================================================
router.post('/api/anuncios', autenticar, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      titulo, descricao, preco, aceita_troca,
      estado_conservacao, categoria_id,
      cep, bairro,
      imagens
    } = req.body;

    // Validações básicas
    if (!titulo || titulo.trim().length < 5)
      return res.status(400).json({ erro: 'Título precisa ter pelo menos 5 caracteres.' });
    if (titulo.length > 120)
      return res.status(400).json({ erro: 'Título muito longo (máximo 120 caracteres).' });
    if (!descricao || descricao.trim().length < 20)
      return res.status(400).json({ erro: 'Descrição precisa ter pelo menos 20 caracteres.' });
    if (!preco || preco < 0)
      return res.status(400).json({ erro: 'Informe um preço válido.' });
    if (!['novo', 'seminovo', 'usado', 'para-reparo'].includes(estado_conservacao))
      return res.status(400).json({ erro: 'Estado de conservação inválido.' });
    if (!categoria_id)
      return res.status(400).json({ erro: 'Selecione uma categoria.' });

    // RN01 — Restrição Geográfica
    if (!validarCEPSantoAmaro(cep)) {
      return res.status(400).json({
        erro: 'Anúncios só podem ser publicados em CEPs de Santo Amaro e regiões limítrofes (zona sul de SP). [RN01]'
      });
    }

    // RN09 — Moderação de Conteúdo
    const palavraProibida = conteudoTemPalavrasProibidas(`${titulo} ${descricao}`);
    if (palavraProibida) {
      return res.status(400).json({
        erro: `Seu anúncio contém conteúdo não permitido pelos Termos de Uso. Revise o título e a descrição. [RN09]`
      });
    }

    // RFN19 — Limites de Upload
    if (!imagens || !Array.isArray(imagens) || imagens.length === 0)
      return res.status(400).json({ erro: 'Envie pelo menos 1 imagem do produto.' });
    if (imagens.length > 6)
      return res.status(400).json({ erro: 'Máximo de 6 imagens por anúncio.' });

    const tamanhoTotal = imagens.reduce((acc, img) => acc + (img?.length || 0), 0);
    if (tamanhoTotal > 5 * 1024 * 1024) {
      return res.status(400).json({ erro: 'Imagens muito grandes no total. Tente reduzir a quantidade ou qualidade.' });
    }

    for (const img of imagens) {
      if (typeof img !== 'string' || !img.startsWith('data:image/')) {
        return res.status(400).json({ erro: 'Uma das imagens está em formato inválido.' });
      }
    }

    // Verifica se categoria existe
    const cat = await client.query('SELECT id FROM categorias WHERE id = $1', [categoria_id]);
    if (cat.rows.length === 0) {
      return res.status(400).json({ erro: 'Categoria inválida.' });
    }

    // Inicia transação (ACID)
    await client.query('BEGIN');

    const cepLimpo = cep.replace(/\D/g, '');

    const novoAnuncio = await client.query(
      `INSERT INTO anuncios
        (vendedor_id, categoria_id, titulo, descricao, preco,
         aceita_troca, estado_conservacao, cep, bairro, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ativo')
       RETURNING id, titulo, preco, status, data_criacao`,
      [
        req.userId, categoria_id, titulo.trim(), descricao.trim(), preco,
        aceita_troca === true, estado_conservacao, cepLimpo, bairro || null
      ]
    );

    const anuncioId = novoAnuncio.rows[0].id;

    // Insere imagens (a primeira é a principal)
    for (let i = 0; i < imagens.length; i++) {
      await client.query(
        `INSERT INTO anuncio_imagens (anuncio_id, imagem, ordem, is_principal)
         VALUES ($1, $2, $3, $4)`,
        [anuncioId, imagens[i], i, i === 0]
      );
    }

    await client.query('COMMIT');

    console.log(`📦 Anúncio #${anuncioId} criado por usuário #${req.userId}`);

    return res.status(201).json({
      mensagem: 'Anúncio publicado com sucesso!',
      anuncio: novoAnuncio.rows[0]
    });

  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao publicar anúncio.' });
  } finally {
    client.release();
  }
});

// ============================================================
//  PUT ANÚNCIO — vendedor edita o próprio anúncio [RF12]
// ============================================================
router.put('/api/anuncios/:id', autenticar, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const atual = await client.query('SELECT vendedor_id, status FROM anuncios WHERE id = $1', [id]);

    if (atual.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (atual.rows[0].vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode editar os seus próprios anúncios.' });
    }
    if (atual.rows[0].status === 'vendido') {
      return res.status(400).json({ erro: 'Não é possível editar um anúncio já vendido.' });
    }

    const {
      titulo, descricao, preco, aceita_troca,
      estado_conservacao, categoria_id,
      cep, bairro,
      imagens
    } = req.body;

    // Mesmas validações do cadastro do anúncio
    if (!titulo || titulo.trim().length < 5)
      return res.status(400).json({ erro: 'Título precisa ter pelo menos 5 caracteres.' });
    if (titulo.length > 120)
      return res.status(400).json({ erro: 'Título muito longo (máximo 120 caracteres).' });
    if (!descricao || descricao.trim().length < 20)
      return res.status(400).json({ erro: 'Descrição precisa ter pelo menos 20 caracteres.' });
    if (!preco || preco < 0)
      return res.status(400).json({ erro: 'Informe um preço válido.' });
    if (!['novo', 'seminovo', 'usado', 'para-reparo'].includes(estado_conservacao))
      return res.status(400).json({ erro: 'Estado de conservação inválido.' });
    if (!categoria_id)
      return res.status(400).json({ erro: 'Selecione uma categoria.' });

    if (!validarCEPSantoAmaro(cep)) {
      return res.status(400).json({
        erro: 'Anúncios só podem ser publicados em CEPs de Santo Amaro e regiões limítrofes (zona sul de SP). [RN01]'
      });
    }

    const palavraProibida = conteudoTemPalavrasProibidas(`${titulo} ${descricao}`);
    if (palavraProibida) {
      return res.status(400).json({
        erro: 'Seu anúncio contém conteúdo não permitido pelos Termos de Uso. Revise o título e a descrição. [RN09]'
      });
    }

    const cat = await client.query('SELECT id FROM categorias WHERE id = $1', [categoria_id]);
    if (cat.rows.length === 0) {
      return res.status(400).json({ erro: 'Categoria inválida.' });
    }

    // Imagens são opcionais na edição — só substitui se o vendedor mandou um novo conjunto
    if (imagens !== undefined) {
      if (!Array.isArray(imagens) || imagens.length === 0)
        return res.status(400).json({ erro: 'Envie pelo menos 1 imagem do produto.' });
      if (imagens.length > 6)
        return res.status(400).json({ erro: 'Máximo de 6 imagens por anúncio.' });

      const tamanhoTotal = imagens.reduce((acc, img) => acc + (img?.length || 0), 0);
      if (tamanhoTotal > 5 * 1024 * 1024) {
        return res.status(400).json({ erro: 'Imagens muito grandes no total. Tente reduzir a quantidade ou qualidade.' });
      }
      for (const img of imagens) {
        if (typeof img !== 'string' || !img.startsWith('data:image/')) {
          return res.status(400).json({ erro: 'Uma das imagens está em formato inválido.' });
        }
      }
    }

    await client.query('BEGIN');

    const cepLimpo = cep.replace(/\D/g, '');

    const atualizado = await client.query(
      `UPDATE anuncios SET
         titulo = $1, descricao = $2, preco = $3, aceita_troca = $4,
         estado_conservacao = $5, categoria_id = $6, cep = $7, bairro = $8,
         data_atualizacao = NOW()
       WHERE id = $9
       RETURNING id, titulo, preco, status, data_atualizacao`,
      [
        titulo.trim(), descricao.trim(), preco, aceita_troca === true,
        estado_conservacao, categoria_id, cepLimpo, bairro || null, id
      ]
    );

    if (imagens !== undefined) {
      await client.query('DELETE FROM anuncio_imagens WHERE anuncio_id = $1', [id]);
      for (let i = 0; i < imagens.length; i++) {
        await client.query(
          `INSERT INTO anuncio_imagens (anuncio_id, imagem, ordem, is_principal)
           VALUES ($1, $2, $3, $4)`,
          [id, imagens[i], i, i === 0]
        );
      }
    }

    await client.query('COMMIT');

    return res.json({ mensagem: 'Anúncio atualizado com sucesso!', anuncio: atualizado.rows[0] });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao editar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao editar anúncio.' });
  } finally {
    client.release();
  }
});

// ============================================================
//  PUT PAUSAR ANÚNCIO — vendedor tira o próprio anúncio de circulação [RF12]
// ============================================================
router.put('/api/anuncios/:id/pausar', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const anuncio = await pool.query('SELECT vendedor_id, status FROM anuncios WHERE id = $1', [id]);

    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (anuncio.rows[0].vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode pausar os seus próprios anúncios.' });
    }
    if (anuncio.rows[0].status !== 'ativo') {
      return res.status(400).json({ erro: 'Só é possível pausar um anúncio que está ativo.' });
    }

    await pool.query("UPDATE anuncios SET status = 'pausado', data_atualizacao = NOW() WHERE id = $1", [id]);
    return res.json({ mensagem: 'Anúncio pausado. Ele não aparece mais nas buscas até você reativá-lo.' });
  } catch (erro) {
    console.error('Erro ao pausar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao pausar anúncio.' });
  }
});

// ============================================================
//  PUT REATIVAR ANÚNCIO — volta a circular [RF12]
// ============================================================
router.put('/api/anuncios/:id/reativar', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const anuncio = await pool.query('SELECT vendedor_id, status FROM anuncios WHERE id = $1', [id]);

    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (anuncio.rows[0].vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode reativar os seus próprios anúncios.' });
    }
    if (anuncio.rows[0].status !== 'pausado') {
      return res.status(400).json({ erro: 'Só é possível reativar um anúncio que está pausado. Anúncios expirados precisam ser renovados.' });
    }

    await pool.query("UPDATE anuncios SET status = 'ativo', data_atualizacao = NOW() WHERE id = $1", [id]);
    return res.json({ mensagem: 'Anúncio reativado e de volta às buscas!' });
  } catch (erro) {
    console.error('Erro ao reativar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao reativar anúncio.' });
  }
});

// ============================================================
//  PUT RENOVAR ANÚNCIO — estende o prazo de expiração [RF12]
//  Usado tanto pra renovar um anúncio já expirado quanto pra
//  adiantar o prazo de um que ainda está ativo/pausado.
// ============================================================
router.put('/api/anuncios/:id/renovar', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const anuncio = await pool.query('SELECT vendedor_id, status FROM anuncios WHERE id = $1', [id]);

    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (anuncio.rows[0].vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode renovar os seus próprios anúncios.' });
    }
    if (anuncio.rows[0].status === 'vendido') {
      return res.status(400).json({ erro: 'Não é possível renovar um anúncio já vendido.' });
    }

    const resultado = await pool.query(
      `UPDATE anuncios
          SET status = 'ativo', data_expiracao = NOW() + INTERVAL '60 days', data_atualizacao = NOW()
        WHERE id = $1
        RETURNING data_expiracao`,
      [id]
    );

    return res.json({
      mensagem: 'Anúncio renovado por mais 60 dias!',
      data_expiracao: resultado.rows[0].data_expiracao,
    });
  } catch (erro) {
    console.error('Erro ao renovar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao renovar anúncio.' });
  }
});

// ============================================================
//  DELETE ANÚNCIO — vendedor exclui o próprio anúncio [RF12]
//  Bloqueado se já houver compras registradas (mesma regra do
//  admin) — o histórico financeiro precisa ser preservado.
// ============================================================
router.delete('/api/anuncios/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const anuncio = await pool.query('SELECT vendedor_id, titulo FROM anuncios WHERE id = $1', [id]);

    if (anuncio.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    if (anuncio.rows[0].vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você só pode excluir os seus próprios anúncios.' });
    }

    const compras = await pool.query('SELECT COUNT(*) FROM compras WHERE anuncio_id = $1', [id]);
    if (parseInt(compras.rows[0].count) > 0) {
      return res.status(409).json({
        erro: 'Este anúncio possui compras registradas e não pode ser removido. Use "Pausar" para tirá-lo de circulação.',
      });
    }

    await pool.query('DELETE FROM anuncios WHERE id = $1', [id]);
    return res.json({ mensagem: `Anúncio "${anuncio.rows[0].titulo}" excluído com sucesso.` });
  } catch (erro) {
    console.error('Erro ao excluir anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao excluir anúncio.' });
  }
});

// ============================================================
//  GET ANÚNCIOS — lista com filtros (pra tela Explorar)
// ============================================================
router.get('/api/anuncios', autenticarOpcional, async (req, res) => {
  try {
    const {
      categoria_id,
      preco_min,
      preco_max,
      estado_conservacao,
      aceita_troca,
      bairro,
      busca,
      ordenacao = 'recentes',
      pagina = 1,
      limite = 12
    } = req.query;

    // Cláusula WHERE construída uma única vez e reaproveitada tanto na
    // consulta principal quanto na contagem total — antes a contagem usava
    // um WHERE fixo e ignorava todos os filtros, retornando o total errado.
    let whereClause = ` WHERE a.status = 'ativo'`;

    const params = [];
    let paramIndex = 1;

    if (categoria_id) {
      // Busca anúncios da categoria OU de suas subcategorias
      whereClause += ` AND (a.categoria_id = $${paramIndex} OR c.categoria_pai = $${paramIndex})`;
      params.push(categoria_id);
      paramIndex++;
    }

    if (busca) {
      // Busca por texto no título ou descrição (case-insensitive, ignora acentos).
      // Quebra em palavras e exige TODAS presentes (em qualquer ordem, em
      // qualquer um dos dois campos) — evita que buscas com as palavras fora
      // de ordem ou com termos extras deixem de encontrar o anúncio.
      const termos = busca
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (termos.length > 0) {
        const condicoesTermos = termos.map((termo, i) => {
          const p = paramIndex + i;
          return `(TRANSLATE(LOWER(a.titulo), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') LIKE $${p}
                 OR TRANSLATE(LOWER(a.descricao), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') LIKE $${p})`;
        });
        whereClause += ` AND (${condicoesTermos.join(' AND ')})`;
        termos.forEach((termo) => params.push(`%${termo}%`));
        paramIndex += termos.length;
      }
    }

    if (preco_min) {
      whereClause += ` AND a.preco >= $${paramIndex}`;
      params.push(preco_min);
      paramIndex++;
    }

    if (preco_max) {
      whereClause += ` AND a.preco <= $${paramIndex}`;
      params.push(preco_max);
      paramIndex++;
    }

    if (estado_conservacao) {
      // Aceita um valor único ou uma lista separada por vírgula (filtro multi-seleção)
      const estados = estado_conservacao.split(',').map((e) => e.trim()).filter(Boolean);
      whereClause += ` AND a.estado_conservacao = ANY($${paramIndex}::text[])`;
      params.push(estados);
      paramIndex++;
    }

    if (aceita_troca === 'true') {
      whereClause += ` AND a.aceita_troca = true`;
    }

    if (bairro) {
      whereClause += ` AND a.bairro = $${paramIndex}`;
      params.push(bairro);
      paramIndex++;
    }

    const selectBase = `
      SELECT
        a.id, a.titulo, a.descricao, a.preco, a.aceita_troca,
        a.estado_conservacao, a.bairro, a.status, a.data_criacao,
        c.nome AS categoria_nome,
        u.nome AS vendedor_nome,
        u.foto_perfil AS vendedor_foto,
        (SELECT imagem FROM anuncio_imagens WHERE anuncio_id = a.id AND is_principal = true LIMIT 1) AS imagem_principal
      FROM anuncios a
      JOIN categorias c ON a.categoria_id = c.id
      JOIN usuarios u ON a.vendedor_id = u.id
    ` + whereClause;

    let anuncios;
    let total;

    // [RF08] Ordenação por proximidade — calculada a partir do bairro de
    // referência (do comprador logado ou do filtro escolhido), comparado
    // ao centroide de cada bairro atendido pela plataforma.
    if (ordenacao === 'distancia') {
      let origemBairro = req.query.origem_bairro || null;
      if (!origemBairro && req.userId) {
        const usuario = await pool.query('SELECT bairro FROM usuarios WHERE id = $1', [req.userId]);
        origemBairro = usuario.rows[0]?.bairro || null;
      }

      const resultado = await pool.query(selectBase, params);
      const comDistancia = resultado.rows.map((a) => ({
        ...a,
        distancia_km: origemBairro ? distanciaEntreBairros(origemBairro, a.bairro) : null,
      }));

      // Sem bairro de referência disponível, cai pra ordenação padrão (mais recentes)
      comDistancia.sort((a, b) => {
        if (a.distancia_km == null && b.distancia_km == null) return new Date(b.data_criacao) - new Date(a.data_criacao);
        if (a.distancia_km == null) return 1;
        if (b.distancia_km == null) return -1;
        return a.distancia_km - b.distancia_km;
      });

      total = comDistancia.length;
      const inicio = (pagina - 1) * limite;
      anuncios = comDistancia.slice(inicio, inicio + parseInt(limite));
    } else {
      let query = selectBase;
      if (ordenacao === 'preco-menor') {
        query += ' ORDER BY a.preco ASC';
      } else if (ordenacao === 'preco-maior') {
        query += ' ORDER BY a.preco DESC';
      } else {
        query += ' ORDER BY a.data_criacao DESC';
      }

      // Paginação — usa uma cópia dos params, sem afetar os que a contagem usa
      const paramsComPaginacao = [...params, limite, (pagina - 1) * limite];
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

      const resultado = await pool.query(query, paramsComPaginacao);
      anuncios = resultado.rows;

      // Conta total pra paginação — mesma cláusula WHERE da consulta principal
      const countQuery = `
        SELECT COUNT(*) FROM anuncios a
        JOIN categorias c ON a.categoria_id = c.id
      ` + whereClause;
      const totalResult = await pool.query(countQuery, params);
      total = parseInt(totalResult.rows[0].count);
    }

    // [RF10] Marca quais desses anúncios o visitante logado já favoritou
    if (req.userId && anuncios.length > 0) {
      const favoritos = await pool.query(
        `SELECT anuncio_id FROM favoritos WHERE usuario_id = $1 AND anuncio_id = ANY($2::int[])`,
        [req.userId, anuncios.map((a) => a.id)]
      );
      const idsFavoritados = new Set(favoritos.rows.map((f) => f.anuncio_id));
      anuncios = anuncios.map((a) => ({ ...a, favoritado: idsFavoritados.has(a.id) }));
    } else {
      anuncios = anuncios.map((a) => ({ ...a, favoritado: false }));
    }

    return res.json({
      anuncios,
      paginacao: {
        pagina_atual: parseInt(pagina),
        total_paginas: Math.ceil(total / limite),
        total_itens: total,
        itens_por_pagina: parseInt(limite)
      }
    });

  } catch (erro) {
    console.error('Erro ao listar anúncios:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar anúncios.' });
  }
});

// ============================================================
//  GET ANÚNCIO POR ID — detalhe (pra tela do anúncio)  ← NOVA
// ============================================================
router.get('/api/anuncios/:id', autenticarOpcional, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({ erro: 'ID de anúncio inválido.' });
    }

    const resultado = await pool.query(
      `SELECT
         a.id, a.titulo, a.descricao, a.preco, a.aceita_troca,
         a.estado_conservacao, a.cep, a.bairro, a.status, a.data_criacao,
         a.categoria_id, a.vendedor_id,
         c.nome AS categoria_nome,
         u.nome AS vendedor_nome,
         u.nome AS usuario_nome,
         u.sobrenome AS vendedor_sobrenome,
         u.foto_perfil AS vendedor_foto
       FROM anuncios a
       JOIN categorias c ON a.categoria_id = c.id
       JOIN usuarios   u ON a.vendedor_id  = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }

    const anuncio = resultado.rows[0];

    // Todas as imagens, com a principal primeiro
    const imagens = await pool.query(
      `SELECT imagem
         FROM anuncio_imagens
        WHERE anuncio_id = $1
        ORDER BY is_principal DESC, ordem ASC, id ASC`,
      [id]
    );

    anuncio.imagens = imagens.rows.map((linha) => linha.imagem);

    // [RF10] Indica se o visitante logado já favoritou este anúncio
    anuncio.favoritado = false;
    if (req.userId) {
      const favorito = await pool.query(
        'SELECT 1 FROM favoritos WHERE usuario_id = $1 AND anuncio_id = $2',
        [req.userId, id]
      );
      anuncio.favoritado = favorito.rows.length > 0;
    }

    return res.json({ anuncio });

  } catch (erro) {
    console.error('Erro ao buscar anúncio:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar anúncio.' });
  }
});

module.exports = router;
