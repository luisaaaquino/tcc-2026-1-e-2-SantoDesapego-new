/**
 * Agente de Anúncio (IA) — "Agente B" do repositório agents-llm-senac-2026,
 * Parte 2 (src/nos_anuncio.py), portado de Python/LangGraph/SQLite pra este
 * backend Node/PostgreSQL. Conversa com o vendedor pra montar um anúncio
 * completo e honesto: faz emergir defeitos que ele não declara, sugere preço
 * pelo mercado local e nunca bloqueia sozinho.
 *
 * O laço: o modelo escolhe UMA ação por volta (perguntar, consultar_preco,
 * preencher_rascunho, registrar_indicio) -> ferramenta em código -> modelo,
 * até ter um rascunho que passe pelo portão de avaria (código) e pelo
 * avaliador (modelo + código).
 *
 * O modelo NÃO publica. Rascunho aprovado vira uma pendência pro vendedor
 * decidir (aprovar, editar ou desistir — `decidirPendencia`). Se o vendedor
 * recusou declarar um defeito, o indício vai pra moderação humana e nada é
 * publicado.
 *
 * Ficaram de fora do porte (dependem da infraestrutura do repositório):
 * consulta às regras (RAG), recusa de item proibido, triagem e memória de
 * longo prazo. As regras aprendidas (memória procedural) estão no prompt.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const { validarDadosAnuncio, inserirAnuncio } = require('./anuncioService');
const { chamadaEstruturada, estimarCustoUsd, anulavel, LLM_MODELO_AVALIADOR } = require('./llmClient');
const { categoriasDisponiveis } = require('./categoriasCache');

// Limites por anúncio (config.py do repositório)
const MAX_PASSOS = Number(process.env.AGENTE_MAX_PASSOS || 12);
const MAX_TOKENS = Number(process.env.AGENTE_MAX_TOKENS || 60000);
const MAX_CUSTO_USD = Number(process.env.AGENTE_MAX_CUSTO_USD || 0.02);
const MAX_MS_TURNO = Number(process.env.AGENTE_MAX_TEMPO_MS || 120000);
const MAX_RODADAS_AVALIADOR = 3;
const LACO_REPETICOES = 3;

const ler = (nome) => fs.readFileSync(path.join(__dirname, '../prompts', nome), 'utf8');
const PROMPT_AGENTE = ler('agente-anuncio.md');
const PROMPT_AVALIADOR = ler('avaliador-anuncio.md');
const PROMPT_ANUNCIO_RAPIDO = ler('anuncio-rapido.md');

const ACOES = ['perguntar', 'consultar_preco', 'preencher_rascunho', 'registrar_indicio'];
const ESTADOS_VALIDOS = ['novo', 'seminovo', 'usado', 'para-reparo'];
const CAMPOS_EDITAVEIS = ['titulo', 'descricao', 'preco', 'estado_conservacao'];
const PRECO_MAX = 50000;
const ESTADOS_SEM_AVARIA = ['novo', 'seminovo'];

/* ════════════════════════════════════════════════════════════
   Schemas (esquemas.py) + validação em código
   ════════════════════════════════════════════════════════════ */
const SCHEMA_RASCUNHO = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    categoria_id: { type: 'integer' },
    descricao: { type: 'string' },
    preco: { type: 'number' },
    estado_conservacao: { type: 'string', enum: ESTADOS_VALIDOS },
    avarias_declaradas: { type: 'array', items: { type: 'string' } },
  },
  required: ['titulo', 'categoria_id', 'descricao', 'preco', 'estado_conservacao', 'avarias_declaradas'],
};

const SCHEMA_DECISAO = {
  type: 'object',
  properties: {
    motivo: { type: 'string', description: 'uma frase: por que esta ação agora' },
    acao: { type: 'string', enum: ACOES },
    pergunta: anulavel({ type: 'string' }),
    consulta: anulavel({
      type: 'object',
      properties: { categoria_id: { type: 'integer' }, termo_busca: { type: 'string' } },
      required: ['categoria_id', 'termo_busca'],
    }),
    rascunho: anulavel(SCHEMA_RASCUNHO),
    indicio: anulavel({ type: 'string' }),
  },
  required: ['motivo', 'acao', 'pergunta', 'consulta', 'rascunho', 'indicio'],
};

