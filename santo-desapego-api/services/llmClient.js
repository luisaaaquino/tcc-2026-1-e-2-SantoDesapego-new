/**
 * Cliente de LLM compartilhado entre os agentes de IA do site (Agente B —
 * Assistente de Anúncio, e Agente A — Consultor de Compra). Extraído de
 * agenteAnuncioService.js pra não duplicar a lógica de chamada/retry/timeout
 * quando o segundo agente foi adicionado.
 *
 * Provedor-agnóstico por desenho: usa o modo básico de JSON
 * (`response_format: {type:"json_object"}`, suportado por qualquer API
 * compatível com OpenAI) + validação manual do formato no código — troca de
 * provedor é só mudar LLM_BASE_URL/LLM_API_KEY/LLM_MODELO no .env.
 */
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const LLM_MODELO = process.env.LLM_MODELO || 'deepseek-chat';
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000);

// Tiers gratuitos costumam ter rate limit agressivo (ex. GLM-4.5-Flash) —
// numa conversa, cada turno já dispara 2+ chamadas (ação + avaliador), então
// um 429 é esperado de vez em quando, não uma falha real. Reage com backoff
// exponencial (1s, 2s, 4s) antes de desistir.
const LLM_MAX_TENTATIVAS_429 = 4;

// Alguns modelos devolvem o JSON dentro de um bloco ```json apesar da
// instrução de "só JSON" — remove a cerca antes de fazer o parse.
function extrairJSON(texto) {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(limpo);
}

async function chamarLLMBruto(mensagens) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODELO,
        messages: mensagens,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
  } catch (erroFetch) {
    const erro = new Error(
      erroFetch.name === 'AbortError'
        ? `Chamada ao LLM excedeu ${LLM_TIMEOUT_MS}ms sem resposta.`
        : `Falha de rede ao chamar o LLM: ${erroFetch.message}`
    );
    erro.codigo = 'LLM_INDISPONIVEL';
    throw erro;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    const erro = new Error(`Falha na chamada ao LLM (${resp.status}): ${texto}`);
    erro.codigo = 'LLM_INDISPONIVEL';
    erro.status = resp.status;
    throw erro;
  }

  return resp.json();
}

async function chamarLLM(mensagens) {
  if (!LLM_API_KEY) {
    const erro = new Error('LLM_API_KEY não configurada no .env.');
    erro.codigo = 'LLM_INDISPONIVEL';
    throw erro;
  }

  let json;
  for (let tentativa = 1; tentativa <= LLM_MAX_TENTATIVAS_429; tentativa++) {
    try {
      json = await chamarLLMBruto(mensagens);
      break;
    } catch (erro) {
      const eh429 = erro.status === 429;
      if (!eh429 || tentativa === LLM_MAX_TENTATIVAS_429) throw erro;
      const esperaMs = 1000 * 2 ** (tentativa - 1);
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }

  const bruto = json.choices?.[0]?.message?.content || '{}';
  let conteudo;
  try {
    conteudo = extrairJSON(bruto);
  } catch {
    conteudo = null; // quem chamou decide se tenta de novo
  }
  return { conteudo, bruto, usage: json.usage };
}

// Chama o LLM e valida o formato da resposta contra `validar`; se vier
// malformado, reenvia pedindo correção (até 2 tentativas extras) antes de
// desistir. `validar` devolve uma string de erro ou null.
async function chamarLLMValidado(mensagens, validar, maxTentativas = 3) {
  let ultimoUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let mensagensAtuais = mensagens;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const { conteudo, bruto, usage } = await chamarLLM(mensagensAtuais);
    if (usage) ultimoUsage = usage;

    const erroValidacao = conteudo === null ? 'Resposta não é um JSON válido.' : validar(conteudo);
    if (!erroValidacao) return { conteudo, usage: ultimoUsage };

    if (tentativa === maxTentativas) {
      const erro = new Error(`LLM não devolveu um JSON válido após ${maxTentativas} tentativas: ${erroValidacao}`);
      erro.codigo = 'LLM_RESPOSTA_INVALIDA';
      throw erro;
    }

    mensagensAtuais = [
      ...mensagensAtuais,
      { role: 'assistant', content: bruto },
      { role: 'user', content: `Sua resposta não seguiu o formato esperado (${erroValidacao}). Responda de novo, só com o JSON no formato correto, sem texto fora dele.` },
    ];
  }
}

// ── Preço estimado por token (só pra monitorar o teto de custo — não é
//    cobrança real; ajustar se trocar de provedor/modelo) ──────────────
const PRECO_USD_POR_TOKEN_ENTRADA = 0.30 / 1_000_000;
const PRECO_USD_POR_TOKEN_SAIDA = 1.20 / 1_000_000;

function estimarCustoUsd(usage) {
  if (!usage) return 0;
  return ((usage.prompt_tokens || 0) * PRECO_USD_POR_TOKEN_ENTRADA) +
         ((usage.completion_tokens || 0) * PRECO_USD_POR_TOKEN_SAIDA);
}

module.exports = { chamarLLM, chamarLLMValidado, extrairJSON, estimarCustoUsd };
