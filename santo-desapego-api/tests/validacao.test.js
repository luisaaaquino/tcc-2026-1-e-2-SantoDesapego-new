const {
  validarCEPSantoAmaro, validarSenhaForte, conteudoTemPalavrasProibidas,
} = require('../utils/validacao');

describe('RN01 - Restrição Geográfica de Anúncios', () => {
  test('aceita CEP no início da faixa (04600-000)', () => {
    expect(validarCEPSantoAmaro('04600-000')).toBe(true);
  });

  test('aceita CEP no fim da faixa (04799-999)', () => {
    expect(validarCEPSantoAmaro('04799-999')).toBe(true);
  });

  test('aceita CEP de Santo Amaro digitado sem hífen', () => {
    expect(validarCEPSantoAmaro('04710150')).toBe(true);
  });

  test('bloqueia CEP logo abaixo da faixa (04599-999)', () => {
    expect(validarCEPSantoAmaro('04599-999')).toBe(false);
  });

  test('bloqueia CEP logo acima da faixa (04800-000)', () => {
    expect(validarCEPSantoAmaro('04800-000')).toBe(false);
  });

  test('bloqueia CEP de outra região (Centro de SP, 01001-000)', () => {
    expect(validarCEPSantoAmaro('01001-000')).toBe(false);
  });

  test('bloqueia CEP incompleto', () => {
    expect(validarCEPSantoAmaro('0460')).toBe(false);
  });
});

describe('RN03 - Política de Senhas Robustas', () => {
  const usuario = { nome: 'Mariana', sobrenome: 'Ferreira' };

  test('aceita senha que cumpre todos os critérios', () => {
    expect(validarSenhaForte('Desapego@2026', usuario)).toBeNull();
  });

  test('recusa senha com menos de 8 caracteres', () => {
    expect(validarSenhaForte('Ab1@xyz', usuario)).toMatch(/8 caracteres/);
  });

  test('recusa senha sem letra maiúscula', () => {
    expect(validarSenhaForte('desapego@2026', usuario)).toMatch(/maiúscula/);
  });

  test('recusa senha sem letra minúscula', () => {
    expect(validarSenhaForte('DESAPEGO@2026', usuario)).toMatch(/minúscula/);
  });

  test('recusa senha sem número', () => {
    expect(validarSenhaForte('Desapego@Sul', usuario)).toMatch(/número/);
  });

  test('recusa senha sem caractere especial', () => {
    expect(validarSenhaForte('Desapego2026', usuario)).toMatch(/especial/);
  });

  test('recusa senha que contém o nome do usuário', () => {
    expect(validarSenhaForte('Mariana@2026', usuario)).toMatch(/nome/);
  });

  test('recusa senha que contém o sobrenome do usuário', () => {
    expect(validarSenhaForte('Ferreira#99x', usuario)).toMatch(/sobrenome/);
  });

  test('recusa senha com sequência óbvia (123456)', () => {
    expect(validarSenhaForte('Casa@123456', usuario)).toMatch(/sequências/);
  });
});

describe('RN09 - Moderação de Conteúdo', () => {
  test('detecta arma no texto do anúncio', () => {
    expect(conteudoTemPalavrasProibidas('Vendo pistola usada')).toBe('pistola');
  });

  test('detecta droga ilícita mesmo com letras maiúsculas', () => {
    expect(conteudoTemPalavrasProibidas('MACONHA de qualidade')).toBe('maconha');
  });

  test('detecta documento falso (expressão com duas palavras)', () => {
    expect(conteudoTemPalavrasProibidas('faço RG falso rápido')).toBe('rg falso');
  });

  test('libera texto comum de anúncio', () => {
    expect(conteudoTemPalavrasProibidas('Geladeira Brastemp 400L funcionando')).toBeUndefined();
  });

  test('não bloqueia palavra que só contém o termo proibido (armário)', () => {
    expect(conteudoTemPalavrasProibidas('Armário de cozinha 4 portas')).toBeUndefined();
  });
});
