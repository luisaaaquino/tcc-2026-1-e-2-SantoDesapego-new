/**
 * Agente de Anúncio (IA) — "Agente B" do case acadêmico
 * agents-llm-senac-2026, portado de Python/SQLite pra este backend
 * Node/PostgreSQL. Conversa com o vendedor pra montar um anúncio completo
 * e honesto: faz emergir defeitos que ele não declara, sugere preço pelo
 * mercado local e nunca bloqueia sozinho — se o vendedor recusa declarar
 * uma avaria, registra o indício pra moderação humana, sem publicar.
 *
 * Fiel ao design original: 6 ações por passo (ReAct), avaliador separado
 * (mesmo LLM, prompt diferente) confere 5 critérios booleanos antes de
 * aprovar publicação, orçamento de passos/tokens/custo/tempo por conversa,
 * detector de laço.
 *
 * Provedor de LLM é agnóstico por desenho: usa o modo básico de JSON
 * (`response_format: {type:"json_object"}`, suportado por qualquer API
 * compatível com OpenAI) + validação manual do formato no código — troca de
 * provedor é só mudar LLM_BASE_URL/LLM_API_KEY/LLM_MODELO no .env.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { validarDadosAnuncio, inserirAnuncio } = require('./anuncioService');

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const LLM_MODELO = process.env.LLM_MODELO || 'deepseek-chat';

const MAX_PASSOS = Number(process.env.AGENTE_MAX_PASSOS || 12);
const MAX_TOKENS = Number(process.env.AGENTE_MAX_TOKENS || 60000);
const MAX_CUSTO_USD = Number(process.env.AGENTE_MAX_CUSTO_USD || 0.01);
const MAX_TEMPO_MS = Number(process.env.AGENTE_MAX_TEMPO_MS || 120000);

const PROMPT_AGENTE = fs.readFileSync(path.join(__dirname, '../prompts/agente.md'), 'utf8');
const PROMPT_AVALIADOR = fs.readFileSync(path.join(__dirname, '../prompts/avaliador.md'), 'utf8');

const ACOES_VALIDAS = ['perguntar', 'consultar_preco', 'preencher_rascunho', 'publicar', 'registrar_indicio', 'concluir'];
const ESTADOS_VALIDOS = ['novo', 'seminovo', 'usado', 'para-reparo'];

// ── Preço estimado por token (só pra monitorar o teto de custo — não é
//    cobrança real; ajustar se trocar de provedor/modelo) ──────────────
const PRECO_USD_POR_TOKEN_ENTRADA = 0.30 / 1_000_000;
const PRECO_USD_POR_TOKEN_SAIDA = 1.20 / 1_000_000;

/* ════════════════════════════════════════════════════════════
   Chamada ao LLM — JSON básico (portável) + validação manual
   ════════════════════════════════════════════════════════════ */

// Alguns modelos devolvem o JSON dentro de um bloco ```json apesar da
// instrução de "só JSON" — remove a cerca antes de fazer o parse.
function extrairJSON(texto) {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(limpo);
}

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 45000);

// Tiers gratuitos costumam ter rate limit agressivo (ex. GLM-4.7-Flash) —
// numa conversa, cada turno do vendedor já dispara 2+ chamadas (ação +
// avaliador), então um 429 é esperado de vez em quando, não uma falha real.
// Reage com backoff exponencial (1s, 2s, 4s) antes de desistir.
const LLM_MAX_TENTATIVAS_429 = 4;

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

