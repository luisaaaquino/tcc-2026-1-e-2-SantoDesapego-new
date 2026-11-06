// A compra da geladeira já está paga no banco de teste (o pagamento real
// passa pelo Mercado Pago, fora do site). Daqui em diante é tudo pela tela.
const { test, expect } = require('@playwright/test');
const { USUARIOS, ANUNCIOS, CODIGO_ENTREGA } = require('../dados');
const { entrar, novaPessoa, fecharPessoas } = require('../utilitarios');

// Fecha os navegadores extras de cada teste
test.afterEach(fecharPessoas);

const cartaoDaCompra = (page) => page.locator('.compra-card-perfil', { hasText: ANUNCIOS.geladeira.titulo });
const confirmarCodigo = async (page, codigo) => {
  await cartaoDaCompra(page).getByPlaceholder('000000').fill(codigo);
  await cartaoDaCompra(page).getByRole('button', { name: 'Confirmar recebimento' }).click();
};

test.describe('RF17 - Histórico de Transações', () => {
  test('o comprador vê a compra no histórico e baixa o comprovante em PDF', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/perfil?aba=compras');
    await expect(cartaoDaCompra(page)).toContainText('Vendido por Caio Souza');
    await expect(cartaoDaCompra(page)).toContainText('Aprovado');

    const download = page.waitForEvent('download');
    await cartaoDaCompra(page).getByRole('button', { name: /Comprovante \(PDF\)/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^comprovante-santo-desapego-\d+\.pdf$/);
  });
});

test.describe('RN05 - Garantia de Recebimento (Escrow)', () => {
  test('antes da entrega, o pagamento aparece retido para os dois lados', async ({ browser }) => {
    const ana = await novaPessoa(browser);
    await entrar(ana, USUARIOS.comprador);
    await ana.goto('/perfil?aba=compras');
    await expect(cartaoDaCompra(ana)).toContainText('Pagamento retido até você confirmar o recebimento');

    const caio = await novaPessoa(browser);
    await entrar(caio, USUARIOS.vendedor);
    await caio.goto('/perfil?aba=vendas');
    await expect(cartaoDaCompra(caio)).toContainText(/Valor retido: R\$\s?1\.425,00/); // 1.500 - 5%
  });
});

test.describe('RF23 - Confirmação de Entrega por Código', () => {
  test('o vendedor vê o código de entrega; o comprador não', async ({ browser }) => {
    const caio = await novaPessoa(browser);
    await entrar(caio, USUARIOS.vendedor);
    await caio.goto('/perfil?aba=vendas');
    await expect(cartaoDaCompra(caio).locator('.entrega-codigo-valor')).toHaveText('482 913');

    const ana = await novaPessoa(browser);
    await entrar(ana, USUARIOS.comprador);
    await ana.goto('/perfil?aba=compras');
    await expect(cartaoDaCompra(ana)).not.toContainText('482');
  });
});

test.describe('RN16 - Código de Entrega', () => {
  test('código errado é recusado e mostra quantas tentativas restam', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/perfil?aba=compras');
    await confirmarCodigo(page, '000000');
    await expect(cartaoDaCompra(page)).toContainText('Código incorreto. Você tem mais 4 tentativa(s).');
  });
});

test.describe('RN08 - Liberação da Avaliação', () => {
  test('a avaliação só é liberada depois da entrega confirmada', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/perfil?aba=compras');
    await expect(cartaoDaCompra(page)).toContainText('Avaliação liberada após a entrega');
    await expect(cartaoDaCompra(page).getByRole('button', { name: /Avaliar vendedor/ })).toHaveCount(0);
  });
});

test.describe('RF16 - Sistema de Reputação', () => {
  test('com o código certo a entrega é confirmada, o comprador avalia e a nota aparece no perfil do vendedor', async ({ page }) => {
    await entrar(page, USUARIOS.comprador);
    await page.goto('/perfil?aba=compras');

    await confirmarCodigo(page, CODIGO_ENTREGA);
    await expect(cartaoDaCompra(page)).toContainText(/Recebimento confirmado em .* valor liberado ao vendedor/);

    await cartaoDaCompra(page).getByRole('button', { name: /Avaliar vendedor/ }).click();
    await page.getByRole('button', { name: '5 estrelas' }).click();
    await page.getByPlaceholder('Conte como foi a negociação (opcional)').fill('Entrega rápida e geladeira impecável.');
    await page.getByRole('button', { name: 'Enviar avaliação' }).click();
    await expect(cartaoDaCompra(page)).toContainText('Você avaliou esta compra');

    await page.goto('/explorar');
    await page.getByText(ANUNCIOS.bicicleta.titulo).click();
    await page.locator('.anuncio-vendedor').click();
    await expect(page.getByText('5.0 (1 avaliação)')).toBeVisible();
    await expect(page.getByText(/1\s*transação concluída/)).toBeVisible();
  });
});