const SCHEMA_AVALIACAO = {
  type: 'object',
  properties: {
    tem_titulo: { type: 'boolean' },
    tem_categoria: { type: 'boolean' },
    tem_descricao: { type: 'boolean' },
    estado_coerente: { type: 'boolean' },
    sem_invencao: { type: 'boolean' },
    aprovado: { type: 'boolean' },
    faltando: { type: 'array', items: { type: 'string' } },
  },
  required: ['tem_titulo', 'tem_categoria', 'tem_descricao', 'estado_coerente', 'sem_invencao', 'aprovado', 'faltando'],
};

const SCHEMA_RASCUNHO_RAPIDO = {
  type: 'object',
  properties: {
    titulo: anulavel({ type: 'string' }),
    categoria_id: anulavel({ type: 'integer' }),
    descricao: anulavel({ type: 'string' }),
    preco: anulavel({ type: 'number' }),
    estado_conservacao: anulavel({ type: 'string', enum: ESTADOS_VALIDOS }),
    termo_busca: anulavel({ type: 'string' }),
  },
  required: ['titulo', 'categoria_id', 'descricao', 'preco', 'estado_conservacao', 'termo_busca'],
};

function validarDecisao(d) {
  if (!d || typeof d !== 'object') return 'não é um objeto';
  if (!ACOES.includes(d.acao)) return `"acao" inválida (esperado um de: ${ACOES.join(', ')})`;
  if (d.acao === 'perguntar' && !d.pergunta) return '"pergunta" é obrigatória quando acao="perguntar"';
  if (d.acao === 'consultar_preco' && !d.consulta?.categoria_id) return '"consulta.categoria_id" é obrigatório quando acao="consultar_preco"';
  if (d.acao === 'registrar_indicio' && !d.indicio) return '"indicio" é obrigatório quando acao="registrar_indicio"';
  if (d.rascunho?.estado_conservacao && !ESTADOS_VALIDOS.includes(d.rascunho.estado_conservacao)) return '"rascunho.estado_conservacao" inválido';
  return null;
}

function validarAvaliacao(a) {
  if (!a || typeof a !== 'object') return 'não é um objeto';
  for (const c of ['tem_titulo', 'tem_categoria', 'tem_descricao', 'estado_coerente', 'sem_invencao', 'aprovado']) {
    if (typeof a[c] !== 'boolean') return `"${c}" precisa ser booleano`;
  }
  if (!Array.isArray(a.faltando)) return '"faltando" precisa ser um array';
  return null;
}

function validarRascunhoRapido(c) {
  if (!c || typeof c !== 'object') return 'não é um objeto';
  if (c.estado_conservacao != null && !ESTADOS_VALIDOS.includes(c.estado_conservacao)) return '"estado_conservacao" inválido';
  return null;
}

/* ════════════════════════════════════════════════════════════
   O que a conversa diz sobre avaria (recalculado, não guardado)
   ════════════════════════════════════════════════════════════ */
const NEGA = /\b(sem (nenhum )?(defeito|problema|avaria)s?|nenhum (defeito|problema)|n[ãa]o tem (nenhum )?(defeito|problema)|tudo funcionando|funciona (bem|perfeit\w*|100))/gi;
// Só termos claros de defeito. Palavras como "barulho" ou "mancha" sozinhas
// davam falso positivo (ex.: brinquedo que "faz barulho").
const MENCIONA = /\b(defeito|avaria|quebrad\w*|rachad\w*|rachadura|trincad\w*|amassad\w*|riscad\w*|rasgad\w*|vaza\w*|n[ãa]o (gela|congela|funciona|liga|acende|esquenta)|demora\w* (pra|para) (gelar|congelar|esquentar|ligar)|barulho estranho|s[óo] n[ãa]o (gela|congela|funciona|liga|acende|esquenta))\b/i;
const PERGUNTA_AVARIA = /\b(defeito|avaria|problema|funciona|risco|amassad|quebr|rachad|estado)/i;

function avariaDaConversa(estado) {
  const msgs = estado.conversa;
  const perguntada = msgs.some((m) => m.papel === 'agente' && PERGUNTA_AVARIA.test(m.texto));
  let negouDefeito = false;
  const falas = [];
  for (const m of msgs) {
    if (m.papel !== 'vendedor') continue;
    if (MENCIONA.test(m.texto.replace(NEGA, ''))) falas.push(m.texto);
    else if (new RegExp(NEGA.source, 'i').test(m.texto)) negouDefeito = true;
  }
  return { perguntada, negou_defeito: negouDefeito, mencionada: falas.length > 0, falas,
    tratada: perguntada || negouDefeito || falas.length > 0 };
}