function validarAcaoLLM(conteudo) {
  if (typeof conteudo !== 'object' || conteudo === null) return 'não é um objeto';
  if (!ACOES_VALIDAS.includes(conteudo.acao)) return `campo "acao" ausente ou inválido (esperado um de: ${ACOES_VALIDAS.join(', ')})`;
  if (conteudo.acao === 'perguntar' && !conteudo.pergunta) return '"pergunta" é obrigatório quando acao="perguntar"';
  if (conteudo.acao === 'consultar_preco' && !conteudo.consulta) return '"consulta" é obrigatório quando acao="consultar_preco"';
  if (conteudo.acao === 'preencher_rascunho' && !conteudo.rascunho) return '"rascunho" é obrigatório quando acao="preencher_rascunho"';
  if (conteudo.acao === 'registrar_indicio' && !conteudo.indicio) return '"indicio" é obrigatório quando acao="registrar_indicio"';
  if (conteudo.rascunho?.estado_conservacao != null && !ESTADOS_VALIDOS.includes(conteudo.rascunho.estado_conservacao)) {
    return `"rascunho.estado_conservacao" inválido (esperado um de: ${ESTADOS_VALIDOS.join(', ')})`;
  }
  return null;
}

function validarAvaliacaoLLM(conteudo) {
  if (typeof conteudo !== 'object' || conteudo === null) return 'não é um objeto';
  const camposBooleanos = ['tem_titulo', 'tem_categoria', 'tem_descricao', 'preco_na_faixa', 'estado_tratado', 'aprovado'];
  for (const campo of camposBooleanos) {
    if (typeof conteudo[campo] !== 'boolean') return `"${campo}" precisa ser booleano`;
  }
  if (!Array.isArray(conteudo.faltando)) return '"faltando" precisa ser um array';
  return null;
}

/* ════════════════════════════════════════════════════════════
   Categorias (cache simples, raramente mudam)
   O site tem categorias-pai (Móveis & Casa, Eletrônicos, ...) e cada uma
   tem subcategorias — o formulário manual exige a subcategoria sempre que
   a categoria-pai tem alguma (ver Anunciar.jsx). Pra publicar um anúncio
   coerente com o resto do site (filtros/busca usam a subcategoria), o
   agente só pode escolher entre as subcategorias (folhas), nunca a
   categoria-pai direto — por isso a consulta abaixo já filtra
   `categoria_pai IS NOT NULL` e inclui o nome da categoria-pai, pra dar
   contexto sem o LLM precisar cruzar os dois níveis sozinho.
   ════════════════════════════════════════════════════════════ */
let categoriasCache = null;
let categoriasCacheEm = 0;

async function categoriasDisponiveis() {
  if (categoriasCache && Date.now() - categoriasCacheEm < 5 * 60 * 1000) return categoriasCache;
  const { rows } = await pool.query(`
    SELECT c.id, c.nome, p.nome AS categoria_pai
    FROM categorias c
    JOIN categorias p ON c.categoria_pai = p.id
    ORDER BY p.ordem, c.ordem
  `);
  categoriasCache = rows;
  categoriasCacheEm = Date.now();
  return rows;
}

/* ════════════════════════════════════════════════════════════
   Ferramenta 1 — consultar preço de comparáveis
   Busca em cascata: categoria+termo+bairro → categoria+termo (cidade
   toda) → só categoria. Para na primeira tentativa com ≥3 resultados.
   Mesmo padrão TRANSLATE (sem depender da extensão unaccent) já usado
   na busca de /api/anuncios.
   ════════════════════════════════════════════════════════════ */
const ACENTOS_DE = `'áàâãäéèêëíìîïóòôõöúùûüçñ'`;
const ACENTOS_PARA = `'aaaaaeeeeiiiiooooouuuucn'`;

