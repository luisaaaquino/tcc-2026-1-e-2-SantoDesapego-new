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
  await expect(page.getByText(`Olá, ${usuario.nome}!`).first()).toBeVisible();
};

module.exports = { codigosEnviados, esperarCodigo, digitarCodigo, entrar };
