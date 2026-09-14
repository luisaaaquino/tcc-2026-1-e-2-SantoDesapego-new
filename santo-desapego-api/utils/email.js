const nodemailer = require('nodemailer');

const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

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
