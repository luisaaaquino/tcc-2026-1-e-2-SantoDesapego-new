const pool = require('../db');

// ============================================================
//  Registra uma ação administrativa no log de auditoria [RF20]
// ============================================================
const registrarLog = (adminId, acao, alvoTipo, alvoId, detalhes = null) => {
  pool.query(
    `INSERT INTO logs_auditoria (admin_id, acao, alvo_tipo, alvo_id, detalhes)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, acao, alvoTipo, alvoId, detalhes ? JSON.stringify(detalhes) : null]
  ).catch((erro) => console.error('Erro ao registrar log de auditoria:', erro));
};

module.exports = { registrarLog };
