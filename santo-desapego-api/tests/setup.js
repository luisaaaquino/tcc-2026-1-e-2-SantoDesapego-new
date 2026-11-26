// Ambiente dos testes: segredo de JWT fixo e sem logs de console poluindo
// a saída. Nenhum teste acessa o banco real nem o Mercado Pago — os dois
// são substituídos por mocks em cada arquivo.
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.MP_MARKETPLACE_FEE_PERCENT = '5';
process.env.GOOGLE_CLIENT_ID = 'client-id-de-teste.apps.googleusercontent.com';

// A situação da conta (ativa/suspensa/removida), conferida pelo middleware
// em toda rota logada, é simulada como "ativa" para não desalinhar a
// sequência de respostas do pool.query de cada teste. Os casos de conta
// suspensa ou removida estão em tests/sessao_conta.test.js.
jest.mock('../utils/situacaoConta', () => ({ situacaoDaConta: jest.fn(async () => 'ativa') }));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
