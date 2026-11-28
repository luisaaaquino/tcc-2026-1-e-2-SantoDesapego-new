const { test, expect } = require('@playwright/test');
const { USUARIOS, IMAGEM } = require('../dados');
const { entrar, novaPessoa, fecharPessoas } = require('../utilitarios');

test.afterEach(fecharPessoas);

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
  test('vendedor publica um anúncio com foto e ele aparece na busca', async ({ page, browser }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/anunciar');
    await preencherAnuncio(page, 'Patinete elétrico Xiaomi');
    await page.getByRole('button', { name: /Publicar anúncio/ }).click();

    await expect(page.getByRole('heading', { name: /Seu anúncio está no ar/ })).toBeVisible();

    // O vendedor não vê os próprios anúncios no Explorar: quem confere é um visitante
    const visitante = await novaPessoa(browser);
    await visitante.goto('/explorar?busca=patinete');
    await expect(visitante.locator('.cartao-anuncio-titulo')).toHaveText(['Patinete elétrico Xiaomi']);
    await expect(visitante.locator('.cartao-anuncio-preco')).toHaveText(/R\$\s?1\.350,90/);
  });

  test('o anúncio novo aparece no painel do vendedor', async ({ page }) => {
    await entrar(page, USUARIOS.vendedor);
    await page.goto('/perfil?aba=anuncios');
    await expect(page.getByText('Patinete elétrico Xiaomi')).toBeVisible();
  });
});

test.describe('RN01 - Restrição Geográfica de Anúncios', () => {
  test('quem mora fora de Santo Amaro e região não consegue anunciar', async ({ page }) => {
    // O anúncio usa o CEP do cadastro (não dá para digitar outro na tela)
    await entrar(page, USUARIOS.foraDaArea);
    await page.goto('/anunciar');
    await expect(page.getByRole('heading', { name: 'Seu endereço fica fora da área atendida' })).toBeVisible();
    await expect(page.getByText(/04600-000 a 04799-999/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Publicar anúncio/ })).toHaveCount(0);
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
