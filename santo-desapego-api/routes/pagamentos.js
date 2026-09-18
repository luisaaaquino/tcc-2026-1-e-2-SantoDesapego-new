const express = require('express');
const PDFDocument = require('pdfkit');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { criarNotificacao } = require('../utils/notificacoes');
const { garantirTokenVendedorValido, createSplitPreference } = require('../services/mercadoPagoService');

const router = express.Router();

// Busca o anúncio + as credenciais Mercado Pago do vendedor dono dele.
// Usado tanto pra criar a preference quanto pra consultar/confirmar o pagamento
// (a consulta também precisa do access_token do vendedor, já que a preference
// foi criada com a conta dele, não com a da plataforma).
const buscarAnuncioComVendedor = (anuncioId) =>
  pool.query(
    `SELECT a.id, a.titulo, a.preco, a.status, a.vendedor_id,
            c.nome AS categoria_nome,
            u.mp_conectado, u.mp_access_token, u.mp_refresh_token, u.mp_token_expira_em
       FROM anuncios a
       JOIN categorias c ON c.id = a.categoria_id
       JOIN usuarios u ON u.id = a.vendedor_id
      WHERE a.id = $1`,
    [anuncioId]
  );

// ============================================================
//  PAGAMENTO — cria a preferência do Checkout Pro (só cartão)
//  Chamada pela tela de revisão do pedido (/checkout/:id).
//  [Marketplace] Usa o access_token do VENDEDOR (não o da
//  plataforma) e retém 5% de comissão via marketplace_fee — é
//  isso que faz o dinheiro cair direto na conta de cada vendedor.
// ============================================================
router.post('/api/pagamentos/preferencia', autenticar, async (req, res) => {
  try {
    const { anuncio_id } = req.body;

    if (!anuncio_id) {
      return res.status(400).json({ erro: 'Informe o anúncio que será comprado.' });
    }

    // O preço vem SEMPRE do banco — nunca do que o front mandou
    const resultado = await buscarAnuncioComVendedor(anuncio_id);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }

    const anuncio = resultado.rows[0];

    if (anuncio.status !== 'ativo') {
      return res.status(400).json({ erro: 'Este anúncio não está mais disponível.' });
    }
    if (anuncio.vendedor_id === req.userId) {
      return res.status(400).json({ erro: 'Você não pode comprar o seu próprio anúncio.' });
    }
    if (!anuncio.mp_conectado) {
      return res.status(400).json({
        erro: 'Este vendedor ainda não habilitou o recebimento de pagamentos pelo Mercado Pago.',
      });
    }

    // Dados do comprador ajudam o Mercado Pago a aprovar mais pagamentos
    const comprador = await pool.query(
      'SELECT nome, sobrenome, email FROM usuarios WHERE id = $1',
      [req.userId]
    );

    const sellerAccessToken = await garantirTokenVendedorValido({
      id: anuncio.vendedor_id,
      mp_conectado: anuncio.mp_conectado,
      mp_access_token: anuncio.mp_access_token,
      mp_refresh_token: anuncio.mp_refresh_token,
      mp_token_expira_em: anuncio.mp_token_expira_em,
    });

    const resposta = await createSplitPreference({
      sellerAccessToken,
      anuncio,
      comprador: comprador.rows[0] || {},
    });

    console.log(`💳 Preferência criada (split) — anúncio #${anuncio.id}, vendedor #${anuncio.vendedor_id}`);

    // [RF18] Notifica o vendedor da intenção de compra
    criarNotificacao(
      anuncio.vendedor_id,
      'intencao_compra',
      'Alguém quer comprar seu anúncio!',
      `${comprador.rows[0]?.nome} iniciou o pagamento do anúncio "${anuncio.titulo}". Fique de olho — assim que o pagamento for aprovado, vocês combinam a retirada.`,
      '/perfil'
    );

    return res.json({
      preference_id: resposta.id,
      init_point: resposta.init_point,
    });

  } catch (erro) {
    // Mostra o que o Mercado Pago realmente respondeu
    console.error('──────── ERRO MERCADO PAGO ────────');
    console.error('Mensagem:', erro.message);
    console.error('Status:', erro.status || erro.statusCode);
    console.error('Detalhes:', JSON.stringify(erro.cause || erro.error || {}, null, 2));
    console.error('───────────────────────────────────');

    if (erro.codigo === 'VENDEDOR_NAO_CONECTADO') {
      return res.status(400).json({ erro: erro.message });
    }

    return res.status(500).json({
      erro: 'Não foi possível iniciar o pagamento.',
      detalhe: erro.message,
    });
  }
});

