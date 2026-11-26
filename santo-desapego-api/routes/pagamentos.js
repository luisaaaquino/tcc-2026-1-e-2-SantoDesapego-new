const crypto = require('crypto');
const express = require('express');
const PDFDocument = require('pdfkit');
const { MercadoPagoConfig, Payment, PaymentRefund } = require('mercadopago');
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { criarNotificacao } = require('../utils/notificacoes');
const {
  garantirTokenVendedorValido, createSplitPreference, MARKETPLACE_FEE_PERCENT,
} = require('../services/mercadoPagoService');

const router = express.Router();

// Token de confirmação de entrega (seção 2.3 / RN05): 6 dígitos que só o
// vendedor vê. Ele entrega o código junto com a peça; o comprador digita
// ao receber, o que registra a entrega e libera o valor ao vendedor.
const MAX_TENTATIVAS_CODIGO = 5;

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const gerarCodigoEntrega = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

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

const tokenDoVendedor = (anuncio) => garantirTokenVendedorValido({
  id: anuncio.vendedor_id,
  mp_conectado: anuncio.mp_conectado,
  mp_access_token: anuncio.mp_access_token,
  mp_refresh_token: anuncio.mp_refresh_token,
  mp_token_expira_em: anuncio.mp_token_expira_em,
});

// ============================================================
//  [RNF09 / RF17] Grava o pagamento no histórico — uma única função
//  usada pela tela de retorno (/api/compras/confirmar) e pelo aviso
//  automático do Mercado Pago (/api/pagamentos/webhook).
//  - Grava qualquer status (aprovado, pendente, recusado...), não só
//    o aprovado, pra o histórico e os filtros mostrarem tudo.
//  - Roda numa transação com o anúncio travado (FOR UPDATE): se dois
//    pagamentos do mesmo item chegarem juntos, um espera o outro.
//  - Só o primeiro pagamento aprovado vira compra. Se o item já foi
//    vendido, o segundo pagamento é reembolsado automaticamente.
//  O banco também garante isso: no máximo uma compra aprovada por
//  anúncio (índice único da migration 010).
// ============================================================
const STATUS_APROVADO = 'approved';

const textoReembolso = (status, titulo) => (status === 'refunded'
  ? `Outra pessoa concluiu a compra de "${titulo}" antes de você. Seu pagamento foi reembolsado automaticamente pelo Mercado Pago.`
  : `Outra pessoa concluiu a compra de "${titulo}" antes de você. O reembolso do seu pagamento está pendente e será feito pelo suporte.`);

