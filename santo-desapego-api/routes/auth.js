const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool = require('../db');
const { enviarEmail } = require('../utils/email');
const { validarSenhaForte } = require('../utils/validacao');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const router = express.Router();

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

    return res.status(201).json({
      mensagem: 'Usuário cadastrado com sucesso!',
      usuario:  novoUsuario.rows[0]
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

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, papel: usuario.papel },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );

    return res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: usuario.id, nome: usuario.nome, sobrenome: usuario.sobrenome,
        email: usuario.email, bairro: usuario.bairro,
        foto_perfil: usuario.foto_perfil, papel: usuario.papel,
      }
    });
  } catch (erro) {
    console.error('Erro no login:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
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
      `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1F4F3F;">Santo Desapego</h2>
        <p>Olá, ${usuario.nome}!</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${link}" style="background:#1F4F3F; color:#fff; padding:12px 24px; border-radius:24px; text-decoration:none; font-weight:bold;">Redefinir minha senha</a>
        </p>
        <p>Este link expira em 1 hora. Se você não pediu essa alteração, pode ignorar este e-mail.</p>
        <p style="color:#888; font-size:12px;">Santo Desapego — Projeto acadêmico TCC, Centro Universitário Senac Santo Amaro.</p>
      </div>`
    );

    return res.json(respostaGenerica);
  } catch (erro) {
    console.error('Erro ao solicitar recuperação de senha:', erro);
    return res.status(500).json({ erro: 'Erro ao processar a solicitação.' });
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

    const respostaGoogle = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${credential}` } }
    );
    if (!respostaGoogle.ok) {
      return res.status(401).json({ erro: 'Token do Google inválido ou expirado.' });
    }

    const userInfo = await respostaGoogle.json();
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

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, papel: usuario.papel },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );

    return res.json({
      mensagem: `Bem-vindo(a) de volta, ${usuario.nome}!`,
      token,
      usuario: {
        id: usuario.id, nome: usuario.nome, sobrenome: usuario.sobrenome,
        email: usuario.email, bairro: usuario.bairro,
        foto_perfil: usuario.foto_perfil, papel: usuario.papel,
      }
    });
  } catch (erro) {
    console.error('Erro no login com Google:', erro);
    return res.status(500).json({ erro: 'Não foi possível validar sua conta Google.' });
  }
});

module.exports = router;