function precoPedido(estado) {
  for (const m of estado.conversa) {
    if (m.papel !== 'vendedor') continue;
    const achou = m.texto.match(/(?:R\$\s*)?(\d{2,5})(?:[.,]\d{2})?\s*(?:reais|conto|pila)?/i);
    if (achou) return Number(achou[1]);
  }
  return null;
}

function faixaValida(faixa) {
  return faixa && !faixa.erro && faixa.faixa_max != null;
}

function vendedorAvisado(estado, faixa) {
  const marca = String(Math.trunc(faixa.faixa_max));
  return estado.conversa.some((m) => m.papel === 'agente' && m.texto.includes(marca));
}

const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/* ════════════════════════════════════════════════════════════
   Ferramenta — consultar preço de comparáveis (banco real)
   Cascata: categoria+termo+bairro → categoria+termo (cidade toda)
   → só categoria. Para na primeira tentativa com ≥3 resultados.
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
    const { rows } = await pool.query(`SELECT id, titulo, preco FROM anuncios WHERE ${where}`, params);
    if (rows.length >= 3) {
      const precos = rows.map((r) => Number(r.preco)).sort((a, b) => a - b);
      // Anúncios reais pra pessoa comparar (cards clicáveis no chat); até 5, do mais barato.
      const comparaveis = [...rows]
        .sort((a, b) => Number(a.preco) - Number(b.preco))
        .slice(0, 5)
        .map((r) => ({ id: r.id, titulo: r.titulo, preco: Number(r.preco) }));
      return {
        categoria_id, termo_busca: termo, bairro,
        precisao: t.usarBairro ? 'bairro_e_termo' : (t.usarTermo ? 'cidade_e_termo' : 'categoria_ampla'),
        n: precos.length,
        faixa_min: precos[0],
        faixa_max: precos[precos.length - 1],
        media: Number((precos.reduce((a, b) => a + b, 0) / precos.length).toFixed(2)),
        comparaveis,
      };
    }
  }
  return { erro: 'sem_comparaveis', categoria_id, termo_busca: termo, bairro };
}

/* ════════════════════════════════════════════════════════════
   Escritas (publicar / registrar indício)
   ════════════════════════════════════════════════════════════ */
async function publicarAnuncioNoBanco({ vendedorId, rascunho, imagens }) {
  const dados = {
    titulo: rascunho.titulo,
    descricao: rascunho.descricao,
    preco: rascunho.preco,
    estado_conservacao: rascunho.estado_conservacao,
    categoria_id: rascunho.categoria_id,
    cep: rascunho.cep,
    bairro: rascunho.bairro,
    imagens,
  };
  const erro = await validarDadosAnuncio(dados);
  if (erro) return { erro };
  const anuncio = await inserirAnuncio({ vendedorId, ...dados });
  return { anuncio };
}

async function registrarIndicioAvaria({ vendedorId, rascunho, indicio }) {
  const { rows } = await pool.query(
    `INSERT INTO indicios_moderacao (vendedor_id, rascunho, indicio, status)
     VALUES ($1, $2, $3, 'pendente') RETURNING id, status, data_criacao`,
    [vendedorId, JSON.stringify(rascunho), indicio]
  );
  return rows[0];
}

/* ════════════════════════════════════════════════════════════
   Estado, orçamento, laço, trajetória
   ════════════════════════════════════════════════════════════ */
async function estadoInicial({ cep, bairro }) {
  return {
    versao: 2,
    conversa: [],
    perfil: { cep: cep || null, bairro: bairro || null },
    rascunho: null,
    faixa_preco: null,
    avaliacao: null,
    indicio: null,           // { texto, fala_literal } — o vendedor recusou declarar
    rodadas_avaliador: 0,
    pergunta_portao: null,
    pendencia: null,         // aprovação do vendedor (rascunho aprovado pelo avaliador)
    orcamento: { passos_usados: 0, tokens_usados: 0, custo_usd_acumulado: 0 },
    trajetoria: [],
    status: 'aguardando_vendedor',
    finalizado: false,
  };
}

function registrarUso(estado, uso) {
  if (!uso) return;
  estado.orcamento.tokens_usados += (uso.tokens_entrada || 0) + (uso.tokens_saida || 0);
  estado.orcamento.custo_usd_acumulado += estimarCustoUsd(uso);
}

function passo(estado, etapa, dados = {}) {
  estado.trajetoria.push({ etapa, passo: estado.orcamento.passos_usados, ...dados, em: new Date().toISOString() });
}

