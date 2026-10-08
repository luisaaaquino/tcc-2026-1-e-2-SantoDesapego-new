const nodemailer = require('nodemailer');

// Com EMAIL_HOST definido usa o SMTP do provedor (Locaweb: email-ssl.com.br:465);
// sem ele, mantém o Gmail com senha de app.
const porta = Number(process.env.EMAIL_PORT) || 465;
const mailTransporter = nodemailer.createTransport(
  process.env.EMAIL_HOST
    ? {
        host: process.env.EMAIL_HOST,
        port: porta,
        secure: porta === 465,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      }
    : {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      }
);

const enviarEmail = async (destinatario, assunto, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('⚠️  EMAIL_USER/EMAIL_APP_PASSWORD não configurados — e-mail não enviado.');
    return;
  }
  await mailTransporter.sendMail({
    from: `"Santo Desapego" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: assunto,
    html,
  });
};

module.exports = { mailTransporter, enviarEmail };
