const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool = require('../db');
const { enviarEmail } = require('../utils/email');
const { montarEmail } = require('../utils/emailTemplate');
const { validarSenhaForte } = require('../utils/validacao');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');
const { criarDesafio, verificarCodigo, reenviarCodigo } = require('../utils/verificacao');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Mesmo Client ID do front (santo-desapego/src/pages/Login.jsx). Não é
// segredo — é público por natureza; serve pra conferir que o token do
// Google foi emitido pro Santo Desapego e não pra outro site/app.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '113184048014-ramhhojnofdd511oh1nl3h2ibono7581.apps.googleusercontent.com';

const router = express.Router();

// Token de sessão + dados públicos do usuário — mesmo formato no login
// com senha (depois do código) e no login com Google.
const montarSessao = (usuario) => ({
  token: jwt.sign(
    { id: usuario.id, email: usuario.email, papel: usuario.papel },
    process.env.JWT_SECRET, { expiresIn: '7d' }
  ),
  usuario: {
    id: usuario.id, nome: usuario.nome, sobrenome: usuario.sobrenome,
    email: usuario.email, bairro: usuario.bairro,
    foto_perfil: usuario.foto_perfil, papel: usuario.papel,
  },
});

// ──────────────────────────────────────────────────────────
// CADASTRO
// ──────────────────────────────────────────────────────────
router.post('/api/auth/cadastro', async (req, res) => {
  try {
    const {
      nome, sobrenome, telefone, email, senha,
      cep, logradouro, numero, complemento, bairro,
      cpf, aceita_termos, recebe_newsletter
    } = req.body;

    if (!nome || !sobrenome || !email || !senha || !cpf) {
      return res.status(400).json({
        erro: 'Nome, sobrenome, CPF, e-mail e senha são obrigatórios.'
      });
    }
    if (!aceita_termos) {
      return res.status(400).json({ erro: 'É necessário aceitar os Termos de Uso.' });
    }

    const erroSenha = validarSenhaForte(senha, { nome, sobrenome });
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    const senhaHash = await bcrypt.hash(senha, 10);

    // [RF03] Aceite eletrônico — grava versão do documento e data/hora no mesmo instante do cadastro
    const novoUsuario = await pool.query(
      `INSERT INTO usuarios
        (nome, sobrenome, telefone, email, senha,
         cep, logradouro, numero, complemento, bairro,
         cpf, aceita_termos, recebe_newsletter, termos_versao, termos_aceitos_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING id, nome, email`,
      [
        nome, sobrenome, telefone || null, email, senhaHash,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cpf,
        aceita_termos === true, recebe_newsletter === true, TERMOS_VERSAO_ATUAL
      ]
    );

    // Verificação em duas etapas: confirma o e-mail com um código antes do
    // primeiro acesso. Se o envio falhar, a conta já existe — o código sai
    // de novo no primeiro login.
    let verificacao = null;
    try {
      verificacao = await criarDesafio(novoUsuario.rows[0], 'cadastro');
    } catch (erroEnvio) {
      console.error('Erro ao enviar código de cadastro:', erroEnvio);
    }

    return res.status(201).json({
      mensagem: 'Usuário cadastrado com sucesso!',
      usuario:  novoUsuario.rows[0],
      verificacao,
    });

  } catch (erro) {
    console.error('Erro no cadastro:', erro);
    if (erro.code === '23505') {
      return res.status(409).json({ erro: 'E-mail ou CPF já cadastrado na plataforma.' });
    }
    return res.status(500).json({ erro: 'Erro interno no servidor ao cadastrar usuário.' });
  }
});

