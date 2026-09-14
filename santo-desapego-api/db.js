// ============================================================
// db.js — Configuração da conexão com o PostgreSQL
// ============================================================
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     process.env.DB_PORT || 5432,
});

// Evento disparado na primeira conexão de qualquer cliente do pool
pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL (santo_desapego)');
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;