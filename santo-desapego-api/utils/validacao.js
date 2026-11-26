// ============================================================
//  Validação de senha forte (RN03)
// ============================================================
// Minúsculas e sem acento: "Júlia" e "julia" contam como o mesmo nome
const semAcento = (texto) => String(texto || '')
  .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Cada parte do nome com 3 letras ou mais ("Ana", "Rui", "Clara" em
// "Ana Clara"). Partes de 1 ou 2 letras ("de", "da") são ignoradas.
const TAMANHO_MINIMO_NOME = 3;
const contemParteDoNome = (senhaNormalizada, nome) =>
  semAcento(nome).split(/[^a-z]+/)
    .filter((parte) => parte.length >= TAMANHO_MINIMO_NOME)
    .some((parte) => senhaNormalizada.includes(parte));

// Sequências óbvias com 4 caracteres ou mais:
// - crescentes ou decrescentes: 1234, 9876, abcd, dcba
// - o mesmo caractere repetido: 1111, aaaa
// - linhas do teclado: qwerty, asdf, zxcv
const TAMANHO_SEQUENCIA = 4;
const SEQUENCIAS_TECLADO = ['qwer', 'wert', 'erty', 'asdf', 'sdfg', 'zxcv', 'xcvb'];

const temSequenciaObvia = (senhaNormalizada) => {
  if (SEQUENCIAS_TECLADO.some((s) => senhaNormalizada.includes(s))) return true;

  const tipo = (c) => (/[0-9]/.test(c) ? 'numero' : /[a-z]/.test(c) ? 'letra' : null);
  let subindo = 1, descendo = 1, repetindo = 1;
  for (let i = 1; i < senhaNormalizada.length; i++) {
    const atual = senhaNormalizada[i], anterior = senhaNormalizada[i - 1];
    const mesmoTipo = tipo(atual) && tipo(atual) === tipo(anterior);
    const diferenca = atual.charCodeAt(0) - anterior.charCodeAt(0);
    subindo = mesmoTipo && diferenca === 1 ? subindo + 1 : 1;
    descendo = mesmoTipo && diferenca === -1 ? descendo + 1 : 1;
    repetindo = atual === anterior ? repetindo + 1 : 1;
    if (Math.max(subindo, descendo, repetindo) >= TAMANHO_SEQUENCIA) return true;
  }
  return false;
};

const validarSenhaForte = (senha, dadosUsuario = {}) => {
  if (senha.length < 8)
    return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(senha))
    return 'A senha deve conter pelo menos uma letra maiúscula.';
  if (!/[a-z]/.test(senha))
    return 'A senha deve conter pelo menos uma letra minúscula.';
  if (!/[0-9]/.test(senha))
    return 'A senha deve conter pelo menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha))
    return 'A senha deve conter pelo menos um caractere especial (ex: @, #, $, &).';

  const senhaNormalizada = semAcento(senha);
  if (contemParteDoNome(senhaNormalizada, dadosUsuario.nome))
    return 'A senha não pode conter seu nome.';
  if (contemParteDoNome(senhaNormalizada, dadosUsuario.sobrenome))
    return 'A senha não pode conter seu sobrenome.';
  if (temSequenciaObvia(senhaNormalizada))
    return 'A senha não pode conter sequências óbvias (ex: 1234, abcd, 1111, qwerty).';

  return null;
};

// ============================================================
//  RN01 — Validação de CEP de Santo Amaro
// ============================================================
const validarCEPSantoAmaro = (cep) => {
  const numeros = cep.replace(/\D/g, '');
  if (numeros.length !== 8) return false;
  const prefixo = parseInt(numeros.slice(0, 5));
  return prefixo >= 4600 && prefixo <= 4799;
};

// ============================================================
//  RF01 — CEP válido no cadastro e no perfil
//  8 dígitos (com ou sem hífen) e não pode ser uma repetição
//  (00000-000, 11111-111). Não bloqueia quem é de fora de Santo
//  Amaro: o RF01 só prioriza a região (a restrição é dos anúncios, RN01).
// ============================================================
const validarCEP = (cep) => {
  const numeros = String(cep ?? '').replace(/\D/g, '');
  if (!/^\d{5}-?\d{3}$/.test(String(cep ?? '').trim())) return false;
  return numeros.length === 8 && !/^(\d)\1+$/.test(numeros);
};