// ──────────────────────────────────────────────────────────
// LOGIN MANUAL
// ──────────────────────────────────────────────────────────
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    const resultado = await pool.query(
      `SELECT id, nome, sobrenome, email, senha, bairro, foto_perfil, papel, status_conta, anonimizada_em
       FROM usuarios WHERE email = $1`, [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const usuario = resultado.rows[0];

    // [RN10] Conta anonimizada não pode mais ser acessada
    if (usuario.anonimizada_em) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    if (usuario.status_conta === 'suspensa') {
      return res.status(403).json({ erro: 'Sua conta está suspensa. Entre em contato com o suporte.' });
    }

    // Senha certa não basta: o token só sai depois do código enviado por
    // e-mail (POST /api/auth/verificar-codigo).
    const verificacao = await criarDesafio(usuario, 'login');
    return res.json({ mensagem: 'Enviamos um código para o seu e-mail.', verificacao });
  } catch (erro) {
    console.error('Erro no login:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

// ──────────────────────────────────────────────────────────
// VERIFICAÇÃO EM DUAS ETAPAS — confere o código e abre a sessão
// ──────────────────────────────────────────────────────────
router.post('/api/auth/verificar-codigo', async (req, res) => {
  try {
    const desafio = String(req.body.desafio || '');
    const codigo = String(req.body.codigo || '').replace(/\D/g, '');
    if (!desafio || codigo.length !== 6) {
      return res.status(400).json({ erro: 'Digite o código de 6 dígitos.' });
    }

    const resultado = await verificarCodigo(desafio, codigo);
    if (!resultado.ok) {
      return res.status(resultado.status).json({ erro: resultado.erro, reiniciar: resultado.reiniciar });
    }

    const { rows } = await pool.query(
      `SELECT id, nome, sobrenome, email, bairro, foto_perfil, papel, status_conta, anonimizada_em
       FROM usuarios WHERE id = $1`, [resultado.usuarioId]
    );
    const usuario = rows[0];
    if (!usuario || usuario.anonimizada_em) {
      return res.status(401).json({ erro: 'Conta não encontrada.', reiniciar: true });
    }
    if (usuario.status_conta === 'suspensa') {
      return res.status(403).json({ erro: 'Sua conta está suspensa. Entre em contato com o suporte.', reiniciar: true });
    }

    return res.json({ mensagem: 'Login realizado com sucesso!', ...montarSessao(usuario) });
  } catch (erro) {
    console.error('Erro ao verificar código:', erro);
    return res.status(500).json({ erro: 'Erro ao verificar o código.' });
  }
});

router.post('/api/auth/reenviar-codigo', async (req, res) => {
  try {
    const resultado = await reenviarCodigo(String(req.body.desafio || ''));
    if (!resultado.ok) {
      return res.status(resultado.status).json({ erro: resultado.erro, reiniciar: resultado.reiniciar });
    }
    return res.json({ mensagem: 'Enviamos um novo código para o seu e-mail.' });
  } catch (erro) {
    console.error('Erro ao reenviar código:', erro);
    return res.status(500).json({ erro: 'Erro ao reenviar o código.' });
  }
});

// ──────────────────────────────────────────────────────────
// RECUPERAÇÃO DE SENHA — solicitar token por e-mail [RF02]
// ──────────────────────────────────────────────────────────
router.post('/api/auth/recuperar-senha', async (req, res) => {
  const respostaGenerica = {
    mensagem: 'Se este e-mail estiver cadastrado, você vai receber um link para redefinir sua senha.',
  };

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ erro: 'Informe o e-mail cadastrado.' });
    }

    const resultado = await pool.query('SELECT id, nome FROM usuarios WHERE email = $1', [email]);

    // Resposta genérica em ambos os casos, para não revelar quais e-mails existem na base.
    if (resultado.rows.length === 0) {
      return res.json(respostaGenerica);
    }

    const usuario = resultado.rows[0];
    const tokenBruto = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenBruto).digest('hex');
    const expiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      'UPDATE usuarios SET reset_senha_token = $1, reset_senha_expira = $2 WHERE id = $3',
      [tokenHash, expiraEm, usuario.id]
    );

    const link = `${FRONTEND_URL}/redefinir-senha?token=${tokenBruto}`;

    await enviarEmail(
      email,
      'Recupere sua senha — Santo Desapego',
      montarEmail({
        titulo: 'Vamos criar uma nova senha',
        nome: usuario.nome,
        paragrafos: [
          'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha.',
          'Por segurança, este link expira em 1 hora e só pode ser usado uma vez.',
        ],
        botao: { texto: 'Redefinir minha senha', url: link },
        rodapeExtra: 'Não foi você? Pode ignorar este e-mail — sua senha atual continua valendo.',
        previa: 'Use o link para criar uma nova senha. Ele expira em 1 hora.',
      })
    );

    return res.json(respostaGenerica);
  } catch (erro) {
    console.error('Erro ao solicitar recuperação de senha:', erro);
    return res.status(500).json({ erro: 'Erro ao processar a solicitação.' });
  }
});

