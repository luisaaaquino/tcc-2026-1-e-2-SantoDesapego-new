const { test, expect } = require('@playwright/test');
const { USUARIOS, IMAGEM } = require('../dados');
const { entrar } = require('../utilitarios');

const FOTO = { name: 'bicicleta.png', mimeType: 'image/png', buffer: Buffer.from(IMAGEM.split(',')[1], 'base64') };

const preencherAnuncio = async (page, titulo) => {
  await page.getByPlaceholder(/Ex: Sofá 3 lugares/).fill(titulo);
  await page.getByPlaceholder(/Descreva o produto/).fill('Patinete elétrico com bateria nova, autonomia de 20 km e carregador.');
  await page.locator('.estado-option', { hasText: 'Seminovo' }).click();
  const [principal, subcategoria] = await page.locator('select.anunciar-select').all();
  await principal.selectOption({ label: 'Esporte e Lazer' });
  await subcategoria.selectOption({ label: 'Fitness e academia' });
  await page.getByPlaceholder('0,00').fill('1350,90');
  await page.locator('input[type="file"]').setInputFiles(FOTO);
  await expect(page.getByText('1/6')).toBeVisible();
};

test.describe('RF06 - Anúncio de Produtos', () => {
  test('vendedor publica um anúncio com foto e ele aparece na busca', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/anunciar');
    await preencherAnuncio(page, 'Patinete elétrico Xiaomi');
    await page.getByRole('button', { name: /Publicar anúncio/ }).click();

    await expect(page.getByRole('heading', { name: /Seu anúncio está no ar/ })).toBeVisible();

    await page.goto('/explorar?busca=patinete');
    await expect(page.locator('.ecard-titulo')).toHaveText(['Patinete elétrico Xiaomi']);
    await expect(page.locator('.ecard-preco')).toHaveText(/R\$\s?1\.350,90/);
  });

  test('o anúncio novo aparece no painel do vendedor', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/perfil?aba=anuncios');
    await expect(page.getByText('Patinete elétrico Xiaomi')).toBeVisible();
  });
});

test.describe('RN01 - Restrição Geográfica de Anúncios', () => {
  test('anúncio com CEP fora de Santo Amaro e região é recusado', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/anunciar');
    await preencherAnuncio(page, 'Patinete fora da área');
    await page.getByPlaceholder('04000-000').fill('01310-100');
    await page.getByRole('button', { name: /Publicar anúncio/ }).click();

    await expect(page.locator('.anunciar-alert.error')).toContainText('Santo Amaro');
    await page.goto('/explorar?busca=fora');
    await expect(page.getByRole('heading', { name: 'Nenhum anúncio por aqui ainda' })).toBeVisible();
  });
});

test.describe('RN09 - Moderação de Conteúdo', () => {
  test('anúncio com palavra proibida é bloqueado antes de publicar', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/anunciar');
    await preencherAnuncio(page, 'Pistola de airsoft');
    await page.getByRole('button', { name: /Publicar anúncio/ }).click();
    await expect(page.locator('.anunciar-alert.error')).toContainText('conteúdo não permitido');
  });
});

test.describe('RNF20 - Tolerância a Falhas da Inteligência Artificial', () => {
  test('com a IA fora do ar, o assistente avisa e o formulário manual continua funcionando', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/anunciar');
    await page.getByRole('button', { name: /Conversar com IA/ }).click();
    await page.getByPlaceholder('Digite sua resposta...').fill('Quero vender minha bicicleta ergométrica');
    await page.getByPlaceholder('Digite sua resposta...').press('Enter');

    await expect(page.locator('.ia-chat-erro')).toContainText(/indisponível/);

    await page.getByRole('button', { name: 'Preencher manualmente' }).click();
    await expect(page.getByPlaceholder(/Ex: Sofá 3 lugares/)).toBeEditable();
  });
});
