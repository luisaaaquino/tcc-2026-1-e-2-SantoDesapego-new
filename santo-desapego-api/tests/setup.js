// Ambiente dos testes: segredo de JWT fixo e sem logs de console poluindo
// a saída. Nenhum teste acessa o banco real nem o Mercado Pago — os dois
// são substituídos por mocks em cada arquivo.
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.MP_MARKETPLACE_FEE_PERCENT = '5';

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