// ──────────────────────────────────────────────────────────
// RECUPERAÇÃO DE SENHA — valida o link antes de mostrar o formulário
// Só diz se o token ainda vale (sem expor de quem é); a troca em si
// continua validando de novo no POST abaixo.
// ──────────────────────────────────────────────────────────
router.get('/api/auth/redefinir-senha/validar', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.json({ valido: false });

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const resultado = await pool.query(
      `SELECT 1 FROM usuarios WHERE reset_senha_token = $1 AND reset_senha_expira > NOW()`,
      [tokenHash]
    );
    return res.json({ valido: resultado.rows.length > 0 });
  } catch (erro) {
    console.error('Erro ao validar link de recuperação:', erro);
    return res.status(500).json({ erro: 'Erro ao validar o link.' });
  }
});

// ──────────────────────────────────────────────────────────
// RECUPERAÇÃO DE SENHA — redefinir com token [RF02]
// ──────────────────────────────────────────────────────────
router.post('/api/auth/redefinir-senha', async (req, res) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) {
      return res.status(400).json({ erro: 'Token e nova senha são obrigatórios.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resultado = await pool.query(
      `SELECT id, nome, sobrenome FROM usuarios
       WHERE reset_senha_token = $1 AND reset_senha_expira > NOW()`,
      [tokenHash]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite a recuperação novamente.' });
    }

    const usuario = resultado.rows[0];
    const erroSenha = validarSenhaForte(novaSenha, { nome: usuario.nome, sobrenome: usuario.sobrenome });
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query(
      `UPDATE usuarios SET senha = $1, reset_senha_token = NULL, reset_senha_expira = NULL WHERE id = $2`,
      [novaSenhaHash, usuario.id]
    );

    return res.json({ mensagem: 'Senha redefinida com sucesso! Faça login com a nova senha.' });
  } catch (erro) {
    console.error('Erro ao redefinir senha:', erro);
    return res.status(500).json({ erro: 'Erro ao redefinir a senha.' });
  }
});

// ──────────────────────────────────────────────────────────
// LOGIN GOOGLE
// ──────────────────────────────────────────────────────────
router.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ erro: 'Token do Google não enviado.' });
    }

    // 1) O token precisa ter sido emitido PRO NOSSO app. Sem isso, um token
    //    obtido por qualquer outro site em que a pessoa logou com Google
    //    serviria pra entrar na conta dela aqui.
    const respostaTokenInfo = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(credential)}`
    );
    if (!respostaTokenInfo.ok) {
      return res.status(401).json({ erro: 'Token do Google inválido ou expirado.' });
    }
    const tokenInfo = await respostaTokenInfo.json();
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ erro: 'Token do Google não pertence a este site.' });
    }

    // 2) Dados da conta Google — e o e-mail tem que ser verificado pelo Google
    const respostaGoogle = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${credential}` } }
    );
    if (!respostaGoogle.ok) {
      return res.status(401).json({ erro: 'Token do Google inválido ou expirado.' });
    }

    const userInfo = await respostaGoogle.json();
    if (!userInfo.email || userInfo.email_verified !== true) {
      return res.status(401).json({ erro: 'Sua conta Google não tem um e-mail verificado.' });
    }
    const emailGoogle = userInfo.email;

    const resultado = await pool.query(
      `SELECT id, nome, sobrenome, email, bairro, foto_perfil, papel, status_conta
       FROM usuarios WHERE email = $1`, [emailGoogle]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        erro: `Não encontramos uma conta com o e-mail ${emailGoogle}. Crie sua conta primeiro!`,
        precisaCadastro: true,
      });
    }

    const usuario = resultado.rows[0];

    if (usuario.status_conta === 'suspensa') {
      return res.status(403).json({ erro: 'Sua conta está suspensa. Entre em contato com o suporte.' });
    }

    // Sem código por e-mail: o Google já confirmou que a pessoa é dona do e-mail
    return res.json({ mensagem: `Bem-vindo(a) de volta, ${usuario.nome}!`, ...montarSessao(usuario) });
  } catch (erro) {
    console.error('Erro no login com Google:', erro);
    return res.status(500).json({ erro: 'Não foi possível validar sua conta Google.' });
  }
});

module.exports = router;
