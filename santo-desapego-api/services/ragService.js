/**
 * RAG das regras do Santo Desapego — porte do src/rag.py e da rota de dúvida
 * (src/nos_comuns.py: buscar_regras, responder_regras, recusar_sem_base) do
 * repositório agents-llm-senac-2026, pra este backend Node.
 *
 * - Corpus: rag/corpus/*.md (cópia de dados/corpus do repositório). Cada
 *   seção "##" vira um trecho, assim a regra e a exceção dela ficam juntas.
 *   Documento com `vigente: false` fica no índice, mas fora da busca.
 * - Índice: vetores do gemini-embedding-001 (768 dimensões) num JSON
 *   (rag/indice.json). É gerado na primeira busca e refeito sozinho quando o
 *   corpus muda (o arquivo guarda um hash do corpus). Com poucas dezenas de
 *   trechos, a busca por similaridade de cosseno é instantânea em memória.
 * - Busca: os k = 3 trechos mais próximos. Se o melhor ficar abaixo do limiar
 *   (0,67, calibrado no repositório), não há base: recusa sem chamar o modelo.
 * - Resposta: o modelo responde só com os trechos e cita os ids; o código
 *   confere se cada citação é de um trecho que veio da busca.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chamadaEstruturada, embeddings } = require('./llmClient');

const DIR_CORPUS = path.join(__dirname, '../rag/corpus');
const ARQ_INDICE = path.join(__dirname, '../rag/indice.json');
const RAG_K = 3;          // com k=1 a exceção do frete fica de fora (repositório: 13 de 13 com k=3)
const RAG_LIMIAR = 0.67;  // pior pergunta respondível: 0,698; melhor fora do corpus: 0,642

const PROMPT_RESPOSTA = fs.readFileSync(path.join(__dirname, '../prompts/resposta-regras.md'), 'utf8');

const SCHEMA_RESPOSTA = {
  type: 'object',
  properties: {
    resposta: { type: 'string' },
    citacoes: { type: 'array', items: { type: 'string' } },
    base_suficiente: { type: 'boolean' },
  },
  required: ['resposta', 'citacoes', 'base_suficiente'],
};
const validarResposta = (r) => (!r || typeof r.resposta !== 'string' || !Array.isArray(r.citacoes)
  || typeof r.base_suficiente !== 'boolean' ? '"resposta", "citacoes" e "base_suficiente" são obrigatórios' : null);

/* ── Corte do corpus ──────────────────────────────────────── */
function lerCabecalho(texto) {
  const m = texto.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of m[1].split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { meta, corpo: m[2] };
}

function cortarDocumento(arquivo) {
  const { meta, corpo } = lerCabecalho(fs.readFileSync(arquivo, 'utf8'));
  const docId = meta.id || path.basename(arquivo, '.md');
  const vigente = (meta.vigente || 'true').toLowerCase() === 'true';
  return `\n${corpo}`.split('\n## ').slice(1).map((bloco, i) => {
    const quebra = bloco.indexOf('\n');
    const secao = (quebra === -1 ? bloco : bloco.slice(0, quebra)).trim();
    const texto = (quebra === -1 ? '' : bloco.slice(quebra + 1)).split(/\s+/).join(' ').trim();
    return { id: `${docId}#${i + 1}`, doc_id: docId, titulo_doc: meta.titulo || docId, secao, texto, vigente };
  }).filter((t) => t.texto);
}

function lerCorpus() {
  const arquivos = fs.readdirSync(DIR_CORPUS).filter((a) => a.endsWith('.md')).sort();
  const hash = crypto.createHash('sha256');
  for (const a of arquivos) hash.update(a).update(fs.readFileSync(path.join(DIR_CORPUS, a)));
  return { trechos: arquivos.flatMap((a) => cortarDocumento(path.join(DIR_CORPUS, a))), hash: hash.digest('hex').slice(0, 16) };
}

/* ── Índice (gerado uma vez, refeito se o corpus mudar) ───── */
let indiceMemoria = null;
let indexando = null;

const normalizar = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return v.map((x) => x / n); };

