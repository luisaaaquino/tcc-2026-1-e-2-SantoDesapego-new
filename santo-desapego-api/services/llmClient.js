/**
 * Cliente de LLM compartilhado entre os agentes de IA do site (Agente B —
 * Assistente de Anúncio, e Agente A — Consultor de Compra).
 *
 * Porte do src/llm.py do repositório agents-llm-senac-2026 (Parte 2):
 * - Saída estruturada por JSON Schema (`response_format: json_schema`, o
 *   mesmo que o `beta.chat.completions.parse` do SDK Python manda) + a
 *   validação manual de sempre em código: o schema garante o formato, não
 *   que a resposta seja a certa.
 * - Temperatura 0.
 * - Espaçamento mínimo entre chamadas (o plano gratuito do Gemini limita
 *   as chamadas por minuto). A fila é global — o limite é da chave, não de
 *   cada usuário do site.
 * - Erro recuperável (limite, sobrecarga, timeout, JSON fora do formato)
 *   ganha nova tentativa com espera crescente; erro fatal (chave inválida,
 *   requisição malformada, modelo inexistente) falha na hora.
 *
 * Provedor compatível com a API da OpenAI — trocar é só mudar
 * LLM_BASE_URL / LLM_MODELO / chave no .env.
 */
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
// Sem barra no fim: o caminho /chat/completions é concatenado abaixo.
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/').replace(/\/+$/, '');
const LLM_MODELO = process.env.LLM_MODELO || 'gemini-3.5-flash-lite';
// O avaliador pode usar outro modelo (plano B do case, §2.11); vazio = o mesmo.
const LLM_MODELO_AVALIADOR = process.env.LLM_MODELO_AVALIADOR || LLM_MODELO;
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const LLM_MIN_INTERVALO_MS = Number(process.env.LLM_MIN_INTERVALO_S || 4) * 1000;
const LLM_RETRIES_RECUPERAVEIS = 3;
const TEMPERATURA = 0;

// Alguns modelos devolvem o JSON dentro de um bloco ```json apesar da
// instrução de "só JSON" — remove a cerca antes de fazer o parse.
function extrairJSON(texto) {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(limpo);
}

/* ── Espaçamento entre chamadas (fila global) ─────────────────── */
let filaChamadas = Promise.resolve();
let ultimaChamadaEm = 0;

function aguardarVez() {
  const vez = filaChamadas.then(async () => {
    const espera = LLM_MIN_INTERVALO_MS - (Date.now() - ultimaChamadaEm);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamadaEm = Date.now();
  });
  filaChamadas = vez.catch(() => {});
  return vez;
}

function erroLLM(mensagem, codigo, extra = {}) {
  const erro = new Error(mensagem);
  erro.codigo = codigo;
  Object.assign(erro, extra);
  return erro;
}

async function chamarBruto({ sistema, usuario, schema, nomeSchema, modelo, maxTokens }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: TEMPERATURA,
        max_tokens: maxTokens,
        // `usuario` é obrigatório: o Gemini recusa requisição só com
        // mensagem de sistema ("contents is not specified").
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
        response_format: { type: 'json_schema', json_schema: { name: nomeSchema, schema } },
      }),
      signal: controller.signal,
    });
  } catch (erroFetch) {
    throw erroLLM(
      erroFetch.name === 'AbortError'
        ? `Chamada ao LLM excedeu ${LLM_TIMEOUT_MS}ms sem resposta.`
        : `Falha de rede ao chamar o LLM: ${erroFetch.message}`,
      'LLM_INDISPONIVEL', { recuperavel: true }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    const recuperavel = [429, 500, 502, 503, 504].includes(resp.status);
    throw erroLLM(`Falha na chamada ao LLM (${resp.status}): ${texto.slice(0, 500)}`,
      'LLM_INDISPONIVEL', { status: resp.status, recuperavel });
  }
  return resp.json();
}

/**
 * Uma chamada ao modelo com saída validada.
 * - `schema`: JSON Schema do objeto esperado (vai pro provedor).
 * - `validar(conteudo)`: confere em código; devolve string de erro ou null.
 * Devolve { conteudo, uso: { tokens_entrada, tokens_saida, tentativas, ms, modelo } }.
 */
async function chamadaEstruturada({ sistema, usuario, schema, nomeSchema = 'resposta', validar,
  modelo = LLM_MODELO, maxTokens = 800 }) {
  if (!LLM_API_KEY) throw erroLLM('Chave do LLM não configurada no .env (LLM_API_KEY ou OPENAI_API_KEY).', 'LLM_INDISPONIVEL');

  const uso = { tokens_entrada: 0, tokens_saida: 0, tentativas: 0, ms: 0, modelo };
  const inicio = Date.now();
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= LLM_RETRIES_RECUPERAVEIS + 1; tentativa++) {
    uso.tentativas = tentativa;
    await aguardarVez();
    try {
      const json = await chamarBruto({ sistema, usuario, schema, nomeSchema, modelo, maxTokens });
      uso.tokens_entrada += json.usage?.prompt_tokens || 0;
      uso.tokens_saida += json.usage?.completion_tokens || 0;

      let conteudo;
      try {
        conteudo = extrairJSON(json.choices?.[0]?.message?.content || '');
      } catch {
        throw erroLLM('Resposta não é um JSON válido.', 'LLM_RESPOSTA_INVALIDA', { recuperavel: true });
      }
      const erroValidacao = validar ? validar(conteudo) : null;
      if (erroValidacao) {
        throw erroLLM(`Resposta fora do formato: ${erroValidacao}`, 'LLM_RESPOSTA_INVALIDA', { recuperavel: true });
      }
      uso.ms = Date.now() - inicio;
      return { conteudo, uso };
    } catch (erro) {
      ultimoErro = erro;
      if (!erro.recuperavel) throw erro;
      if (tentativa <= LLM_RETRIES_RECUPERAVEIS) {
        await new Promise((r) => setTimeout(r, Math.min(2 ** tentativa, 20) * 1000));
      }
    }
  }
  throw ultimoErro;
}

// ── Preço estimado por token (só pra monitorar o teto de custo — não é
//    cobrança real; no plano gratuito o custo é zero). Tabela paga do
//    gemini-3.5-flash-lite, como no config.py do repositório. ──────────
const PRECO_USD_POR_TOKEN_ENTRADA = 0.30 / 1_000_000;
const PRECO_USD_POR_TOKEN_SAIDA = 2.50 / 1_000_000;

function estimarCustoUsd(uso) {
  if (!uso) return 0;
  return (uso.tokens_entrada || 0) * PRECO_USD_POR_TOKEN_ENTRADA
    + (uso.tokens_saida || 0) * PRECO_USD_POR_TOKEN_SAIDA;
}

// Helpers de JSON Schema (anyOf com null é como o Pydantic descreve campo opcional)
const anulavel = (schema) => ({ anyOf: [schema, { type: 'null' }] });

module.exports = {
  chamadaEstruturada, extrairJSON, estimarCustoUsd, anulavel,
  LLM_MODELO, LLM_MODELO_AVALIADOR,
};