function checarOrcamento(estado, inicioMs) {
  const o = estado.orcamento;
  if (o.passos_usados >= MAX_PASSOS) return `passos: ${MAX_PASSOS} decisões do modelo neste anúncio`;
  if (o.tokens_usados >= MAX_TOKENS) return `tokens: ${MAX_TOKENS}`;
  if (o.custo_usd_acumulado >= MAX_CUSTO_USD) return `custo: US$ ${MAX_CUSTO_USD}`;
  if (Date.now() - inicioMs >= MAX_MS_TURNO) return `tempo: ${MAX_MS_TURNO / 1000}s no turno`;
  return null;
}

// A mesma ação com os mesmos argumentos N (LACO_REPETICOES) vezes seguidas = laço.
function assinatura(d) {
  const chave = { acao: d.acao, consulta: d.consulta || null, indicio: d.indicio || null };
  if (d.acao === 'preencher_rascunho') chave.rascunho = d.rascunho || null;
  return crypto.createHash('sha256').update(JSON.stringify(chave)).digest('hex').slice(0, 12);
}

// A decisão atual já está na trajetória quando isto é chamado (ver rodarAgente),
// então as N últimas incluem ela. Antes contava N-1 e parava na 2ª repetição.
function detectarLaco(estado, ass) {
  const decisoes = estado.trajetoria.filter((p) => p.etapa === 'agente' && p.assinatura).map((p) => p.assinatura);
  const ultimas = decisoes.slice(-LACO_REPETICOES);
  return ultimas.length === LACO_REPETICOES && ultimas.every((a) => a === ass);
}

/* ════════════════════════════════════════════════════════════
   Agente — o modelo escolhe a próxima ação
   ════════════════════════════════════════════════════════════ */
async function decidir(estado, categorias) {
  const avaria = avariaDaConversa(estado);
  // Corte do histórico: as 10 últimas falas + as mais antigas que falam de avaria.
  const recentes = estado.conversa.slice(-10);
  const antigasAvaria = estado.conversa.slice(0, -10).filter((m) => avaria.falas.includes(m.texto));
  const contexto = {
    conversa: [...antigasAvaria, ...recentes].map((m) => `${m.papel}: ${m.texto}`),
    bairro_do_vendedor: estado.perfil.bairro,
    observacoes: {
      faixa_de_preco: estado.faixa_preco
        ? (({ comparaveis, ...resto }) => resto)(estado.faixa_preco) : null,
      ultima_avaliacao: estado.avaliacao,
      indicio_registrado: estado.indicio
        ? { ...estado.indicio, situacao: 'JÁ REGISTRADO para a moderação — não registre de novo; monte o rascunho sem esse defeito' }
        : null,
    },
    rascunho_atual: estado.rascunho,
    sobre_avaria: { perguntada: avaria.perguntada, negou_defeito: avaria.negou_defeito, mencionada: avaria.mencionada },
    categorias_disponiveis: categorias,
  };
  const { conteudo, uso } = await chamadaEstruturada({
    sistema: PROMPT_AGENTE,
    usuario: JSON.stringify(contexto),
    schema: SCHEMA_DECISAO,
    nomeSchema: 'decisao_anuncio',
    validar: (d) => validarDecisao(d) || validarCategoria(d, categorias),
  });
  registrarUso(estado, uso);
  estado.orcamento.passos_usados++;
  return conteudo;
}

function validarCategoria(d, categorias) {
  const ids = new Set(categorias.map((c) => c.id));
  const id = d.rascunho?.categoria_id ?? d.consulta?.categoria_id;
  if (id != null && !ids.has(id)) return `categoria_id ${id} não está em categorias_disponiveis`;
  return null;
}

/* ════════════════════════════════════════════════════════════
   Avaliador — o modelo julga o texto; o código confere preço e
   avaria mencionada e recalcula `aprovado`
   ════════════════════════════════════════════════════════════ */
function checarPreco(rascunho, faixa, estado) {
  if (!faixaValida(faixa)) return null; // sem comparáveis: nada contra o que comparar
  const preco = Number(rascunho.preco);
  if (faixa.faixa_min * 0.7 <= preco && preco <= faixa.faixa_max * 1.15) return null;
  if (vendedorAvisado(estado, faixa)) return null; // avisado e manteve: a decisão é dele
  return `preco: ${reais(preco)} está fora da faixa ${reais(faixa.faixa_min)}–${reais(faixa.faixa_max)}; avise o vendedor da faixa antes de seguir`;
}

