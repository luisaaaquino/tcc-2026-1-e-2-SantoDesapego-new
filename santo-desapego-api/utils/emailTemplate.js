/**
 * Layout único dos e-mails do Santo Desapego.
 *
 * E-mail não é navegador: Gmail/Outlook ignoram <style>, CSS externo,
 * flexbox e fontes web na maioria dos casos. Por isso o layout usa
 * tabelas + estilos inline e fontes de sistema (Georgia no título,
 * no lugar da Fraunces do site).
 *
 * Todo texto que vem do usuário (nome, título de anúncio, mensagem do
 * chat...) passa por `escapeHtml` — sem isso, alguém podia mandar uma
 * mensagem com HTML e "desenhar" um e-mail falso com a nossa marca.
 */

// Mesma paleta do site (santo-desapego/src/index.css)
const COR = {
  creme: '#F4EFE4',
  papel: '#FBF8F1',
  borda: '#E5DFCE',
  floresta: '#1F4F3F',
  terracota: '#C14B35',
  tinta: '#1A1A1A',
  tintaSuave: '#4A4A4A',
  tintaApagada: '#7A7A7A',
};

const escapeHtml = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Monta o HTML completo do e-mail.
 *
 * @param {object}   opcoes
 * @param {string}   opcoes.titulo      Título grande do corpo (texto puro)
 * @param {string}   [opcoes.nome]      Nome do destinatário, pra saudação (texto puro)
 * @param {string[]} opcoes.paragrafos  Parágrafos do corpo (texto puro, um por item)
 * @param {string}   [opcoes.citacao]   Trecho em destaque, ex.: mensagem do chat (texto puro)
 * @param {{texto: string, url: string}} [opcoes.botao]  Chamada principal
 * @param {string}   [opcoes.rodapeExtra] Linha extra no rodapé, ex.: aviso de segurança (texto puro)
 * @param {string}   [opcoes.previa]    Texto que aparece ao lado do assunto na caixa de entrada
 */
const montarEmail = ({ titulo, nome, paragrafos = [], citacao, botao, rodapeExtra, previa }) => {
  const p = (texto) =>
    `<p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:${COR.tintaSuave};">${escapeHtml(texto)}</p>`;

  const saudacao = nome
    ? `<p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:${COR.tinta};">Olá, ${escapeHtml(nome)}!</p>`
    : '';

  const blocoCitacao = citacao
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="border-left:3px solid ${COR.terracota}; background:${COR.creme}; padding:14px 18px; border-radius:0 8px 8px 0; font-size:15px; line-height:1.55; color:${COR.tinta}; font-style:italic;">
          ${escapeHtml(citacao)}
        </td></tr>
      </table>`
    : '';

  const blocoBotao = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:${COR.floresta}; border-radius:100px;">
          <a href="${escapeHtml(botao.url)}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; font-family:Arial, Helvetica, sans-serif;">${escapeHtml(botao.texto)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px; font-size:12px; line-height:1.5; color:${COR.tintaApagada};">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br>
        <a href="${escapeHtml(botao.url)}" style="color:${COR.floresta}; word-break:break-all;">${escapeHtml(botao.url)}</a>
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0; padding:0; background:${COR.creme};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(previa || '')}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.creme};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; font-family:Arial, Helvetica, sans-serif;">

        <!-- Marca -->
        <tr><td style="padding:0 8px 20px;">
          <span style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; font-weight:bold; color:${COR.floresta};">Santo <span style="color:${COR.terracota};">Desapego</span></span>
        </td></tr>

        <!-- Cartão -->
        <tr><td style="background:${COR.papel}; border:1px solid ${COR.borda}; border-radius:16px; padding:36px 32px;">
          <h1 style="margin:0 0 20px; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.25; font-weight:normal; color:${COR.tinta};">${escapeHtml(titulo)}</h1>
          ${saudacao}
          ${paragrafos.map(p).join('\n')}
          ${blocoCitacao}
          ${blocoBotao}
        </td></tr>

        <!-- Rodapé -->
        <tr><td style="padding:20px 8px 0; font-size:12px; line-height:1.6; color:${COR.tintaApagada};">
          ${rodapeExtra ? `${escapeHtml(rodapeExtra)}<br><br>` : ''}
          Santo Desapego — compra e venda entre vizinhos de Santo Amaro.<br>
          Projeto acadêmico (TCC) do Centro Universitário Senac Santo Amaro.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { montarEmail, escapeHtml };
