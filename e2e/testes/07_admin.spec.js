const { test, expect } = require('@playwright/test');
const { USUARIOS, ANUNCIOS, SENHA } = require('../dados');
const { entrar } = require('../utilitarios');

const linhaDoUsuario = (page, email) => page.locator('.admin-table tr', { hasText: email });

test.describe('RNF04 - Princípio do Menor Privilégio', () => {
  test('usuário comum não acessa o painel administrativo', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  });
});

test.describe('RF20 - Módulo Administrativo', () => {
  test('o administrador vê o resumo da plataforma', async ({ page }) => {
    await entrar(page, USUARIOS.admin);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Visão geral/ })).toBeVisible();
  });

  test('o administrador pausa um anúncio e ele sai da busca', async ({ page }) => {
    await entrar(page, USUARIOS.admin);
    await page.goto('/admin');
    await page.getByRole('button', { name: /Anúncios/ }).click();
    await page.locator('.admin-table tr', { hasText: ANUNCIOS.livro.titulo }).getByRole('button', { name: 'Pausar' }).click();
    await page.getByRole('button', { name: 'Pausar', exact: true }).last().click();

    await page.goto('/explorar');
    await expect(page.locator('.ecard')).not.toContainText([ANUNCIOS.livro.titulo]);
  });

  test('a ação do administrador fica no log de auditoria', async ({ page }) => {
    await entrar(page, USUARIOS.admin);
    await page.goto('/admin');
    await page.getByRole('button', { name: /Logs de auditoria/ }).click();
    await expect(page.getByText(/Moderou anúncio|moderar_anuncio/).first()).toBeVisible();
  });
});

test.describe('RN02 - Verificação de Identidade (Compliance)', () => {
  test('conta suspensa pelo administrador não consegue mais entrar', async ({ page, browser }) => {
    await entrar(page, USUARIOS.admin);
    await page.goto('/admin');
    await page.getByRole('button', { name: /Usuários/ }).click();
    await linhaDoUsuario(page, USUARIOS.vizinho.email).getByRole('button', { name: 'Suspender' }).click();
    await page.getByRole('button', { name: 'Suspender', exact: true }).last().click();
    await expect(linhaDoUsuario(page, USUARIOS.vizinho.email)).toContainText(/Suspens/);

    const bia = await (await browser.newContext()).newPage();
    await bia.goto('/login');
    await bia.getByPlaceholder('seu@email.com').fill(USUARIOS.vizinho.email);
    await bia.getByPlaceholder('Sua senha').fill(SENHA);
    await bia.locator('button.btn-login').click();
    await expect(bia.getByText('Sua conta está suspensa. Entre em contato com o suporte.')).toBeVisible();
  });
});
