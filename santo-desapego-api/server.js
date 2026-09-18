// ============================================================
// server.js — API do Santo Desapego
// ============================================================
const express = require('express');
const cors    = require('cors');
require('dotenv').config({ quiet: true });
const pool = require('./db');

const { criarNotificacao } = require('./utils/notificacoes');

const app = express();

// Aumenta o limite pra suportar múltiplas imagens em base64
app.use(cors());
app.use(express.json({ limit: '30mb' }));

// ──────────────────────────────────────────────────────────
// Rota de teste
// ──────────────────────────────────────────────────────────
app.get('/ping', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', horaBanco: result.rows[0].now });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Falha ao conectar no PostgreSQL' });
  }
});

// ============================================================
// ROTAS
// ============================================================
app.use(require('./routes/auth'));
app.use(require('./routes/usuario'));
app.use(require('./routes/avaliacoes'));
app.use(require('./routes/categorias'));
app.use(require('./routes/anuncios'));
app.use(require('./routes/favoritos'));
app.use(require('./routes/conversas'));
app.use(require('./routes/pagamentos'));
app.use(require('./routes/mercadoPago'));
app.use(require('./routes/admin'));

// ============================================================
//  NOTIFICAÇÃO — anúncio prestes a expirar [RF18]
//  Roda ao subir o servidor e depois a cada 6 horas. Evita duplicar
//  o aviso pro mesmo anúncio checando se já notificou nos últimos 3 dias.
// ============================================================
const verificarAnunciosExpirando = async () => {
  try {
    const resultado = await pool.query(`
      SELECT a.id, a.titulo, a.vendedor_id, a.data_expiracao
        FROM anuncios a
       WHERE a.status = 'ativo'
         AND a.data_expiracao BETWEEN NOW() AND NOW() + INTERVAL '3 days'
         AND NOT EXISTS (
           SELECT 1 FROM notificacoes n
            WHERE n.tipo = 'anuncio_expirando'
              AND n.link = '/anuncio/' || a.id
              AND n.criada_em > NOW() - INTERVAL '3 days'
         )
    `);

    for (const anuncio of resultado.rows) {
      const diasRestantes = Math.max(
        1, Math.ceil((new Date(anuncio.data_expiracao) - Date.now()) / (1000 * 60 * 60 * 24))
      );
      await criarNotificacao(
        anuncio.vendedor_id,
        'anuncio_expirando',
        'Seu anúncio está prestes a expirar',
        `"${anuncio.titulo}" expira em ${diasRestantes} dia(s). Acesse a plataforma para renovar e continuar recebendo interessados.`,
        `/anuncio/${anuncio.id}`
      );
    }
  } catch (erro) {
    console.error('Erro ao verificar anúncios expirando:', erro);
  }
};

// ============================================================
//  EXPIRAÇÃO — atualiza automaticamente o estado do anúncio [RF12]
//  Passado o prazo (data_expiracao), o anúncio sai de "ativo" e
//  vira "expirado" — some das buscas até o vendedor renovar.
// ============================================================
const expirarAnunciosVencidos = async () => {
  try {
    const resultado = await pool.query(
      `UPDATE anuncios SET status = 'expirado', data_atualizacao = NOW()
        WHERE status = 'ativo' AND data_expiracao <= NOW()
        RETURNING id`
    );
    if (resultado.rows.length > 0) {
      console.log(`⏳ ${resultado.rows.length} anúncio(s) marcado(s) como expirado(s)`);
    }
  } catch (erro) {
    console.error('Erro ao expirar anúncios vencidos:', erro);
  }
};

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor do Santo Desapego rodando em http://localhost:${PORT}`);
  expirarAnunciosVencidos();
  verificarAnunciosExpirando();
  setInterval(() => {
    expirarAnunciosVencidos();
    verificarAnunciosExpirando();
  }, 6 * 60 * 60 * 1000);
});