// ============================================================
//  PAGAMENTO — consulta o status real de um pagamento
//  A tela de confirmação usa o payment_id e o external_reference
//  (anuncio_id) que vêm na URL de retorno do Mercado Pago — o
//  segundo é obrigatório aqui porque a consulta precisa do
//  access_token do VENDEDOR dono da preference original.
// ============================================================
router.get('/api/pagamentos/:paymentId', async (req, res) => {
  try {
    const { anuncio_id } = req.query;
    if (!anuncio_id) {
      return res.status(400).json({ erro: 'Informe o anuncio_id (external_reference) do pagamento.' });
    }

    const resultado = await buscarAnuncioComVendedor(anuncio_id);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio da compra não foi encontrado.' });
    }
    const anuncio = resultado.rows[0];

    const sellerAccessToken = await garantirTokenVendedorValido({
      id: anuncio.vendedor_id,
      mp_conectado: anuncio.mp_conectado,
      mp_access_token: anuncio.mp_access_token,
      mp_refresh_token: anuncio.mp_refresh_token,
      mp_token_expira_em: anuncio.mp_token_expira_em,
    });

    const payment = new Payment(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
    const dados = await payment.get({ id: req.params.paymentId });

    return res.json({
      pagamento: {
        id: dados.id,
        status: dados.status,               // approved, pending, rejected...
        status_detail: dados.status_detail,
        valor: dados.transaction_amount,
        metodo: dados.payment_method_id,    // visa, master, elo...
        tipo: dados.payment_type_id,        // credit_card, debit_card
        parcelas: dados.installments,
        anuncio_id: dados.external_reference,
      },
    });
  } catch (erro) {
    console.error('Erro ao consultar pagamento:', erro);
    return res.status(500).json({ erro: 'Erro ao consultar o pagamento.' });
  }
});

// ============================================================
//  PAGAMENTO — confirma e persiste a compra no banco
//  Chamada pela tela /compra-realizada assim que o pagamento é
//  confirmado como aprovado junto ao Mercado Pago. Idempotente:
//  pode ser chamada mais de uma vez pro mesmo payment_id.
// ============================================================
router.post('/api/compras/confirmar', autenticar, async (req, res) => {
  try {
    const { payment_id, anuncio_id } = req.body;
    if (!payment_id || !anuncio_id) {
      return res.status(400).json({ erro: 'Informe o payment_id e o anuncio_id do pagamento.' });
    }

    const anuncioResultado = await buscarAnuncioComVendedor(anuncio_id);
    if (anuncioResultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Anúncio da compra não foi encontrado.' });
    }
    const anuncioComVendedor = anuncioResultado.rows[0];

    const sellerAccessToken = await garantirTokenVendedorValido({
      id: anuncioComVendedor.vendedor_id,
      mp_conectado: anuncioComVendedor.mp_conectado,
      mp_access_token: anuncioComVendedor.mp_access_token,
      mp_refresh_token: anuncioComVendedor.mp_refresh_token,
      mp_token_expira_em: anuncioComVendedor.mp_token_expira_em,
    });

    const payment = new Payment(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
    const dados = await payment.get({ id: payment_id });

    // O pagamento tem que realmente ser da preference criada pra este anúncio
    if (String(dados.external_reference) !== String(anuncio_id)) {
      return res.status(400).json({ erro: 'O pagamento informado não corresponde a este anúncio.' });
    }

    if (dados.status !== 'approved') {
      return res.status(200).json({ registrada: false, status: dados.status });
    }

    const { titulo, vendedor_id, preco } = anuncioComVendedor;

    if (vendedor_id === req.userId) {
      return res.status(400).json({ erro: 'Você não pode confirmar uma compra do seu próprio anúncio.' });
    }

    const compra = await pool.query(
      `INSERT INTO compras
        (anuncio_id, comprador_id, vendedor_id, preco, payment_id, status, metodo_pagamento, parcelas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (payment_id) DO UPDATE SET status = EXCLUDED.status
       RETURNING id, anuncio_id, preco, status, criada_em, (xmax = 0) AS inserida`,
      [
        anuncio_id, req.userId, vendedor_id, preco,
        String(payment_id), dados.status, dados.payment_method_id, dados.installments,
      ]
    );

    await pool.query(
      `UPDATE anuncios SET status = 'vendido' WHERE id = $1 AND status = 'ativo'`,
      [anuncio_id]
    );

    // [RF18] Só notifica na primeira confirmação — evita duplicar em chamadas idempotentes
    if (compra.rows[0].inserida) {
      const comprador = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [req.userId]);
      const nomeComprador = comprador.rows[0]?.nome || 'Um comprador';

      criarNotificacao(
        vendedor_id,
        'pagamento_confirmado',
        'Sua peça foi vendida! 🎉',
        `O pagamento de "${titulo}" foi aprovado. ${nomeComprador} já pode combinar a retirada com você pelo chat.`,
        '/mensagens'
      );

      criarNotificacao(
        req.userId,
        'avaliacao_pendente',
        'Combine a retirada e avalie o vendedor',
        `Seu pagamento de "${titulo}" foi confirmado! Depois de retirar o produto, não esqueça de avaliar o vendedor no seu perfil.`,
        '/perfil'
      );
    }

    return res.status(201).json({ registrada: true, compra: compra.rows[0] });
  } catch (erro) {
    console.error('Erro ao confirmar compra:', erro);
    return res.status(500).json({ erro: 'Erro ao confirmar a compra.' });
  }
});

