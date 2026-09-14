const jwt  = require('jsonwebtoken');
const pool = require('../db');

// ============================================================
// MIDDLEWARE — verifica JWT em rotas protegidas
// ============================================================
const autenticar = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticação não enviado.' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.userEmail = payload.email;
    next();
  } catch (erro) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
};

// ============================================================
// MIDDLEWARE — autenticação opcional
// Usado em rotas públicas (ex: listagem de anúncios) que, quando o
// visitante está logado, precisam saber quem ele é (ex: [RF10] pra
// marcar "favoritado") sem exigir login pra acessar a rota.
// ============================================================
const autenticarOpcional = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      req.userId = payload.id;
      req.userEmail = payload.email;
    } catch {
      // Token inválido/expirado — segue como visitante anônimo, sem erro
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
