const { MercadoPagoConfig, OAuth, Preference } = require('mercadopago');
const pool = require('../db');
const mp = require('../config/mercadopago');

const MP_CLIENT_ID = process.env.MP_CLIENT_ID;
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET;
const MP_REDIRECT_URI = process.env.MP_REDIRECT_URI;
const MARKETPLACE_FEE_PERCENT = Number(process.env.MP_MARKETPLACE_FEE_PERCENT || 5);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// [RNF09] Endereço público da API para o aviso automático (webhook) do
// Mercado Pago. Usa API_URL ou, se não tiver, o domínio do MP_REDIRECT_URI
// (que já aponta para a API). O Mercado Pago só aceita endereço HTTPS público.
const urlPublicaDaApi = () => {
  const base = process.env.API_URL
    || (MP_REDIRECT_URI ? new URL(MP_REDIRECT_URI).origin : '');
  return base.startsWith('https://') ? base.replace(/\/$/, '') : null;
};

const oauth = new OAuth(mp);

// ============================================================
//  URL pra onde o vendedor é mandado logar e autorizar a
//  plataforma a criar preferences em nome da conta MP dele.
// ============================================================
const getAuthorizationUrl = (state) => {
  return oauth.getAuthorizationURL({
    options: {
      client_id: MP_CLIENT_ID,
      redirect_uri: MP_REDIRECT_URI,
      state,
    },
  });
};

// ============================================================
//  Troca o "code" do callback pelo access_token/refresh_token
//  da conta do vendedor.
// ============================================================
const exchangeCodeForToken = (code) => {
  return oauth.create({
    body: {
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      code,
      redirect_uri: MP_REDIRECT_URI,
    },
  });
};

// ============================================================
//  Renova o access_token do vendedor usando o refresh_token
//  guardado (o access_token expira em ~6 meses).
// ============================================================
const refreshAccessToken = (refreshToken) => {
  return oauth.refresh({
    body: {
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      refresh_token: refreshToken,
    },
  });
};

// ============================================================
//  Garante um access_token válido do vendedor — se estiver
//  vencido (ou a 5min de vencer), renova via refresh_token e
//  já persiste as novas credenciais no banco.
// ============================================================
const garantirTokenVendedorValido = async (vendedor) => {
  if (!vendedor.mp_conectado || !vendedor.mp_access_token) {
    const erro = new Error('Este vendedor ainda não conectou a conta do Mercado Pago.');
    erro.codigo = 'VENDEDOR_NAO_CONECTADO';
    throw erro;
  }

  const expiraEm = vendedor.mp_token_expira_em ? new Date(vendedor.mp_token_expira_em).getTime() : 0;
  const prestesAVencer = expiraEm - Date.now() < 5 * 60 * 1000;

  if (!prestesAVencer) {
    return vendedor.mp_access_token;
  }

  const renovado = await refreshAccessToken(vendedor.mp_refresh_token);
  const novaExpiracao = new Date(Date.now() + renovado.expires_in * 1000);

  await pool.query(
    `UPDATE usuarios SET
       mp_access_token = $1, mp_refresh_token = $2, mp_token_expira_em = $3
     WHERE id = $4`,
    [renovado.access_token, renovado.refresh_token, novaExpiracao, vendedor.id]
  );

  return renovado.access_token;
};

// ============================================================
//  Cria a preference de Checkout Pro usando o access_token do
//  VENDEDOR (não o da plataforma) e retém a comissão via
//  marketplace_fee — é isso que faz o split de pagamento.
// ============================================================
const createSplitPreference = async ({ sellerAccessToken, anuncio, comprador }) => {
  const preference = new Preference(new MercadoPagoConfig({ accessToken: sellerAccessToken }));
  const marketplaceFee = Number((Number(anuncio.preco) * MARKETPLACE_FEE_PERCENT / 100).toFixed(2));

  const body = {
    items: [
      {
        id: String(anuncio.id),
        title: anuncio.titulo,
        description: anuncio.categoria_nome,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(anuncio.preco),
      },
    ],

    payer: {
      name: comprador.nome,
      surname: comprador.sobrenome,
      email: comprador.email,
    },

    // [RF14] Só cartão (crédito, débito ou pré-pago), em até 12x. Ficam de
    // fora: boleto e lotérica (ticket), Pix (bank_transfer), caixa eletrônico
    // (atm), "Saldo em conta" do MP (account_money) e "Mercado Parcelado" —
    // a linha de crédito do próprio MP (tipo digital_currency, meio consumer_credits)
    payment_methods: {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'bank_transfer' },
        { id: 'atm' },
        { id: 'account_money' },
        { id: 'digital_currency' },
      ],
      excluded_payment_methods: [
        { id: 'consumer_credits' },
      ],
      installments: 12,
    },

    marketplace_fee: marketplaceFee,

    back_urls: {
      success: `${FRONTEND_URL}/compra-realizada`,
      pending: `${FRONTEND_URL}/compra-realizada`,
      failure: `${FRONTEND_URL}/checkout/${anuncio.id}?falhou=1`,
    },

    external_reference: String(anuncio.id),
    statement_descriptor: 'SANTO DESAPEGO',

    // Volta no pagamento: o webhook sabe quem comprou sem o comprador voltar ao site
    metadata: { comprador_id: comprador.id },
  };

  const apiUrl = urlPublicaDaApi();
  if (apiUrl) {
    body.notification_url = `${apiUrl}/api/pagamentos/webhook?anuncio_id=${anuncio.id}`;
  }

  // auto_return exige que back_url.success seja uma URL pública HTTPS — não
  // funciona com FRONTEND_URL apontando pra localhost (mesma limitação que
  // já existia no checkout antes do split). Em produção, com domínio real,
  // ativa normalmente.
  if (FRONTEND_URL.startsWith('https://')) {
    body.auto_return = 'approved';
  }

  return preference.create({ body });
};

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  garantirTokenVendedorValido,
  createSplitPreference,
  MARKETPLACE_FEE_PERCENT,
};