async function consultarPrecoComparaveis({ categoria_id, termo_busca, bairro }) {
  if (!categoria_id) return { erro: 'categoria_id_obrigatorio' };
  const termo = (termo_busca || '').trim();

  const tentativas = [
    { usarBairro: true, usarTermo: true },
    { usarBairro: false, usarTermo: true },
    { usarBairro: false, usarTermo: false },
  ];

  for (const t of tentativas) {
    const params = [categoria_id];
    let where = `categoria_id = $1 AND status IN ('ativo','vendido')`;
    if (t.usarBairro && bairro) {
      params.push(bairro);
      where += ` AND bairro = $${params.length}`;
    }
    if (t.usarTermo && termo) {
      params.push(`%${termo.toLowerCase()}%`);
      where += ` AND TRANSLATE(LOWER(titulo), ${ACENTOS_DE}, ${ACENTOS_PARA}) LIKE $${params.length}`;
    }
    const { rows } = await pool.query(`SELECT preco FROM anuncios WHERE ${where}`, params);
    if (rows.length >= 3) {
      const precos = rows.map((r) => Number(r.preco)).sort((a, b) => a - b);
      return {
        precisao: t.usarBairro ? 'bairro_e_termo' : (t.usarTermo ? 'cidade_e_termo' : 'categoria_ampla'),
        n: precos.length,
        faixa_min: precos[0],
        faixa_max: precos[precos.length - 1],
        media: Number((precos.reduce((a, b) => a + b, 0) / precos.length).toFixed(2)),
      };
    }
  }
  return { erro: 'sem_comparaveis', categoria_id, termo_busca: termo, bairro };
}

/* ════════════════════════════════════════════════════════════
   Ferramenta 2 — publicar (reaproveita anuncioService, sem duplicar regra)
   ════════════════════════════════════════════════════════════ */
async function publicarAnuncioNoBanco({ vendedorId, rascunho, imagens }) {
  const dados = {
    titulo: rascunho.titulo,
    descricao: rascunho.descricao,
    preco: rascunho.preco,
    aceita_troca: false,
    estado_conservacao: rascunho.estado_conservacao,
    categoria_id: rascunho.categoria_id,
    cep: rascunho.cep,
    bairro: rascunho.bairro,
    imagens,
  };
  const erro = await validarDadosAnuncio(dados);
  if (erro) return { erro }; // defensivo: revalida mesmo com avaliador aprovando
  const anuncio = await inserirAnuncio({ vendedorId, ...dados });
  return { anuncio };
}

/* ════════════════════════════════════════════════════════════
   Ferramenta 3 — registrar indício de avaria (não publica)
   ════════════════════════════════════════════════════════════ */
async function registrarIndicioAvaria({ vendedorId, rascunho, indicio }) {
  const { rows } = await pool.query(
    `INSERT INTO indicios_moderacao (vendedor_id, rascunho, indicio, status)
     VALUES ($1, $2, $3, 'pendente') RETURNING id, status, data_criacao`,
    [vendedorId, JSON.stringify(rascunho), indicio]
  );
  return rows[0];
}

/* ════════════════════════════════════════════════════════════
   Avaliador — segunda chamada ao LLM, prompt separado
   ════════════════════════════════════════════════════════════ */
async function avaliarRascunho(estado) {
  const mensagens = [
    { role: 'system', content: PROMPT_AVALIADOR },
    {
      role: 'user',
      content: JSON.stringify({
        rascunho: estado.rascunho,
        observacao_preco: estado.observacoes.ultima_consulta_preco,
        indicios_registrados: estado.observacoes.indicios_suspeitos,
        // O critério `preco_na_faixa` do avaliador tem uma exceção — preço
        // fora da faixa É aceitável se o vendedor foi avisado e manteve por
        // decisão própria. Sem a conversa, o avaliador não tem como saber
        // se isso aconteceu e reprova sempre que o preço diverge do mercado.
        conversa: estado.conversa,
      }),
    },
  ];
  const { conteudo, usage } = await chamarLLMValidado(mensagens, validarAvaliacaoLLM);
  registrarUso(estado, usage);
  return conteudo;
}

/* ════════════════════════════════════════════════════════════
   Orçamento / detector de laço / trajetória
   ════════════════════════════════════════════════════════════ */
function registrarUso(estado, usage) {
  if (!usage) return;
  estado.orcamento.tokens_usados += usage.total_tokens || 0;
  estado.orcamento.custo_usd_acumulado +=
    ((usage.prompt_tokens || 0) * PRECO_USD_POR_TOKEN_ENTRADA) +
    ((usage.completion_tokens || 0) * PRECO_USD_POR_TOKEN_SAIDA);
}

