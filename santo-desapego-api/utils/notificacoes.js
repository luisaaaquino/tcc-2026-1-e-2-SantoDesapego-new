const pool = require('../db');
const { enviarEmail } = require('./email');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const criarNotificacao = async (usuarioId, tipo, titulo, mensagem, link = null) => {
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
      const botao = link
        ? `<p style="text-align:center; margin: 24px 0;">
             <a href="${FRONTEND_URL}${link}" style="background:#1F4F3F; color:#fff; padding:12px 24px; border-radius:24px; text-decoration:none; font-weight:bold;">Ver na plataforma</a>
           </p>`
        : '';
      return enviarEmail(
        destinatario.email,
        titulo,
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#1F4F3F;">Santo Desapego</h2>
          <p>Olá, ${destinatario.nome}!</p>
          <p>${mensagem}</p>
          ${botao}
          <p style="color:#888; font-size:12px;">Santo Desapego — Projeto acadêmico TCC, Centro Universitário Senac Santo Amaro.</p>
        </div>`
      );
    })
    .catch((erro) => console.error('Erro ao enviar e-mail de notificação:', erro));
};

module.exports = { criarNotificacao };
