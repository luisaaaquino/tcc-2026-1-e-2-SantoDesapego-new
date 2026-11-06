// Cliente do modelo de linguagem usado pelos dois assistentes (RF06 e RF24).
// A API do modelo é simulada (fetch); testa-se o tratamento da resposta.
process.env.LLM_API_KEY = 'chave-de-teste';
process.env.LLM_MIN_INTERVALO_S = '0';

// O cliente guarda a hora da última chamada (fila global). Cada teste
// carrega o módulo do zero para um teste não interferir no outro.
let chamadaEstruturada;
let extrairJSON;
let estimarCustoUsd;

const respostaModelo = (conteudo, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => ({ choices: [{ message: { content: conteudo } }], usage: { prompt_tokens: 120, completion_tokens: 30 } }),
  text: async () => 'erro',
});

const chamar = (validar) => chamadaEstruturada({ sistema: 's', usuario: 'u', schema: {}, validar });

beforeEach(() => {
  jest.useRealTimers();
  jest.resetModules();
  ({ chamadaEstruturada, extrairJSON, estimarCustoUsd } = require('../services/llmClient'));
  global.fetch = jest.fn();
});

afterEach(() => jest.useRealTimers());

describe('RF24 - Assistente de Compra com IA', () => {
  test('modelo: resposta em JSON é lida e o uso de tokens é contado', async () => {
    fetch.mockResolvedValueOnce(respostaModelo('{"itens_ids":[1]}'));
    const { conteudo, uso } = await chamar();
    expect(conteudo).toEqual({ itens_ids: [1] });
    expect(uso).toMatchObject({ tokens_entrada: 120, tokens_saida: 30, tentativas: 1 });

    const corpo = JSON.parse(fetch.mock.calls[0][1].body);
    expect(corpo.temperature).toBe(0);
    expect(corpo.response_format.type).toBe('json_schema');
  });

  test('modelo: aceita JSON mesmo dentro de bloco ```json', () => {
    expect(extrairJSON('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  test('modelo: resposta fora do formato ganha nova tentativa', async () => {
    jest.useFakeTimers();
    fetch.mockResolvedValueOnce(respostaModelo('isso não é json')).mockResolvedValueOnce(respostaModelo('{"ok":true}'));

    const promessa = chamar();
    await jest.advanceTimersByTimeAsync(3000);
    const { conteudo, uso } = await promessa;

    expect(conteudo).toEqual({ ok: true });
    expect(uso.tentativas).toBe(2);
  });

  test('modelo: resposta que não passa na validação do código também é repetida', async () => {
    jest.useFakeTimers();
    fetch.mockResolvedValueOnce(respostaModelo('{"x":1}')).mockResolvedValueOnce(respostaModelo('{"itens_ids":[]}'));

    const promessa = chamar((c) => (Array.isArray(c.itens_ids) ? null : 'sem itens_ids'));
    await jest.advanceTimersByTimeAsync(3000);
    expect((await promessa).conteudo).toEqual({ itens_ids: [] });
  });

  test('modelo: limite de uso (429) é tentado de novo e desiste depois de 4 tentativas', async () => {
    jest.useFakeTimers();
    fetch.mockResolvedValue(respostaModelo('', 429));

    const promessa = chamar().catch((e) => e);
    await jest.advanceTimersByTimeAsync(60000);
    const erro = await promessa;

    expect(erro.codigo).toBe('LLM_INDISPONIVEL');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test('modelo: erro fatal (chave inválida) falha na hora, sem repetir', async () => {
    fetch.mockResolvedValue(respostaModelo('', 401));
    await expect(chamar()).rejects.toMatchObject({ codigo: 'LLM_INDISPONIVEL', recuperavel: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('modelo: falha de rede vira erro "indisponível"', async () => {
    jest.useFakeTimers();
    fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const promessa = chamar().catch((e) => e);
    await jest.advanceTimersByTimeAsync(60000);
    expect((await promessa).message).toMatch(/Falha de rede/);
  });

  test('modelo: custo estimado é calculado pelos tokens usados', () => {
    expect(estimarCustoUsd({ tokens_entrada: 1_000_000, tokens_saida: 0 })).toBeCloseTo(0.30);
    expect(estimarCustoUsd({ tokens_entrada: 0, tokens_saida: 1_000_000 })).toBeCloseTo(2.50);
    expect(estimarCustoUsd(null)).toBe(0);
  });
});