function detectarLaco(estado, acao) {
  const recentes = estado.orcamento.acoes_recentes;
  recentes.push(acao);
  if (recentes.length > 3) recentes.shift();
  return recentes.length === 3 && recentes.every((a) => a === acao);
}

function registrarTrajetoria(estado, entrada, saida = null) {
  estado.trajetoria.push({ passo: estado.orcamento.passos_usados, entrada, saida, timestamp: new Date().toISOString() });
}

/* ════════════════════════════════════════════════════════════
   Estado inicial (nova conversa)
   ════════════════════════════════════════════════════════════ */
async function estadoInicial({ cep, bairro }) {
  return {
    conversa: [],
    rascunho: {
      titulo: null, categoria_id: null, descricao: null, preco: null,
      bairro: bairro || null, cep: cep || null, estado_conservacao: null,
    },
    observacoes: { comparaveis_consultados: false, ultima_consulta_preco: null, indicios_suspeitos: [] },
    avaliacao: null,
    orcamento: { passos_usados: 0, tokens_usados: 0, custo_usd_acumulado: 0, acoes_recentes: [] },
    trajetoria: [],
    finalizado: false,
  };
}

function construirMensagensAgente(estado, categorias) {
  const contexto = {
    rascunho_atual: estado.rascunho,
    avaliacao_atual: estado.avaliacao,
    observacoes: estado.observacoes,
    categorias_disponiveis: categorias,
    passos_restantes: MAX_PASSOS - estado.orcamento.passos_usados,
  };
  return [
    { role: 'system', content: PROMPT_AGENTE },
    { role: 'system', content: `Contexto atual (JSON): ${JSON.stringify(contexto)}` },
    ...estado.conversa.map((m) => ({ role: m.papel === 'vendedor' ? 'user' : 'assistant', content: m.texto })),
  ];
}

/* ════════════════════════════════════════════════════════════
   Loop principal — roda até pausar em "perguntar" ou terminar
   ════════════════════════════════════════════════════════════ */
