const { test, expect } = require('@playwright/test');
const { USUARIOS, ANUNCIOS } = require('../dados');
const { entrar } = require('../utilitarios');

const campoMensagem = (page) => page.getByPlaceholder('Escreva sua mensagem...');
// Só os balões da conversa aberta (a lista ao lado também mostra a prévia)
const baloes = (page) => page.locator('.msg-balloes');
const enviarMensagem = async (page, texto) => {
  await campoMensagem(page).fill(texto);
  await page.locator('form').filter({ has: campoMensagem(page) }).getByRole('button').click();
};

test.describe('RF15 - Chat Interno', () => {
  test('comprador fala com o vendedor pelo anúncio e o vendedor recebe a mensagem', async ({ browser }) => {
    // Duas pessoas, dois navegadores
    const ana = await (await browser.newContext()).newPage();
    const caio = await (await browser.newContext()).newPage();

    await entrar(ana, USUARIOS.comprador);
    await ana.goto('/explorar');
    await ana.getByText(ANUNCIOS.bicicleta.titulo).click();
    await ana.getByRole('button', { name: /Conversar com o anunciante/ }).click();
    await expect(ana).toHaveURL(/\/mensagens\?conversa=\d+/);
    await enviarMensagem(ana, 'Oi! A bicicleta ainda está disponível?');
    await expect(baloes(ana).getByText('Oi! A bicicleta ainda está disponível?')).toBeVisible();

    await entrar(caio, USUARIOS.vendedor);
    await caio.goto('/mensagens');
    await caio.getByText(ANUNCIOS.bicicleta.titulo).first().click();
    await expect(baloes(caio).getByText('Oi! A bicicleta ainda está disponível?')).toBeVisible();

    await enviarMensagem(caio, 'Está sim! Pode retirar no Brooklin.');
    await expect(baloes(ana).getByText('Está sim! Pode retirar no Brooklin.')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('RF18 - Notificações ao Usuário', () => {
  test('o vendedor é avisado da mensagem nova pelo sino', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/perfil');
    const sino = page.getByRole('button', { name: /^Notificações/ });
    await sino.click();
    await expect(page.locator('.sino-painel')).toContainText('Nova mensagem de Ana');
  });
});

test.describe('RN09 - Moderação de Conteúdo', () => {
  test('mensagem com palavra proibida não é enviada no chat', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/mensagens');
    await page.getByText(ANUNCIOS.bicicleta.titulo).first().click();
    await enviarMensagem(page, 'Aceita trocar por um revolver?');

    await expect(page.locator('.msg-erro')).toContainText('[RN09]');
    await expect(baloes(page).getByText('Aceita trocar por um revolver?')).toHaveCount(0);
  });
});

test.describe('RN14 - Bloqueio de Mensagens Externas', () => {
  test('o vendedor não abre conversa no próprio anúncio', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.sofa.titulo).click();
    await page.getByRole('button', { name: /Conversar com o anunciante/ }).click();
    await expect(page.getByText('Você não pode conversar no seu próprio anúncio.')).toBeVisible();
  });
});
