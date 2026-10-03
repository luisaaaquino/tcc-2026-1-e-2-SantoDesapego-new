/**
 * Gera os e-mails do Santo Desapego como arquivos .html para conferir
 * o layout no navegador — sem enviar nada nem precisar de banco.
 *
 *   node scripts/previewEmails.js            (salva na pasta temporária do sistema)
 *   node scripts/previewEmails.js ./saida    (salva na pasta indicada)
 *
 * O exemplo de "nova mensagem" traz HTML de propósito no texto do chat:
 * no preview ele tem que aparecer como texto literal, nunca como link/imagem.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { montarEmail } = require('../utils/emailTemplate');

const SITE = 'https://santosdesapego.com.br';
const pasta = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'santo-desapego-emails'));
fs.mkdirSync(pasta, { recursive: true });

const exemplos = {
  'nova-mensagem': {
    titulo: 'Nova mensagem de Marina',
    nome: 'Paulo',
    paragrafos: ['Marina enviou uma mensagem sobre o anúncio "Poltrona de leitura em veludo".'],
    citacao: 'Oi! Ainda está disponível? Posso buscar amanhã à tarde. <a href="http://golpe.exemplo">clique aqui</a>',
    botao: { texto: 'Responder mensagem', url: `${SITE}/mensagens` },
    previa: 'Oi! Ainda está disponível?',
  },
  'pagamento-confirmado': {
    titulo: 'Sua peça foi vendida! 🎉',
    nome: 'Paulo',
    paragrafos: ['O pagamento de "Poltrona de leitura em veludo" foi aprovado. Marina já pode combinar a entrega com você pelo chat.'],
    botao: { texto: 'Combinar a entrega', url: `${SITE}/mensagens` },
  },
  'anuncio-expirando': {
    titulo: 'Seu anúncio está prestes a expirar',
    nome: 'Paulo',
    paragrafos: ['"Bicicleta aro 26" expira em 2 dia(s). Acesse a plataforma para renovar e continuar recebendo interessados.'],
    botao: { texto: 'Renovar anúncio', url: `${SITE}/anuncio/42` },
  },
  'recuperar-senha': {
    titulo: 'Vamos criar uma nova senha',
    nome: 'Paulo',
    paragrafos: [
      'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha.',
      'Por segurança, este link expira em 1 hora e só pode ser usado uma vez.',
    ],
    botao: { texto: 'Redefinir minha senha', url: `${SITE}/redefinir-senha?token=exemplo123` },
    rodapeExtra: 'Não foi você? Pode ignorar este e-mail — sua senha atual continua valendo.',
  },
};

for (const [nome, opcoes] of Object.entries(exemplos)) {
  const arquivo = path.join(pasta, `${nome}.html`);
  fs.writeFileSync(arquivo, montarEmail(opcoes), 'utf8');
  console.log(arquivo);
}