// ============================================================
//  COMPROVANTE EM PDF — emitido pra comprador ou vendedor [RF17]
// ============================================================
router.get('/api/compras/:id/comprovante', autenticar, async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `SELECT co.id, co.preco, co.status, co.metodo_pagamento, co.parcelas,
              co.payment_id, co.criada_em, co.comprador_id, co.vendedor_id,
              a.titulo AS anuncio_titulo,
              cat.nome AS categoria_nome,
              comp.nome AS comprador_nome, comp.sobrenome AS comprador_sobrenome,
              vend.nome AS vendedor_nome, vend.sobrenome AS vendedor_sobrenome
         FROM compras co
         JOIN anuncios a ON a.id = co.anuncio_id
         JOIN categorias cat ON cat.id = a.categoria_id
         JOIN usuarios comp ON comp.id = co.comprador_id
         JOIN usuarios vend ON vend.id = co.vendedor_id
        WHERE co.id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Compra não encontrada.' });
    }

    const compra = resultado.rows[0];
    if (compra.comprador_id !== req.userId && compra.vendedor_id !== req.userId) {
      return res.status(403).json({ erro: 'Você não tem acesso a este comprovante.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprovante-santo-desapego-${compra.id}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).fillColor('#1F4F3F').text('Santo Desapego');
    doc.fontSize(11).fillColor('#7A7A7A').text('Comprovante de transação');
    doc.moveDown(1);
    doc.strokeColor('#D6CFBD').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    const linha = (label, valor) => {
      doc.fontSize(10).fillColor('#1A1A1A')
        .font('Helvetica-Bold').text(label, { continued: true })
        .font('Helvetica').text(`  ${valor}`);
      doc.moveDown(0.4);
    };

    const preco = Number(compra.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pagamento = compra.metodo_pagamento
      ? `${compra.metodo_pagamento}${compra.parcelas > 1 ? ` em ${compra.parcelas}x` : ''}`
      : '—';

    linha('Nº da transação:', String(compra.id));
    linha('Data:', new Date(compra.criada_em).toLocaleString('pt-BR'));
    linha('Status:', compra.status);
    linha('Item:', compra.anuncio_titulo);
    linha('Categoria:', compra.categoria_nome);
    linha('Valor:', preco);
    linha('Forma de pagamento:', pagamento);
    linha('ID do pagamento (Mercado Pago):', compra.payment_id || '—');
    doc.moveDown(0.6);
    linha('Comprador:', `${compra.comprador_nome} ${compra.comprador_sobrenome}`);
    linha('Vendedor:', `${compra.vendedor_nome} ${compra.vendedor_sobrenome}`);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#7A7A7A').text(
      'Documento gerado eletronicamente pela plataforma Santo Desapego — projeto acadêmico TCC, ' +
      'Centro Universitário Senac Santo Amaro. Não possui valor fiscal.'
    );

    doc.end();
  } catch (erro) {
    console.error('Erro ao gerar comprovante:', erro);
    return res.status(500).json({ erro: 'Erro ao gerar comprovante.' });
  }
});

module.exports = router;
