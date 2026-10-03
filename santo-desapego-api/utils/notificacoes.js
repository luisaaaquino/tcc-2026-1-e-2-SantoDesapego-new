const pool = require('../db');
const { enviarEmail } = require('./email');
const { montarEmail } = require('./emailTemplate');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Texto do botão do e-mail para cada tipo — o padrão cobre os que não estão aqui
const TEXTO_BOTAO = {
  nova_mensagem: 'Responder mensagem',
  intencao_compra: 'Ver meus anúncios',
  pagamento_confirmado: 'Combinar a entrega',
  avaliacao_pendente: 'Avaliar o vendedor',
  anuncio_expirando: 'Renovar anúncio',
};

/**
 * @param {object} [extras]
 * @param {string} [extras.citacao] Trecho em destaque no e-mail (ex.: a mensagem do chat)
 */
const criarNotificacao = async (usuarioId, tipo, titulo, mensagem, link = null, extras = {}) => {
  try {
    await pool.query(
      `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuarioId, tipo, titulo, mensagem, link]
    );
  } catch (erro) {
    console.error('Erro ao criar notificação in-app:', erro);
  }

  // O e-mail roda em segundo plano — nunca atrasa nem quebra a requisição principal.
  pool.query('SELECT nome, email FROM usuarios WHERE id = $1', [usuarioId])
    .then(({ rows }) => {
      if (rows.length === 0) return;
      const destinatario = rows[0];
      return enviarEmail(
        destinatario.email,
        titulo,
        montarEmail({
          titulo,
          nome: destinatario.nome,
          paragrafos: [mensagem],
          citacao: extras.citacao,
          botao: link
            ? { texto: TEXTO_BOTAO[tipo] || 'Ver na plataforma', url: `${FRONTEND_URL}${link}` }
            : undefined,
          previa: mensagem,
        })
      );
    })
    .catch((erro) => console.error('Erro ao enviar e-mail de notificação:', erro));
};

module.exports = { criarNotificacao };