async function garantirIndice() {
  if (indiceMemoria) return indiceMemoria;
  if (indexando) return indexando;
  indexando = (async () => {
    const { trechos, hash } = lerCorpus();
    let salvo = null;
    try { salvo = JSON.parse(fs.readFileSync(ARQ_INDICE, 'utf8')); } catch { /* ainda não existe */ }
    if (!salvo || salvo.hash_corpus !== hash) {
      const vetores = await embeddings(trechos.map((t) => `${t.titulo_doc} — ${t.secao}\n${t.texto}`));
      salvo = { hash_corpus: hash, gerado_em: new Date().toISOString(),
        trechos: trechos.map((t, i) => ({ ...t, vetor: normalizar(vetores[i]) })) };
      try { fs.writeFileSync(ARQ_INDICE, JSON.stringify(salvo)); } catch { /* sem permissão: fica só em memória */ }
    }
    indiceMemoria = salvo;
    return salvo;
  })();
  try { return await indexando; } finally { indexando = null; }
}

/* ── Busca + portão de suficiência ────────────────────────── */
async function buscar(pergunta, k = RAG_K) {
  const indice = await garantirIndice();
  const [vetor] = await embeddings([pergunta]);
  const q = normalizar(vetor);
  const recuperados = indice.trechos
    .filter((t) => t.vigente)
    .map((t) => ({ id: t.id, doc: t.titulo_doc, secao: t.secao, texto: t.texto,
      similaridade: Number(t.vetor.reduce((s, x, i) => s + x * q[i], 0).toFixed(4)) }))
    .sort((a, b) => b.similaridade - a.similaridade)
    .slice(0, k);
  const melhor = recuperados[0]?.similaridade || 0;
  return { pergunta, trechos: recuperados, melhor_similaridade: melhor, suficiente: melhor >= RAG_LIMIAR, limiar: RAG_LIMIAR, k };
}

// Só vale a citação de um trecho que foi de fato recuperado.
function verificarCitacoes(citadas, recuperados) {
  const ids = new Set(recuperados.map((t) => t.id));
  return { validas: citadas.filter((c) => ids.has(c)), invalidas: citadas.filter((c) => !ids.has(c)) };
}

/* ── Rota de dúvida: buscar -> (portão) -> responder citando ── */
async function responderDuvida(pergunta) {
  const busca = await buscar(pergunta);

  if (!busca.suficiente) {
    // Nada passou do limiar: recusa útil, sem chamar o modelo.
    const perto = busca.trechos.slice(0, 2).map((t) => t.secao);
    return {
      tipo: 'recusa',
      resposta: 'Não encontrei nenhuma regra do Santo Desapego sobre isso, então prefiro não chutar. '
        + `O mais perto que eu tenho é sobre: ${perto.join('; ')}. Para esse caso, a equipe responde pela Central de Ajuda.`,
      fontes: [],
      motivo: `melhor similaridade ${busca.melhor_similaridade.toFixed(3)} abaixo do limiar ${RAG_LIMIAR}`,
    };
  }

  const contexto = busca.trechos.map(({ id, secao, texto }) => ({ id, secao, texto }));
  const { conteudo } = await chamadaEstruturada({
    sistema: PROMPT_RESPOSTA,
    usuario: `PERGUNTA: ${pergunta}\n\nTRECHOS:\n${JSON.stringify(contexto, null, 1)}`,
    schema: SCHEMA_RESPOSTA,
    nomeSchema: 'resposta_regras',
    validar: validarResposta,
    maxTokens: 400,
  });

  const cit = verificarCitacoes(conteudo.citacoes, busca.trechos);
  const suficiente = conteudo.base_suficiente && cit.validas.length > 0;
  return {
    tipo: suficiente ? 'resposta' : 'recusa',
    resposta: conteudo.resposta,
    // A fonte mostrada é o trecho citado (e conferido), não toda a busca.
    fontes: suficiente
      ? busca.trechos.filter((t) => cit.validas.includes(t.id)).map(({ id, doc, secao, texto }) => ({ id, doc, secao, texto }))
      : [],
    motivo: suficiente ? 'resposta sustentada pelos trechos citados' : 'os trechos recuperados não respondem a pergunta',
    citacoes_invalidas: cit.invalidas,
  };
}

module.exports = { buscar, responderDuvida, verificarCitacoes, garantirIndice, cortarDocumento, RAG_LIMIAR };