// ============================================================
//  Bloqueio de contato no chat antes da compra
//  (Fluxo de Operação: Visão da Administração)
//  Detecta e-mail e telefone para a negociação não sair da
//  plataforma antes do pagamento. Devolve 'email', 'telefone' ou null.
// ============================================================
const EMAIL_NO_TEXTO = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\barroba\b)\s*[a-z0-9-]+\s*(\.|\bponto\b)\s*[a-z]{2,}/i;

// Sequências de dígitos com separadores comuns: (11) 98765-4321, 11 9 8765 4321...
const TRECHOS_NUMERICOS = /\+?\d[\d\s().-]{6,}\d/g;

const pareceTelefone = (trecho) => {
  const digitos = trecho.replace(/\D/g, '');
  if (digitos.length >= 10 && digitos.length <= 13) return true;        // com DDD (e +55)
  if (digitos.length === 9 && digitos.startsWith('9')) return true;     // celular sem DDD
  return digitos.length === 8 && /^\d{4}[\s.-]\d{4}$/.test(trecho.trim()); // fixo 3333-4444 (CEP é 5-3)
};

const contemContatoPessoal = (texto) => {
  const conteudo = String(texto || '');
  if (EMAIL_NO_TEXTO.test(conteudo)) return 'email';
  const trechos = conteudo.match(TRECHOS_NUMERICOS) || [];
  if (trechos.some(pareceTelefone)) return 'telefone';
  return null;
};

// ============================================================
//  RN09 — Moderação de conteúdo (palavras proibidas)
// ============================================================
const PALAVRAS_PROIBIDAS = [
  'arma', 'armas', 'pistola', 'revolver', 'revólver', 'rifle', 'munição', 'municao',
  'fuzil', 'espingarda', 'cocaina', 'cocaína', 'maconha', 'crack', 'heroina', 'heroína',
  'lsd', 'ecstasy', 'arara-azul', 'mico-leao', 'jaguatirica', 'pornografia',
  'erotico', 'erótico', 'fetiche', 'cnh falsa', 'rg falso', 'diploma falso', 'documento falso',
];

const conteudoTemPalavrasProibidas = (texto) => {
  const textoLower = texto.toLowerCase();
  return PALAVRAS_PROIBIDAS.find((p) => {
    const regex = new RegExp(`\\b${p}\\b`, 'i');
    return regex.test(textoLower);
  });
};

// ============================================================
//  RN02 — CPF válido pelos dígitos verificadores
//  Mesma conta da tela de cadastro (Cadastro.jsx): a API também
//  precisa conferir, senão quem chama a API direto passa qualquer CPF.
// ============================================================
const validarCPF = (cpf) => {
  const numeros = String(cpf || '').replace(/\D/g, '');
  if (numeros.length !== 11) return false;
  if (/^(\d)\1+$/.test(numeros)) return false; // 111.111.111-11 e parecidos

  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(numeros[i]) * (tamanho + 1 - i);
    let digito = (soma * 10) % 11;
    if (digito === 10) digito = 0;
    if (digito !== Number(numeros[tamanho])) return false;
  }
  return true;
};

// ============================================================
//  RF27 / RN11 — Verificação de maioridade
//  Recebe a data no formato do campo de data do navegador (AAAA-MM-DD)
//  e calcula a idade exata: só passa quem já completou 18 anos.
//  Devolve a mensagem de erro ou null.
// ============================================================
const IDADE_MINIMA = 18;

const idadeEm = (ano, mes, dia, hoje) => {
  const [anoHoje, mesHoje, diaHoje] = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()];
  const jaFezAniversario = mesHoje > mes || (mesHoje === mes && diaHoje >= dia);
  return anoHoje - ano - (jaFezAniversario ? 0 : 1);
};

const validarDataNascimento = (valor, hoje = new Date()) => {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? '').trim());
  if (!partes) return 'Informe a data de nascimento completa (dia, mês e ano).';
  const [ano, mes, dia] = partes.slice(1).map(Number);

  // Data que existe no calendário (recusa 30/02, 31/04...)
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return 'Data de nascimento inválida.';
  }
  const idade = idadeEm(ano, mes, dia, hoje);
  if (ano < 1900 || idade < 0) return 'Data de nascimento inválida.';
  if (idade < IDADE_MINIMA) return 'É preciso ter 18 anos ou mais para se cadastrar no Santo Desapego.';
  return null;
};

module.exports = {
  validarSenhaForte, validarCEPSantoAmaro, conteudoTemPalavrasProibidas, validarCPF,
  validarDataNascimento, IDADE_MINIMA, validarCEP, contemContatoPessoal,
};