async function avaliar(estado, categorias) {
  const r = estado.rascunho;
  const nomeCategoria = categorias.find((c) => c.id === r.categoria_id);
  const { conteudo: aval, uso } = await chamadaEstruturada({
    sistema: PROMPT_AVALIADOR,
    usuario: JSON.stringify({
      rascunho: { ...r, categoria: nomeCategoria ? `${nomeCategoria.categoria_pai} > ${nomeCategoria.nome}` : null },
      conversa: estado.conversa.map((m) => `${m.papel}: ${m.texto}`),
      indicio_registrado: estado.indicio?.texto || null,
    }),
    schema: SCHEMA_AVALIACAO,
    nomeSchema: 'avaliacao',
    validar: validarAvaliacao,
    modelo: LLM_MODELO_AVALIADOR,
    maxTokens: 400,
  });
  registrarUso(estado, uso);

  const faltando = [...aval.faltando];
  const criteriosModelo = aval.tem_titulo && aval.tem_categoria && aval.tem_descricao && aval.estado_coerente && aval.sem_invencao;
  const erroPreco = checarPreco(r, estado.faixa_preco, estado);
  if (erroPreco) faltando.push(erroPreco);
  const avaria = avariaDaConversa(estado);
  const avariaEscondida = avaria.mencionada && !(r.avarias_declaradas || []).length && !estado.indicio;
  if (avariaEscondida) {
    faltando.push('avaria: o vendedor mencionou um defeito que não está no rascunho — declare-o, ou registre o indício se ele recusou');
  }
  const aprovado = criteriosModelo && !erroPreco && !avariaEscondida;
  estado.avaliacao = { ...aval, aprovado, faltando, aprovado_pelo_modelo: aval.aprovado };
  estado.rodadas_avaliador++;
  passo(estado, 'avaliador', { aprovado_final: aprovado, checagens_codigo: { preco: erroPreco, avaria_escondida: avariaEscondida } });
}

/* ════════════════════════════════════════════════════════════
   Saídas do turno
   ════════════════════════════════════════════════════════════ */
function perguntar(estado, texto, origem) {
  estado.conversa.push({ papel: 'agente', texto });
  estado.status = 'aguardando_vendedor';
  passo(estado, 'perguntar', { origem });
  return { estado, mensagem_agente: texto, status: 'aguardando_vendedor' };
}

const MENSAGENS_FINAIS = {
  orcamento: 'Não consegui fechar o anúncio dentro do limite desta conversa. Você pode completar pelo formulário manual.',
  avaliador_reprovou: 'O rascunho não passou na checagem depois de 3 tentativas. Você pode completar pelo formulário manual.',
  laco: 'Fiquei repetindo o mesmo passo sem avançar, então parei. Você pode completar pelo formulário manual.',
  rejeitado: 'Tudo bem, não publiquei. Se mudar de ideia, é só começar de novo.',
};

function finalizar(estado, desfecho, motivo, extra = {}) {
  estado.finalizado = true;
  estado.status = desfecho;
  estado.pendencia = null;
  const texto = extra.mensagem || MENSAGENS_FINAIS[desfecho];
  estado.conversa.push({ papel: 'agente', texto });
  passo(estado, 'finalizar', { desfecho, motivo });
  return { estado, mensagem_agente: texto, status: desfecho, ...extra.retorno };
}

// Ponto de parada: o vendedor confirma a publicação (aprovar, editar ou desistir)
function prepararAprovacao(estado) {
  const r = estado.rascunho;
  estado.pendencia = {
    tipo: 'aprovacao_vendedor',
    acao: 'publicar_anuncio',
    argumentos: r,
    consequencia: `O anúncio "${r.titulo}" por ${reais(r.preco)} fica visível para os compradores da região, `
      + `com retirada em ${r.bairro || 'seu bairro'}. Você pode pausar ou editar depois.`,
    opcoes: { aprovar: {}, editar: { campos: CAMPOS_EDITAVEIS }, rejeitar: {} },
  };
  estado.status = 'aguardando_aprovacao';
  const texto = `Confere antes de publicar? ${estado.pendencia.consequencia} Você pode aprovar, editar algum campo ou desistir.`;
  estado.conversa.push({ papel: 'agente', texto });
  passo(estado, 'preparar_aprovacao');
  return { estado, mensagem_agente: texto, status: 'aguardando_aprovacao' };
}

/* ════════════════════════════════════════════════════════════
   Turno — roda o laço até pausar (pergunta ou aprovação) ou terminar
   ════════════════════════════════════════════════════════════ */
