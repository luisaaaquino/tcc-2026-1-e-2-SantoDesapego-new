const pool = require('../db');

// ============================================================
//  Situação da conta dona de um token de login [RN10 / RF20]
//  O token (JWT) vale 7 dias e é conferido só pela assinatura.
//  Sem esta consulta, uma conta excluída/anonimizada ou suspensa
//  pelo Admin continuaria usando o site até o token vencer (ex.:
//  reativar os anúncios pausados na exclusão e reconectar o
//  Mercado Pago). Usado pelo middleware/auth.js em toda rota logada.
//  Retorna 'ativa', 'suspensa' ou 'removida' (excluída ou anonimizada).
// ============================================================
const situacaoDaConta = async (usuarioId) => {
  const resultado = await pool.query(
    'SELECT status_conta, anonimizada_em FROM usuarios WHERE id = $1',
    [usuarioId]
  );
  const usuario = resultado.rows[0];
  if (!usuario || usuario.anonimizada_em) return 'removida';
  return usuario.status_conta === 'suspensa' ? 'suspensa' : 'ativa';
};

module.exports = { situacaoDaConta };
