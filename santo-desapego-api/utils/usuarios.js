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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Apaga todos os dados pessoais, inclusive data de nascimento e a
    // conexão com o Mercado Pago (tokens de acesso da conta do vendedor)
    await client.query(
      `UPDATE usuarios SET
         nome = 'Usuário removido', sobrenome = '',
         email = $1, senha = $2, cpf = $3,
         telefone = NULL, cep = NULL, logradouro = NULL, numero = NULL,
         complemento = NULL, bairro = NULL, foto_perfil = NULL,
         data_nascimento = NULL,
         reset_senha_token = NULL, reset_senha_expira = NULL,
         mp_user_id = NULL, mp_access_token = NULL, mp_refresh_token = NULL,
         mp_public_key = NULL, mp_token_expira_em = NULL, mp_conectado = FALSE,
         anonimizada_em = NOW()
       WHERE id = $4`,
      [`removido+${id}@santodesapego.invalid`, senhaInvalidada, cpfAnonimizado, id]
    );

    // Anúncios que ainda estavam à venda saem de circulação: ninguém pode
    // mais comprar de uma conta excluída. Os vendidos ficam (histórico).
    await client.query(
      `UPDATE anuncios SET status = 'pausado', data_atualizacao = NOW()
        WHERE vendedor_id = $1 AND status IN ('ativo', 'reservado', 'em-negociacao')`,
      [id]
    );

    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }

  return { anonimizada: true };
};

module.exports = { excluirOuAnonimizarUsuario };