async function rodarAgente({ estado, mensagemVendedor, imagens, vendedorId }) {
  if (mensagemVendedor) estado.conversa.push({ papel: 'vendedor', texto: mensagemVendedor });

  const categorias = await categoriasDisponiveis();
  const inicioMs = Date.now();

  while (true) {
    if (estado.orcamento.passos_usados >= MAX_PASSOS) return finalizarPorOrcamento(estado, 'passos');
    if (estado.orcamento.tokens_usados >= MAX_TOKENS) return finalizarPorOrcamento(estado, 'tokens');
    if (estado.orcamento.custo_usd_acumulado >= MAX_CUSTO_USD) return finalizarPorOrcamento(estado, 'custo');
    if (Date.now() - inicioMs >= MAX_TEMPO_MS) return finalizarPorOrcamento(estado, 'tempo');

    const { conteudo, usage } = await chamarLLMValidado(construirMensagensAgente(estado, categorias), validarAcaoLLM);
    registrarUso(estado, usage);
    estado.orcamento.passos_usados++;

    if (detectarLaco(estado, conteudo.acao)) return finalizarAbortoLaco(estado);

    if (conteudo.acao === 'perguntar') {
      estado.conversa.push({ papel: 'agente', texto: conteudo.pergunta });
      registrarTrajetoria(estado, conteudo);
      return { estado, mensagem_agente: conteudo.pergunta, status: 'aguardando_vendedor' };
    }

    if (conteudo.acao === 'consultar_preco') {
      const resultado = await consultarPrecoComparaveis(conteudo.consulta || {});
      estado.observacoes.ultima_consulta_preco = resultado;
      estado.observacoes.comparaveis_consultados = true;
      registrarTrajetoria(estado, conteudo, resultado);
      continue;
    }

    if (conteudo.acao === 'preencher_rascunho') {
      // "cep" nunca vem do LLM (fica de fora do schema do prompt) — o merge
      // preserva o valor já semeado a partir do perfil do vendedor.
      estado.rascunho = { ...estado.rascunho, ...conteudo.rascunho };
      estado.avaliacao = await avaliarRascunho(estado);
      registrarTrajetoria(estado, conteudo, estado.avaliacao);
      continue;
    }

    if (conteudo.acao === 'publicar') {
      if (!estado.avaliacao?.aprovado) {
        registrarTrajetoria(estado, conteudo, { bloqueado: 'sem_aprovacao' });
        continue; // o detector de laço cobre o caso do modelo insistir
      }
      if (!imagens || imagens.length === 0) {
        registrarTrajetoria(estado, conteudo, { bloqueado: 'sem_imagens' });
        const msg = 'Antes de publicar, anexe pelo menos 1 foto do produto ali no painel ao lado do chat.';
        estado.conversa.push({ papel: 'agente', texto: msg });
        return { estado, mensagem_agente: msg, status: 'aguardando_vendedor' };
      }
      const resultado = await publicarAnuncioNoBanco({ vendedorId, rascunho: estado.rascunho, imagens });
      if (resultado.erro) {
        registrarTrajetoria(estado, conteudo, resultado);
        continue; // deixa o modelo corrigir no próximo passo
      }
      estado.finalizado = true;
      registrarTrajetoria(estado, conteudo, { anuncio_id: resultado.anuncio.id });
      const msg = `Publicado! "${resultado.anuncio.titulo}" já está no ar.`;
      estado.conversa.push({ papel: 'agente', texto: msg });
      return { estado, mensagem_agente: msg, status: 'publicado', anuncio: resultado.anuncio };
    }

    if (conteudo.acao === 'registrar_indicio') {
      const registro = await registrarIndicioAvaria({ vendedorId, rascunho: estado.rascunho, indicio: conteudo.indicio });
      estado.observacoes.indicios_suspeitos.push(conteudo.indicio);
      estado.finalizado = true;
      registrarTrajetoria(estado, conteudo, { indicio_id: registro.id });
      const msg = 'Entendido — não vou publicar automaticamente. Encaminhei seu anúncio para revisão da nossa equipe.';
      estado.conversa.push({ papel: 'agente', texto: msg });
      return { estado, mensagem_agente: msg, status: 'indicio_registrado', indicio: registro };
    }

    if (conteudo.acao === 'concluir') {
      estado.finalizado = true;
      registrarTrajetoria(estado, conteudo);
      const msg = conteudo.mensagem_final || 'Conversa encerrada.';
      estado.conversa.push({ papel: 'agente', texto: msg });
      return { estado, mensagem_agente: msg, status: 'concluido' };
    }
  }
}

function finalizarPorOrcamento(estado, motivo) {
  estado.finalizado = true;
  registrarTrajetoria(estado, { acao: '_orcamento_estourado', motivo });
  const msg = 'Não consegui concluir o anúncio automaticamente dessa vez. Você pode preencher manualmente a partir daqui.';
  estado.conversa.push({ papel: 'agente', texto: msg });
  return { estado, mensagem_agente: msg, status: 'erro_orcamento' };
}

function finalizarAbortoLaco(estado) {
  estado.finalizado = true;
  registrarTrajetoria(estado, { acao: '_laco_detectado' });
  const msg = 'Tive dificuldade pra avançar sozinho — vamos terminar manualmente?';
  estado.conversa.push({ papel: 'agente', texto: msg });
  return { estado, mensagem_agente: msg, status: 'abortado_laco' };
}

module.exports = {
  rodarAgente,
  estadoInicial,
  consultarPrecoComparaveis,
  avaliarRascunho,
  publicarAnuncioNoBanco,
  registrarIndicioAvaria,
};
