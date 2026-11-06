const { test, expect } = require('@playwright/test');
const { USUARIOS, SENHA } = require('../dados');
const { entrar, codigosEnviados, esperarCodigo, digitarCodigo } = require('../utilitarios');

test.describe('RF02 - Autenticação e Gestão de Sessão', () => {
  test('login com e-mail, senha e código de 6 dígitos enviado por e-mail', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await expect(page).toHaveURL('/');
  });

  test('senha errada não entra e mostra o aviso', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('seu@email.com').fill(USUARIOS.comprador.email);
    await page.getByPlaceholder('Sua senha').fill('Errada@2026');
    await page.locator('button.btn-login').click();
    await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
    await expect(page.getByLabel('Código')).toHaveCount(0);
  });

  test('código errado não abre a sessão', async ({ page }) => {
    const antes = codigosEnviados(USUARIOS.vizinho.email).length;
    await page.goto('/login');
    await page.getByPlaceholder('seu@email.com').fill(USUARIOS.vizinho.email);
    await page.getByPlaceholder('Sua senha').fill(SENHA);
    await page.locator('button.btn-login').click();
    const certo = await esperarCodigo(USUARIOS.vizinho.email, antes);

    await digitarCodigo(page, certo === '000000' ? '111111' : '000000');

    await expect(page.getByRole('alert')).toContainText('Código incorreto');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sair encerra a sessão', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.getByText('Sair').first().click();
    await expect(page.getByRole('link', { name: 'Entrar' }).first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sd_token'))).toBeNull();
  });

  test('página que exige login manda o visitante para o login', async ({ page }) => {
    await page.goto('/anunciar');
    await expect(page).toHaveURL(/\/login/);
  });
});