async function rodarAgente({ estado, mensagemVendedor, vendedorId }) {
  // Conversa parada esperando a decisão do vendedor: texto livre não mexe
  // no rascunho — a decisão vem pelos botões (decidirPendencia).
  if (estado.status === 'aguardando_aprovacao' && estado.pendencia) {
    if (mensagemVendedor) estado.conversa.push({ papel: 'vendedor', texto: mensagemVendedor });
    const texto = 'O rascunho está esperando sua decisão: use os botões para aprovar, editar algum campo ou desistir.';
    estado.conversa.push({ papel: 'agente', texto });
    return { estado, mensagem_agente: texto, status: 'aguardando_aprovacao' };
  }

  if (mensagemVendedor) estado.conversa.push({ papel: 'vendedor', texto: mensagemVendedor });
  const categorias = await categoriasDisponiveis();
  const inicioMs = Date.now();

  while (true) {
    const estouro = checarOrcamento(estado, inicioMs);
    if (estouro) return finalizar(estado, 'orcamento', estouro);

    const d = await decidir(estado, categorias);
    const ass = assinatura(d);
    passo(estado, 'agente', { acao: d.acao, motivo: d.motivo, assinatura: ass });
    if (detectarLaco(estado, ass)) {
      return finalizar(estado, 'laco', `a ação '${d.acao}' com os mesmos argumentos ${LACO_REPETICOES}x seguidas`);
    }

    if (d.acao === 'perguntar') {
      return perguntar(estado, d.pergunta || 'Pode me contar um pouco mais sobre o produto?', 'modelo');
    }

    if (d.acao === 'consultar_preco') {
      const args = { categoria_id: d.consulta.categoria_id, termo_busca: d.consulta.termo_busca || '' };
      const anterior = estado.faixa_preco;
      if (anterior && anterior.categoria_id === args.categoria_id) {
        // Consulta repetida não vai ao banco. Se o preço pedido está fora da
        // faixa e o vendedor ainda não foi avisado, o código pergunta.
        const pedido = precoPedido(estado);
        const fora = faixaValida(anterior) && pedido != null
          && !(anterior.faixa_min * 0.7 <= pedido && pedido <= anterior.faixa_max * 1.15);
        if (fora && !vendedorAvisado(estado, anterior)) {
          const pergunta = `Pelo mercado aqui na região, anúncios parecidos saem entre ${reais(anterior.faixa_min)} `
            + `e ${reais(anterior.faixa_max)}. Você pediu ${reais(pedido)}: quer manter esse valor ou ajustar? A decisão é sua.`;
          passo(estado, 'ferramenta_preco', { argumentos: args, repetida: true, acao_do_codigo: 'avisar a faixa ao vendedor' });
          return perguntar(estado, pergunta, 'portao_preco');
        }
        passo(estado, 'ferramenta_preco', { argumentos: args, repetida: true });
        continue;
      }
      estado.faixa_preco = await consultarPrecoComparaveis({ ...args, bairro: estado.perfil.bairro });
      passo(estado, 'ferramenta_preco', { argumentos: args, resultado: estado.faixa_preco.erro || `${estado.faixa_preco.n} comparáveis` });
      continue;
    }

    if (d.acao === 'registrar_indicio') {
      const falas = avariaDaConversa(estado).falas;
      if (!falas.length) {
        // O indício só vale se vier de uma fala do vendedor nesta conversa.
        estado.avaliacao = { aprovado: false, faltando: [
          'indicio: recusado pelo código — nenhuma fala do vendedor nesta conversa menciona defeito'] };
        passo(estado, 'registrar_indicio', { recusado: 'sem fala do vendedor que mencione defeito' });
        continue;
      }
      estado.indicio = { texto: d.indicio, fala_literal: falas[falas.length - 1] };
      passo(estado, 'registrar_indicio', { indicio: d.indicio });
      continue; // volta ao laço pra terminar o rascunho sem o defeito
    }

    // preencher_rascunho
    if (!d.rascunho) {
      estado.avaliacao = { aprovado: false, faltando: ['rascunho: a ação preencher_rascunho veio sem o rascunho'] };
      passo(estado, 'portao_avaria', { passou: false, erro: 'rascunho_ausente' });
      continue;
    }
    // Portão (código): o rascunho só segue se a conversa já tratou de avaria.
    const avaria = avariaDaConversa(estado);
    if (!avaria.tratada) {
      passo(estado, 'portao_avaria', { passou: false });
      return perguntar(estado, 'Antes de montar o anúncio: o produto tem algum defeito, risco ou algo que não '
        + 'funciona 100%? Declarar evita problema na hora da entrega.', 'portao_avaria');
    }
    passo(estado, 'portao_avaria', { passou: true });
    // cep/bairro nunca vêm do modelo — sempre do perfil do vendedor.
    estado.rascunho = { ...d.rascunho, cep: estado.perfil.cep, bairro: estado.perfil.bairro };
    await avaliar(estado, categorias);

    if (estado.avaliacao.aprovado) {
      if (estado.indicio) {
        // O vendedor recusou declarar um defeito: vai pra moderação, não publica.
        const registro = await registrarIndicioAvaria({
          vendedorId, rascunho: estado.rascunho,
          indicio: `${estado.indicio.texto} (fala do vendedor: "${estado.indicio.fala_literal}")`,
        });
        return finalizar(estado, 'indicio_registrado', 'indício de avaria para a moderação', {
          mensagem: 'Entendido — não vou publicar automaticamente. Encaminhei seu anúncio para revisão da nossa equipe.',
          retorno: { indicio: registro },
        });
      }
      return prepararAprovacao(estado);
    }
    if (estado.rodadas_avaliador >= MAX_RODADAS_AVALIADOR) {
      return finalizar(estado, 'avaliador_reprovou', `avaliador reprovou ${estado.rodadas_avaliador}x: ${estado.avaliacao.faltando.join('; ')}`);
    }
  }
}

