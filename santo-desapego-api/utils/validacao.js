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

module.exports = { validarSenhaForte, validarCEPSantoAmaro, conteudoTemPalavrasProibidas };
