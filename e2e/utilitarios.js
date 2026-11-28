const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { SENHA } = require('./dados');

const LOG = path.join(__dirname, 'relatorio', 'api.log');

// Códigos de verificação que a API "enviou" para um e-mail (lidos do log)
const codigosEnviados = (email) => {
  const texto = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
  const padrao = new RegExp(`C.digo de \\w+ para ${email.replace(/[.]/g, '\\.')}: (\\d{6})`, 'g');
  return [...texto.matchAll(padrao)].map((m) => m[1]);
};

/** Espera chegar um código novo para o e-mail (depois dos `jaEnviados`). */
const esperarCodigo = async (email, jaEnviados) => {
  let codigo;
  await expect.poll(() => {
    const todos = codigosEnviados(email);
    codigo = todos.length > jaEnviados ? todos[todos.length - 1] : null;
    return codigo;
  }, { message: `código de verificação para ${email}` }).not.toBeNull();
  return codigo;
};

/** Digita o código na tela de verificação. */
const digitarCodigo = async (page, codigo) => {
  await page.getByLabel('Código').fill(codigo);
  await page.getByRole('button', { name: /^(Entrar|Confirmar e entrar)$/ }).click();
};

/** Login completo: e-mail e senha, depois o código enviado "por e-mail". */
const entrar = async (page, usuario, { senha = SENHA } = {}) => {
  const antes = codigosEnviados(usuario.email).length;
  await page.goto('/login');
  await page.getByPlaceholder('seu@email.com').fill(usuario.email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.locator('button.btn-login').click(); // não confundir com "Entrar com Google"
  await digitarCodigo(page, await esperarCodigo(usuario.email, antes));
  // No cabeçalho logado aparece a foto com o nome, com o link "Meu perfil"
  await expect(page.getByTitle('Meu perfil').filter({ hasText: usuario.nome }).first()).toBeVisible();
};

// Navegadores extras (uma pessoa em cada) para testes com comprador e vendedor.
// Precisam ser fechados no fim do teste: a tela de Mensagens fica consultando
// a API sem parar e, aberta, deixava os testes seguintes lentos até travar.
const pessoasAbertas = [];
const novaPessoa = async (browser) => {
  const contexto = await browser.newContext();
  pessoasAbertas.push(contexto);
  return contexto.newPage();
};
const fecharPessoas = async () => {
  while (pessoasAbertas.length) await pessoasAbertas.pop().close();
};

/** Id de um anúncio pelo título, consultando a API de teste. */
const idDoAnuncio = async (page, titulo) => {
  const resposta = await page.request.get(`http://localhost:8090/api/anuncios?busca=${encodeURIComponent(titulo)}`);
  const corpo = await resposta.json();
  const lista = corpo.anuncios || corpo.dados || corpo;
  const anuncio = lista.find((a) => a.titulo === titulo);
  expect(anuncio, `anúncio "${titulo}" na API`).toBeTruthy();
  return anuncio.id;
};

module.exports = { idDoAnuncio, codigosEnviados, esperarCodigo, digitarCodigo, entrar, novaPessoa, fecharPessoas };