/* ════════════════════════════════════════════════════════════
   Controle C3 (repositório v3.0.0, aplicar_edicoes): valida as
   edições do vendedor na aprovação. A edição não passa de novo pelo
   portão nem pelo avaliador, então as regras ficam aqui: estado da
   lista, preço positivo e com teto, e o defeito declarado na conversa
   não sai do anúncio (nem pelo estado, nem apagando da descrição).
   Edição que não passa é ignorada e o motivo vai pro vendedor.
   ════════════════════════════════════════════════════════════ */
const NOMES_CAMPOS = { titulo: 'título', descricao: 'descrição', preco: 'preço', estado_conservacao: 'estado' };

function aplicarEdicoes(rascunhoOriginal, campos) {
  const rascunho = { ...rascunhoOriginal };
  const ignoradas = {};
  const avarias = (rascunhoOriginal.avarias_declaradas || []).filter(Boolean);
  for (const [campo, valor] of Object.entries(campos)) {
    if (!CAMPOS_EDITAVEIS.includes(campo) || valor === null || valor === '') {
      ignoradas[campo] = 'campo não editável ou vazio';
    } else if (campo === 'preco') {
      const preco = Number(valor);
      if (!Number.isFinite(preco)) ignoradas[campo] = `valor inválido: ${valor}`;
      else if (!(preco > 0 && preco <= PRECO_MAX)) ignoradas[campo] = `precisa ser maior que zero e até ${reais(PRECO_MAX)}`;
      else rascunho.preco = preco;
    } else if (campo === 'estado_conservacao') {
      if (!ESTADOS_VALIDOS.includes(valor)) ignoradas[campo] = `estado fora da lista: ${valor}`;
      else if (avarias.length && ESTADOS_SEM_AVARIA.includes(valor)) ignoradas[campo] = `"${valor}" não combina com o defeito declarado (${avarias.join('; ')})`;
      else rascunho.estado_conservacao = valor;
    } else {
      rascunho[campo] = String(valor);
    }
  }
  // O defeito declarado fica no anúncio mesmo que a descrição editada o apague.
  const editouDescricao = 'descricao' in campos && !('descricao' in ignoradas);
  const faltam = editouDescricao
    ? avarias.filter((a) => !rascunho.descricao.toLowerCase().includes(a.toLowerCase()))
    : [];
  if (faltam.length) rascunho.descricao = `${rascunho.descricao.trimEnd()} Defeito declarado: ${faltam.join('; ')}.`;
  return { rascunho, ignoradas };
}

/* ════════════════════════════════════════════════════════════
   Decisão do vendedor sobre a pendência (aprovar / editar / rejeitar)
   Idempotente: se já publicou, devolve o mesmo anúncio.
   ════════════════════════════════════════════════════════════ */
