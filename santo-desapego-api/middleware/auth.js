const jwt  = require('jsonwebtoken');
const pool = require('../db');
const { situacaoDaConta } = require('../utils/situacaoConta');

// Mesma mensagem que o front (src/utils/sessao.js) reconhece para limpar a
// sessão e levar ao login — no login, a conta suspensa recebe o aviso dela.
const ERRO_TOKEN = 'Token inválido ou expirado.';

// ============================================================
// MIDDLEWARE — verifica JWT em rotas protegidas
// Além da assinatura do token, confere no banco se a conta ainda
// existe e não está suspensa [RN10 / RF20]: excluir ou suspender
// uma conta vale na hora, sem esperar o token de 7 dias vencer.
// ============================================================
const autenticar = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não enviado.' });
  }
  let payload;
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch (erro) {
    return res.status(401).json({ erro: ERRO_TOKEN });
  }
  try {
    if (await situacaoDaConta(payload.id) !== 'ativa') {
      return res.status(401).json({ erro: ERRO_TOKEN });
    }
  } catch (erro) {
    console.error('Erro ao conferir a situação da conta:', erro);
    return res.status(500).json({ erro: 'Erro ao verificar a sessão.' });
  }
  req.userId = payload.id;
  req.userEmail = payload.email;
  next();
};

// ============================================================
// MIDDLEWARE — autenticação opcional
// Usado em rotas públicas (ex: listagem de anúncios) que, quando o
// visitante está logado, precisam saber quem ele é (ex: [RF10] pra
// marcar "favoritado") sem exigir login pra acessar a rota.
// ============================================================
const autenticarOpcional = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      // Conta excluída ou suspensa navega como visitante
      if (await situacaoDaConta(payload.id) === 'ativa') {
        req.userId = payload.id;
        req.userEmail = payload.email;
      }
    } catch {
      // Token inválido/expirado (ou falha na consulta) — segue como visitante anônimo, sem erro
    }
  }
  next();
};

// ============================================================
// MIDDLEWARE — exige papel administrador [RNF04]
// Usado nas rotas do Painel Administrativo.
// ============================================================
const autenticarAdmin = (req, res, next) => {
  autenticar(req, res, async () => {
    try {
      const resultado = await pool.query('SELECT papel FROM usuarios WHERE id = $1', [req.userId]);
      if (resultado.rows.length === 0 || resultado.rows[0].papel !== 'administrador') {
        return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
      }
      next();
    } catch (erro) {
      console.error('Erro ao verificar permissão de administrador:', erro);
      return res.status(500).json({ erro: 'Erro ao verificar permissões.' });
    }
  });
};

module.exports = { autenticar, autenticarAdmin, autenticarOpcional };