const reembolsar = async (sellerAccessToken, paymentId) => {
  try {
    const refund = new PaymentRefund(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
    await refund.create({ payment_id: paymentId });
    return 'refunded';
  } catch (erro) {
    // Fica marcado no histórico para o suporte devolver manualmente
    console.error(`Falha ao reembolsar o pagamento ${paymentId}:`, erro.message);
    return 'reembolso_pendente';
  }
};

const registrarPagamento = async ({ dados, anuncio, compradorId, sellerAccessToken }) => {
  const paymentId = String(dados.id);
  const client = await pool.connect();
  let resultado;
  try {
    await client.query('BEGIN');

    // Trava o anúncio: confirmações simultâneas do mesmo item entram em fila
    const anuncioAtual = await client.query(
      'SELECT status FROM anuncios WHERE id = $1 FOR UPDATE',
      [anuncio.id]
    );
    const existente = await client.query(
      'SELECT id, status FROM compras WHERE payment_id = $1 FOR UPDATE',
      [paymentId]
    );
    const statusAnterior = existente.rows[0]?.status;

    let status = dados.status;
    let conflito = false;

    // Pagamento aprovado agora, mas o item já foi vendido para outra pessoa
    if (status === STATUS_APROVADO && statusAnterior !== STATUS_APROVADO &&
        anuncioAtual.rows[0]?.status !== 'ativo') {
      conflito = true;
      status = await reembolsar(sellerAccessToken, paymentId);
    }

    const virouAprovada = status === STATUS_APROVADO && statusAnterior !== STATUS_APROVADO;

    const compra = await client.query(
      `INSERT INTO compras
        (anuncio_id, comprador_id, vendedor_id, preco, payment_id, status, metodo_pagamento, parcelas,
         codigo_entrega)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (payment_id) DO UPDATE SET
         status = EXCLUDED.status,
         codigo_entrega = COALESCE(compras.codigo_entrega, EXCLUDED.codigo_entrega),
         atualizada_em = NOW()
       RETURNING id, anuncio_id, preco, status, criada_em, entrega_confirmada_em, codigo_entrega`,
      [
        anuncio.id, compradorId, anuncio.vendedor_id, anuncio.preco,
        paymentId, status, dados.payment_method_id, dados.installments,
        // O código de entrega só existe para compra aprovada
        status === STATUS_APROVADO ? gerarCodigoEntrega() : null,
      ]
    );

    if (virouAprovada) {
      await client.query(
        `UPDATE anuncios SET status = 'vendido' WHERE id = $1 AND status = 'ativo'`,
        [anuncio.id]
      );
    }

    await client.query('COMMIT');
    resultado = { compra: compra.rows[0], virouAprovada, conflito };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }

  const { compra, virouAprovada, conflito } = resultado;
  const comprador = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [compradorId]);
  const nomeComprador = comprador.rows[0]?.nome || 'Um comprador';

  // [RF18] Notifica só na primeira vez que o pagamento é aprovado
  if (virouAprovada) {
    criarNotificacao(
      anuncio.vendedor_id,
      'pagamento_confirmado',
      'Sua peça foi vendida! 🎉 Guarde o código de entrega',
      `O pagamento de "${anuncio.titulo}" foi aprovado. Combine a entrega com ${nomeComprador} pelo chat. Seu código de entrega é ${compra.codigo_entrega}: passe esse código ao comprador junto com a peça. Quando ele digitar o código no site, o valor da venda é liberado para você.`,
      '/perfil?aba=vendas'
    );

    // A solicitação de avaliação (RF18) só sai quando a entrega é
    // confirmada — ver POST /api/compras/:id/confirmar-entrega
    criarNotificacao(
      compradorId,
      'pagamento_confirmado',
      'Pagamento confirmado',
      `Seu pagamento de "${anuncio.titulo}" foi aprovado e fica retido até você confirmar o recebimento. Combine a entrega com o vendedor pelo chat. Ao receber a peça, peça o código de entrega ao vendedor e digite em "Compras realizadas".`,
      '/mensagens'
    );
  }

  if (conflito) {
    criarNotificacao(
      compradorId,
      'pagamento_confirmado',
      'Esta peça já tinha sido vendida',
      textoReembolso(compra.status, anuncio.titulo),
      '/perfil?aba=compras'
    );
  }

  return resultado;
};


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

    const sellerAccessToken = await tokenDoVendedor(anuncio);

    const resposta = await createSplitPreference({
      sellerAccessToken,
      anuncio,
      comprador: { ...(comprador.rows[0] || {}), id: req.userId },
    });

    console.log(`💳 Preferência criada (split) — anúncio #${anuncio.id}, vendedor #${anuncio.vendedor_id}`);

    // [RF18] Notifica o vendedor da intenção de compra
    criarNotificacao(
      anuncio.vendedor_id,
      'intencao_compra',
      'Alguém quer comprar seu anúncio!',
      `${comprador.rows[0]?.nome} iniciou o pagamento do anúncio "${anuncio.titulo}". Fique de olho — assim que o pagamento for aprovado, vocês combinam a entrega pelo chat.`,
      '/perfil?aba=anuncios'
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

    const sellerAccessToken = await tokenDoVendedor(anuncio);

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
//  PAGAMENTO — grava o pagamento no histórico [RNF09 / RF17]
//  Chamada pela tela /compra-realizada quando o comprador volta do
//  Mercado Pago, com qualquer status (aprovado, pendente, recusado).
//  Idempotente: pode ser chamada mais de uma vez pro mesmo payment_id.
//  Se o comprador não voltar ao site, o webhook abaixo faz o mesmo.
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
    const anuncio = anuncioResultado.rows[0];

    const sellerAccessToken = await tokenDoVendedor(anuncio);
    const payment = new Payment(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
    const dados = await payment.get({ id: payment_id });

    // O pagamento tem que realmente ser da preference criada pra este anúncio
    if (String(dados.external_reference) !== String(anuncio_id)) {
      return res.status(400).json({ erro: 'O pagamento informado não corresponde a este anúncio.' });
    }
    if (anuncio.vendedor_id === req.userId) {
      return res.status(400).json({ erro: 'Você não pode confirmar uma compra do seu próprio anúncio.' });
    }
    // A preference guarda quem iniciou o pagamento: outra conta não confirma por ele
    const compradorDoPagamento = dados.metadata?.comprador_id;
    if (compradorDoPagamento && Number(compradorDoPagamento) !== req.userId) {
      return res.status(403).json({ erro: 'Este pagamento foi feito por outra conta.' });
    }

    const { compra, conflito } = await registrarPagamento({
      dados, anuncio, compradorId: req.userId, sellerAccessToken,
    });

    // O código fica só com o vendedor: nunca volta na resposta ao comprador
    const { codigo_entrega, ...compraRegistrada } = compra;

    if (conflito) {
      return res.status(409).json({
        registrada: true,
        conflito: true,
        erro: textoReembolso(compra.status, anuncio.titulo),
        compra: compraRegistrada,
      });
    }
    return res.status(201).json({
      registrada: true,
      aprovada: compra.status === STATUS_APROVADO,
      status: compra.status,
      compra: compraRegistrada,
    });
  } catch (erro) {
    console.error('Erro ao confirmar compra:', erro);
    return res.status(500).json({ erro: 'Erro ao confirmar a compra.' });
  }
});

