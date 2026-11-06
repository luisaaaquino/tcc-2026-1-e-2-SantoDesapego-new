/**
 * Sobe a API para os testes ponta a ponta:
 *  1. recria do zero o banco "santo_desapego_e2e" (schema.sql + dados.js);
 *  2. liga a API real (server.js) na porta 8090 apontando para esse banco;
 *  3. grava tudo o que a API escreve no terminal em relatorio/api.log — é
 *     de lá que os testes leem o código de verificação "enviado por e-mail".
 *
 * Usa o usuário/senha do PostgreSQL do .env da API, mas NUNCA o banco de
 * desenvolvimento. E-mail, Mercado Pago e IA ficam sem chave: nada sai do
 * computador durante os testes.
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { popular } = require('./dados');

const PASTA_API = path.resolve(__dirname, '../santo-desapego-api');
const requireDaApi = createRequire(path.join(PASTA_API, 'package.json'));
const { Client } = requireDaApi('pg');
const bcrypt = requireDaApi('bcrypt');
const dotenv = requireDaApi('dotenv');

const BANCO_E2E = 'santo_desapego_e2e';
const PORTA_API = '8090';
const LOG = path.join(__dirname, 'relatorio', 'api.log');

async function recriarBanco(credenciais) {
  const admin = new Client({ ...credenciais, database: 'postgres' });
  await admin.connect();
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [BANCO_E2E]
  );
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO_E2E}`);
  await admin.query(`CREATE DATABASE ${BANCO_E2E} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const banco = new Client({ ...credenciais, database: BANCO_E2E });
  await banco.connect();
  await banco.query(fs.readFileSync(path.join(PASTA_API, 'schema.sql'), 'utf8'));
  await popular(banco, bcrypt);
  await banco.end();
}

async function main() {
  const env = dotenv.parse(fs.readFileSync(path.join(PASTA_API, '.env')));
  const credenciais = {
    user: env.DB_USER, password: env.DB_PASSWORD, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432),
  };
  await recriarBanco(credenciais);

  // Ambiente da API de teste (o .env da API não é lido: ver chdir abaixo)
  for (const chave of Object.keys(process.env)) {
    if (/^(EMAIL_|MP_|LLM_|OPENAI_|DB_|AGENTE_)/.test(chave)) delete process.env[chave];
  }
  Object.assign(process.env, {
    DB_USER: credenciais.user, DB_PASSWORD: credenciais.password, DB_HOST: credenciais.host,
    DB_PORT: String(credenciais.port), DB_NAME: BANCO_E2E,
    JWT_SECRET: 'segredo-dos-testes-e2e', PORT: PORTA_API,
    FRONTEND_URL: 'http://localhost:5174', MP_MARKETPLACE_FEE_PERCENT: '5',
    NODE_ENV: 'test',
  });

  // Tudo o que a API escreve no terminal vai também para relatorio/api.log
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, '');
  for (const metodo of ['log', 'warn', 'error']) {
    const original = console[metodo].bind(console);
    console[metodo] = (...args) => {
      fs.appendFileSync(LOG, `${args.map(String).join(' ')}\n`);
      original(...args);
    };
  }

  // Pasta sem .env: o dotenv da API não sobrescreve nada com o .env de desenvolvimento
  process.chdir(__dirname);
  require(path.join(PASTA_API, 'server.js'));
}

main().catch((erro) => {
  console.error('Falha ao preparar a API de teste:', erro);
  process.exit(1);
});
