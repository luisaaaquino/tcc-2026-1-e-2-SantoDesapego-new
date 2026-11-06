// ============================================================
//  Validação de senha forte (RN03)
// ============================================================
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

  const senhaLower = senha.toLowerCase();
  if (dadosUsuario.nome && dadosUsuario.nome.length >= 4 &&
      senhaLower.includes(dadosUsuario.nome.toLowerCase()))
    return 'A senha não pode conter seu nome.';
  if (dadosUsuario.sobrenome && dadosUsuario.sobrenome.length >= 4 &&
      senhaLower.includes(dadosUsuario.sobrenome.toLowerCase()))
    return 'A senha não pode conter seu sobrenome.';
  if (/123456|654321|111111|000000|abcdef/.test(senhaLower))
    return 'A senha não pode conter sequências óbvias (ex: 123456).';

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
  validarDataNascimento, IDADE_MINIMA,
};