async function decidirPendencia({ estado, acao, campos, imagens, vendedorId }) {
  if (estado.status === 'publicado' && estado.anuncio_publicado) {
    return { estado, mensagem_agente: estado.conversa[estado.conversa.length - 1]?.texto, status: 'publicado', anuncio: estado.anuncio_publicado };
  }
  if (estado.status !== 'aguardando_aprovacao' || !estado.pendencia) {
    return { erro: 'Não há nenhum rascunho esperando sua decisão nesta conversa.' };
  }
  if (acao === 'rejeitar') {
    passo(estado, 'aprovacao_vendedor', { decide: 'humano', acao });
    return finalizar(estado, 'rejeitado', 'o vendedor desistiu');
  }
  if (acao !== 'aprovar' && acao !== 'editar') return { erro: 'Ação inválida.' };

  const { rascunho, ignoradas } = aplicarEdicoes(estado.rascunho, campos || {});
  const resultado = await publicarAnuncioNoBanco({ vendedorId, rascunho, imagens });
  if (resultado.erro) {
    // Ex.: falta foto — a pendência continua aberta pra pessoa corrigir.
    passo(estado, 'publicar', { erro: resultado.erro });
    return { estado, erro: resultado.erro, status: 'aguardando_aprovacao' };
  }
  estado.rascunho = rascunho;
  estado.anuncio_publicado = { id: resultado.anuncio.id, titulo: resultado.anuncio.titulo };
  passo(estado, 'aprovacao_vendedor', { decide: 'humano', acao, edicoes_ignoradas: ignoradas });
  // Edição recusada não fica em silêncio: o vendedor fica sabendo o que não mudou e por quê
  const avisoEdicoes = Object.keys(ignoradas).length
    ? ` Algumas alterações não foram aplicadas: ${Object.entries(ignoradas).map(([c, m]) => `${NOMES_CAMPOS[c] || c} (${m})`).join('; ')}.`
    : '';
  return finalizar(estado, 'publicado', 'aprovado pelo vendedor', {
    mensagem: `Pronto! "${resultado.anuncio.titulo}" está no ar por ${reais(rascunho.preco)}.${avisoEdicoes}`,
    retorno: { anuncio: resultado.anuncio, edicoes_ignoradas: avisoEdicoes ? ignoradas : null },
  });
}

/* ════════════════════════════════════════════════════════════
   "Anúncio rápido" — uma mensagem vira um rascunho revisável, sem
   ida-e-volta. Quem publica é a pessoa, no formulário manual (não há
   publicação aqui). Usa o mesmo avaliador (modelo + código) do chat.
   ════════════════════════════════════════════════════════════ */
async function gerarRascunhoRapido({ mensagem, cep, bairro }) {
  const categorias = await categoriasDisponiveis();
  const ids = new Set(categorias.map((c) => c.id));
  const { conteudo, uso } = await chamadaEstruturada({
    sistema: PROMPT_ANUNCIO_RAPIDO,
    usuario: JSON.stringify({ mensagem, categorias_disponiveis: categorias }),
    schema: SCHEMA_RASCUNHO_RAPIDO,
    nomeSchema: 'rascunho_rapido',
    validar: validarRascunhoRapido,
  });

  const rascunho = {
    titulo: conteudo.titulo || null,
    categoria_id: ids.has(conteudo.categoria_id) ? conteudo.categoria_id : null,
    descricao: conteudo.descricao || null,
    preco: conteudo.preco || null,
    estado_conservacao: conteudo.estado_conservacao || null,
    avarias_declaradas: [],
    bairro: bairro || null,
    cep: cep || null,
  };

  const estado = await estadoInicial({ cep, bairro });
  estado.conversa.push({ papel: 'vendedor', texto: mensagem });
  estado.rascunho = rascunho;
  registrarUso(estado, uso);
  if (rascunho.categoria_id) {
    estado.faixa_preco = await consultarPrecoComparaveis({
      categoria_id: rascunho.categoria_id, termo_busca: conteudo.termo_busca, bairro,
    });
  }
  // O avaliador é consultivo aqui (a pessoa revisa tudo no formulário).
  if (rascunho.titulo && rascunho.categoria_id && rascunho.descricao && rascunho.preco && rascunho.estado_conservacao) {
    await avaliar(estado, categorias);
  }

  return {
    rascunho,
    observacao_preco: estado.faixa_preco,
    avaliacao: estado.avaliacao,
    custo_estimado_usd: estado.orcamento.custo_usd_acumulado,
  };
}

module.exports = {
  rodarAgente,
  decidirPendencia,
  estadoInicial,
  consultarPrecoComparaveis,
  gerarRascunhoRapido,
  // expostos pra teste
  aplicarEdicoes,
  avariaDaConversa,
  checarPreco,
};
