const { test, expect } = require('@playwright/test');
const { SENHA, cpf } = require('../dados');
const { esperarCodigo, digitarCodigo } = require('../utilitarios');

const NOVA = { nome: 'Lia', sobrenome: 'Moraes', email: 'lia@e2e.santodesapego.com', cpf: cpf('321654987') };

// O ViaCEP é um serviço externo: no teste ele responde com um endereço fixo
const simularViaCep = (page) => page.route('**/viacep.com.br/**', (rota) => rota.fulfill({
  json: { cep: '04710-150', logradouro: 'Rua Padre José de Anchieta', bairro: 'Santo Amaro Centro', localidade: 'São Paulo' },
}));

const preencherCadastro = async (page, dados) => {
  await page.getByPlaceholder('Ex: Mariana').fill(dados.nome);
  await page.getByPlaceholder('Ex: Costa').fill(dados.sobrenome);
  await page.getByPlaceholder('000.000.000-00').pressSequentially(dados.cpf);
  await page.getByLabel('Data de nascimento').fill(dados.data || '1995-07-14');
  await page.getByPlaceholder('(11) 99999-9999').pressSequentially('11987654321');
  await page.getByPlaceholder('voce@email.com').fill(dados.email);
  await page.getByPlaceholder('repita seu e-mail').fill(dados.email);
  await page.getByPlaceholder('Mínimo 8 caracteres').fill(SENHA);
  await page.getByPlaceholder('repita sua senha').fill(SENHA);
  await page.getByPlaceholder('04000-000').pressSequentially('04710150');
  await expect(page.getByPlaceholder('Rua, Av., Travessa...')).toHaveValue('Rua Padre José de Anchieta');
  await page.getByPlaceholder('Ex: 123').fill('250');
  await page.locator('.checkbox-custom').first().click();
};

test.describe('RF01 - Gestão de Perfil Geográfico', () => {
  test('cadastro completo: CEP preenche o endereço, o e-mail é confirmado por código e a pessoa já entra logada', async ({ page }) => {
    await simularViaCep(page);
    await page.goto('/cadastro');
    await preencherCadastro(page, NOVA);
    await page.getByRole('button', { name: /Criar minha conta grátis/ }).click();

    await expect(page.getByRole('heading', { name: /Confirme seu e-mail/ })).toBeVisible();
    await digitarCodigo(page, await esperarCodigo(NOVA.email, 0));

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Olá, Lia!').first()).toBeVisible();
  });

  test('o mesmo CPF não pode ser cadastrado duas vezes', async ({ page }) => {
    await simularViaCep(page);
    await page.goto('/cadastro');
    await preencherCadastro(page, { ...NOVA, email: 'outra@e2e.santodesapego.com' });
    await page.getByRole('button', { name: /Criar minha conta grátis/ }).click();
    await expect(page.getByText('E-mail ou CPF já cadastrado na plataforma.')).toBeVisible();
  });
});

test.describe('RN02 - Verificação de Identidade (Compliance)', () => {
  test('CPF inválido é apontado na tela e o cadastro não é enviado', async ({ page }) => {
    await simularViaCep(page);
    await page.goto('/cadastro');
    await preencherCadastro(page, { ...NOVA, email: 'cpf@e2e.santodesapego.com', cpf: '12345678900' });
    await expect(page.getByText('CPF inválido.')).toBeVisible();
    await page.getByRole('button', { name: /Criar minha conta grátis/ }).click();
    await expect(page.getByText('CPF inválido. Verifique os dígitos.')).toBeVisible();
  });
});

test.describe('RF27 - Verificação de Maioridade', () => {
  test('menor de 18 anos não consegue criar a conta', async ({ page }) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    const dataMenor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await simularViaCep(page);
    await page.goto('/cadastro');
    await preencherCadastro(page, { ...NOVA, email: 'menor@e2e.santodesapego.com', cpf: cpf('159753486'), data: dataMenor });
    await expect(page.getByText(/É preciso ter 18 anos ou mais/).first()).toBeVisible();

    await page.getByRole('button', { name: /Criar minha conta grátis/ }).click();
    await expect(page.getByRole('alert')).toContainText('É preciso ter 18 anos ou mais para se cadastrar no Santo Desapego.');
    await expect(page.getByRole('heading', { name: /Confirme seu e-mail/ })).toHaveCount(0);
  });
});

test.describe('RN11 - Consentimento Livre e Esclarecido', () => {
  test('sem aceitar os Termos de Uso a conta não é criada', async ({ page }) => {
    await simularViaCep(page);
    await page.goto('/cadastro');
    await preencherCadastro(page, { ...NOVA, email: 'termos@e2e.santodesapego.com', cpf: cpf('741852963') });
    await page.locator('.checkbox-custom').first().click(); // desmarca
    await page.getByRole('button', { name: /Criar minha conta grátis/ }).click();
    await expect(page.getByText('Você precisa aceitar os Termos de Uso para continuar.')).toBeVisible();
  });
});
