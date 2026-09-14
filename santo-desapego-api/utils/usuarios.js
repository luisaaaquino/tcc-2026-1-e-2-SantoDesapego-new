const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');

// ============================================================
//  [RF04 / RN10] Exclusão de dados pessoais — LGPD
//  Se o usuário tiver transações financeiras registradas (compras),
//  os dados pessoais são anonimizados em vez de apagados: a linha em
//  `compras` precisa ser preservada por até 5 anos por obrigação legal
//  e fiscal, e ela referencia `usuarios`. Sem transações, a conta e
//  todo o histórico relacionado (anúncios, mensagens etc.) são
//  apagados de verdade via ON DELETE CASCADE.
//  Usado tanto pelo autoatendimento (DELETE /api/usuario/conta) quanto
//  pela moderação do admin (DELETE /api/admin/usuarios/:id).
// ============================================================
const excluirOuAnonimizarUsuario = async (id) => {
  const temTransacoes = await pool.query(
    'SELECT 1 FROM compras WHERE comprador_id = $1 OR vendedor_id = $1 LIMIT 1',
    [id]
  );

  if (temTransacoes.rows.length === 0) {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    return { anonimizada: false };
  }

  // Invalida a senha (nunca mais faz login) sem deixar o campo vazio
  const senhaInvalidada = await bcrypt.hash(crypto.randomUUID(), 10);
  // CPF é CHAR(11) NOT NULL UNIQUE — mantém 11 caracteres e unicidade por id
  const cpfAnonimizado = 'ANON' + String(id).padStart(7, '0');

  await pool.query(
    `UPDATE usuarios SET
       nome = 'Usuário removido', sobrenome = '',
       email = $1, senha = $2, cpf = $3,
       telefone = NULL, cep = NULL, logradouro = NULL, numero = NULL,
       complemento = NULL, bairro = NULL, foto_perfil = NULL,
       reset_senha_token = NULL, reset_senha_expira = NULL,
       anonimizada_em = NOW()
     WHERE id = $4`,
    [`removido+${id}@santodesapego.invalid`, senhaInvalidada, cpfAnonimizado, id]
  );

  return { anonimizada: true };
};

module.exports = { excluirOuAnonimizarUsuario };
