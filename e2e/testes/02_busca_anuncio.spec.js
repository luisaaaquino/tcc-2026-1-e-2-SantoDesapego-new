const { test, expect } = require('@playwright/test');
const { USUARIOS, ANUNCIOS } = require('../dados');
const { entrar } = require('../utilitarios');

const cards = (page) => page.locator('.ecard');
const tituloDosCards = (page) => page.locator('.ecard-titulo');

test.describe('RN13 - Validação de Raio de Atuação', () => {
  test('o catálogo é público: visitante vê os anúncios sem fazer login', async ({ page }) => {
    await page.goto('/explorar');
    await expect(tituloDosCards(page)).toContainText([ANUNCIOS.livro.titulo, ANUNCIOS.sofa.titulo, ANUNCIOS.bicicleta.titulo]);
  });

  test('ordenando por proximidade, o anúncio do bairro do comprador vem primeiro e mostra a distância', async ({ page }) => {
    await entrar(page, USUARIOS.comprador); // Ana mora em Santo Amaro Centro
    await page.goto('/explorar');
    await page.getByRole('combobox').selectOption('distancia');

    await expect(tituloDosCards(page).first()).toHaveText(ANUNCIOS.sofa.titulo); // Santo Amaro Centro
    await expect(cards(page).first().locator('.ecard-distancia')).toHaveText(/menos de 1 km/);
    await expect(cards(page).last()).toContainText(ANUNCIOS.bicicleta.titulo); // Brooklin, o mais longe
  });
});

test.describe('RF07 - Busca por Filtros', () => {
  test('busca por texto encontra o anúncio, sem ligar para acento ou maiúscula', async ({ page }) => {
    await page.goto('/explorar');
    await page.getByPlaceholder('Buscar sofá, bicicleta, livro...').fill('SOFA retratil');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(tituloDosCards(page)).toHaveText([ANUNCIOS.sofa.titulo]);
  });

  test('filtra por categoria', async ({ page }) => {
    await page.goto('/explorar');
    await page.locator('.filter-section--categoria').getByRole('button', { name: 'Livros' }).click();
    await expect(tituloDosCards(page)).toHaveText([ANUNCIOS.livro.titulo]);
  });

  test('filtra por estado de conservação', async ({ page }) => {
    await page.goto('/explorar');
    await page.getByLabel(/^Seminovo/).check();
    await expect(tituloDosCards(page)).toHaveText([ANUNCIOS.sofa.titulo]);
  });

  test('ordena do menor para o maior preço', async ({ page }) => {
    await page.goto('/explorar');
    await page.getByRole('combobox').selectOption('preco-menor');
    await expect(tituloDosCards(page)).toHaveText([ANUNCIOS.livro.titulo, ANUNCIOS.bicicleta.titulo, ANUNCIOS.sofa.titulo]);
  });

  test('busca sem resultado avisa que não há anúncios', async ({ page }) => {
    await page.goto('/explorar?busca=helicoptero');
    await expect(page.getByRole('heading', { name: 'Nenhum anúncio por aqui ainda' })).toBeVisible();
  });
});

test.describe('RF08 - Busca Geolocalizada por Proximidade', () => {
  test('filtra os anúncios por bairro', async ({ page }) => {
    await page.goto('/explorar');
    await page.locator('.explorar-sidebar').getByRole('button', { name: 'Granja Julieta' }).click();
    await expect(tituloDosCards(page)).toHaveText([ANUNCIOS.livro.titulo]);
  });
});

test.describe('RF12 - Gestão do Ciclo de Vida do Anúncio', () => {
  test('anúncio pausado e anúncio vendido não aparecem nas buscas', async ({ page }) => {
    await page.goto('/explorar');
    await expect(tituloDosCards(page)).toHaveCount(3);
    await expect(page.getByText(ANUNCIOS.pausado.titulo)).toHaveCount(0);
    await expect(page.getByText(ANUNCIOS.geladeira.titulo)).toHaveCount(0);
  });
});

test.describe('RF06 - Anúncio de Produtos', () => {
  test('a página do anúncio mostra preço, estado, bairro, descrição e o vendedor', async ({ page }) => {
    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.bicicleta.titulo).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ANUNCIOS.bicicleta.titulo);
    await expect(page.locator('.anuncio-preco')).toHaveText(/R\$\s?850,00/);
    await expect(page.getByText(ANUNCIOS.bicicleta.descricao)).toBeVisible();
    await expect(page.locator('.anuncio-ficha')).toContainText('Brooklin');
    await expect(page.locator('.anuncio-vendedor')).toContainText('Caio');
  });
});

test.describe('RN18 - Condições de Compra', () => {
  test('vendedor sem Mercado Pago conectado: o botão de compra fica desativado e o site explica', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.sofa.titulo).click();

    await expect(page.locator('.anuncio-acoes').getByRole('button', { name: 'Comprar agora' })).toBeDisabled();
    await expect(page.getByText('Este vendedor ainda não habilitou o recebimento de pagamentos')).toBeVisible();
  });
});

test.describe('RF10 - Favoritos e Itens Salvos', () => {
  test('salva um anúncio nos favoritos e ele aparece no perfil', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.livro.titulo).click();
    await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
    await expect(page.getByRole('button', { name: 'Salvo nos favoritos' })).toBeVisible();

    await page.goto('/perfil?aba=favoritos');
    await expect(page.getByText(ANUNCIOS.livro.titulo)).toBeVisible();
  });
});

test.describe('RF19 - Denúncia de Anúncios e Usuários', () => {
  test('denuncia um anúncio pela página dele', async ({ page }) => {
    await entrar(page, USUARIOS.vizinho);
    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.livro.titulo).click();

    await page.getByRole('button', { name: /Denunciar este anúncio/ }).click();
    await page.locator('.denuncia-modal select').selectOption('fraude');
    await page.locator('.denuncia-modal textarea').fill('Pediu para pagar por fora do site.');
    await page.getByRole('button', { name: 'Enviar denúncia' }).click();

    await expect(page.getByRole('heading', { name: 'Denúncia enviada' })).toBeVisible();
  });
});