// ============================================================
//  WEBHOOK — aviso automático do Mercado Pago [RNF09]
//  O Mercado Pago chama esta rota quando o status de um pagamento muda,
//  mesmo que o comprador feche a aba e não volte ao site. A URL vai na
//  preference com ?anuncio_id=, porque a consulta precisa do token do
//  vendedor dono do anúncio.
//  Não confia no corpo do aviso: o pagamento é sempre consultado de novo
//  na API do Mercado Pago antes de gravar.
// ============================================================
router.post('/api/pagamentos/webhook', async (req, res) => {
  const tipo = req.body?.type || req.query.type || req.query.topic;
  const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
  const anuncioId = req.query.anuncio_id;

  // Responde logo: o Mercado Pago reenvia o aviso se não receber 200/201
  res.sendStatus(200);

  if (tipo !== 'payment' || !paymentId || !anuncioId) return;

  try {
    const anuncioResultado = await buscarAnuncioComVendedor(anuncioId);
    if (anuncioResultado.rows.length === 0) return;
    const anuncio = anuncioResultado.rows[0];

    const sellerAccessToken = await tokenDoVendedor(anuncio);
    const payment = new Payment(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
    const dados = await payment.get({ id: paymentId });

    if (String(dados.external_reference) !== String(anuncioId)) return;
    const compradorId = Number(dados.metadata?.comprador_id);
    if (!compradorId || compradorId === anuncio.vendedor_id) return;

    await registrarPagamento({ dados, anuncio, compradorId, sellerAccessToken });
    console.log(`🔔 Webhook — pagamento ${paymentId} (${dados.status}) do anúncio #${anuncioId}`);
  } catch (erro) {
    console.error('Erro ao processar webhook do Mercado Pago:', erro.message);
  }
});

// ============================================================
//  ENTREGA — comprador confirma o recebimento com o código que o
//  vendedor entregou junto com a peça (seção 2.3 / RN05). Registra a
//  entrega, libera o valor ao vendedor e libera a avaliação.
//  A liberação é o status exibido no site; a retenção real do dinheiro
//  fica com o Mercado Pago.
//  Limite de tentativas pra o código não ser descoberto no chute.
// ============================================================
router.post('/api/compras/:id/confirmar-entrega', autenticar, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const codigo = String(req.body.codigo || '').replace(/\D/g, '');

    if (isNaN(parseInt(id))) {
      return res.status(400).json({ erro: 'Compra inválida.' });
    }
    if (codigo.length !== 6) {
      return res.status(400).json({ erro: 'O código de entrega tem 6 dígitos.' });
    }

    await client.query('BEGIN');

    // FOR UPDATE: duas tentativas ao mesmo tempo não burlam o limite
    const resultado = await client.query(
      `SELECT co.vendedor_id, co.comprador_id, co.codigo_entrega, co.entrega_confirmada_em,
              co.tentativas_codigo, co.preco, co.status, a.titulo
         FROM compras co
         JOIN anuncios a ON a.id = co.anuncio_id
        WHERE co.id = $1
        FOR UPDATE OF co`,
      [id]
    );
    const compra = resultado.rows[0];

    if (!compra) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Compra não encontrada.' });
    }
    if (compra.comprador_id !== req.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Só o comprador pode confirmar o recebimento.' });
    }
    if (compra.status !== STATUS_APROVADO) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Só dá para confirmar a entrega de um pagamento aprovado.' });
    }
    if (compra.entrega_confirmada_em) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Esta entrega já foi confirmada.' });
    }
    if (compra.tentativas_codigo >= MAX_TENTATIVAS_CODIGO) {
      await client.query('ROLLBACK');
      return res.status(423).json({
        erro: 'Confirmação bloqueada por excesso de tentativas. Fale com o suporte.',
        bloqueada: true,
      });
    }

    if (codigo !== compra.codigo_entrega) {
      const tentativas = compra.tentativas_codigo + 1;
      await client.query(
        'UPDATE compras SET tentativas_codigo = $1, atualizada_em = NOW() WHERE id = $2',
        [tentativas, id]
      );
      await client.query('COMMIT');
      const restantes = MAX_TENTATIVAS_CODIGO - tentativas;
      return res.status(400).json({
        erro: restantes > 0
          ? `Código incorreto. Você tem mais ${restantes} tentativa(s).`
          : 'Código incorreto. A confirmação foi bloqueada — fale com o suporte.',
        tentativas_restantes: restantes,
        bloqueada: restantes === 0,
      });
    }

    const confirmada = await client.query(
      `UPDATE compras SET entrega_confirmada_em = NOW(), atualizada_em = NOW()
        WHERE id = $1
        RETURNING id, entrega_confirmada_em`,
      [id]
    );
    await client.query('COMMIT');

    const valorLiquido = Number(compra.preco) * (1 - MARKETPLACE_FEE_PERCENT / 100);
    criarNotificacao(
      compra.vendedor_id,
      'pagamento_confirmado',
      'Entrega confirmada — valor liberado 💸',
      `O comprador confirmou o recebimento de "${compra.titulo}". O valor da venda (${brl(valorLiquido)}, já descontada a taxa de ${MARKETPLACE_FEE_PERCENT}%) foi liberado para você.`,
      '/perfil?aba=vendas'
    );

    // [RF18] Solicitação de avaliação — agora que a peça foi entregue
    criarNotificacao(
      compra.comprador_id,
      'avaliacao_pendente',
      'Recebimento confirmado — avalie o vendedor',
      `Você confirmou o recebimento de "${compra.titulo}". Conte como foi a negociação: sua avaliação ajuda os vizinhos a comprar com confiança.`,
      '/perfil?aba=compras'
    );

    return res.json({ mensagem: 'Recebimento confirmado! O valor foi liberado ao vendedor.', compra: confirmada.rows[0] });
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao confirmar entrega:', erro);
    return res.status(500).json({ erro: 'Erro ao confirmar a entrega.' });
  } finally {
    client.release();
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
