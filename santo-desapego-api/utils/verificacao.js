const crypto = require('crypto');
const pool = require('../db');
const { enviarEmail } = require('./email');
const { montarEmail } = require('./emailTemplate');

// Verificação em duas etapas por e-mail (migration 008).
// O código vale 10 minutos, aceita 5 tentativas e só pode ser
// reenviado depois de 60 segundos.
const VALIDADE_MIN = 10;
const MAX_TENTATIVAS = 5;
const INTERVALO_REENVIO_S = 60;

const hash = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const gerarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// "paulo@gmail.com" -> "pa***@gmail.com" — mostrado na tela do código
const mascararEmail = (email) => {
  const [usuario, dominio] = String(email).split('@');
  return `${usuario.slice(0, 2)}***@${dominio}`;
};

const TEXTOS = {
  cadastro: {
    assunto: 'Confirme seu e-mail — Santo Desapego',
    titulo: 'Confirme seu e-mail',
    paragrafo: 'Falta pouco para sua conta ficar pronta. Digite o código abaixo na tela de cadastro:',
  },
  login: {
    assunto: 'Seu código de acesso — Santo Desapego',
    titulo: 'Seu código de acesso',
    paragrafo: 'Recebemos um pedido de login na sua conta. Digite o código abaixo para entrar:',
  },
};

const enviarCodigo = async (usuario, finalidade, codigo) => {
  // Sem SMTP configurado (ambiente local), o código aparece no terminal da API
  if (!process.env.EMAIL_USER && process.env.NODE_ENV !== 'production') {
    console.log(`🔐 [dev] Código de ${finalidade} para ${usuario.email}: ${codigo}`);
  }
  const t = TEXTOS[finalidade];
  await enviarEmail(
    usuario.email,
    t.assunto,
    montarEmail({
      titulo: t.titulo,
      nome: usuario.nome,
      paragrafos: [t.paragrafo],
      codigo,
      rodapeExtra: `O código vale ${VALIDADE_MIN} minutos. Não foi você? Ignore este e-mail e, se for o caso, troque sua senha.`,
      previa: `Seu código é ${codigo}`,
    })
  );
};

/** Cria um desafio novo, envia o código e devolve o que o front precisa. */
const criarDesafio = async (usuario, finalidade) => {
  const codigo = gerarCodigo();
  const desafio = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO codigos_verificacao (desafio, usuario_id, finalidade, codigo_hash, expira_em)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`,
    [desafio, usuario.id, finalidade, hash(codigo), String(VALIDADE_MIN)]
  );
  await enviarCodigo(usuario, finalidade, codigo);

  return { desafio, email_mascarado: mascararEmail(usuario.email), finalidade };
};

/**
 * Confere o código. Devolve { ok: true, usuarioId } ou { ok: false, status, erro }.
 * FOR UPDATE: duas tentativas ao mesmo tempo não burlam o limite.
 */
const verificarCodigo = async (desafio, codigoDigitado) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, usuario_id, codigo_hash, tentativas, usado_em, (expira_em < NOW()) AS expirado
         FROM codigos_verificacao WHERE desafio = $1 FOR UPDATE`,
      [desafio]
    );
    const registro = rows[0];
    const falha = async (status, erro, extras = {}) => {
      await client.query('COMMIT');
      return { ok: false, status, erro, ...extras };
    };

    if (!registro || registro.usado_em) {
      return falha(400, 'Este código não é mais válido. Faça login de novo.', { reiniciar: true });
    }
    if (registro.expirado) {
      return falha(400, 'O código expirou. Clique em "Reenviar código".');
    }
    if (registro.tentativas >= MAX_TENTATIVAS) {
      return falha(429, 'Muitas tentativas erradas. Faça login de novo para receber outro código.', { reiniciar: true });
    }

    const certo = crypto.timingSafeEqual(Buffer.from(hash(codigoDigitado)), Buffer.from(registro.codigo_hash));
    if (!certo) {
      const tentativas = registro.tentativas + 1;
      await client.query('UPDATE codigos_verificacao SET tentativas = $1 WHERE id = $2', [tentativas, registro.id]);
      const restantes = MAX_TENTATIVAS - tentativas;
      return falha(400, restantes > 0
        ? `Código incorreto. Você tem mais ${restantes} tentativa(s).`
        : 'Código incorreto. Faça login de novo para receber outro código.',
      { reiniciar: restantes === 0 });
    }

    await client.query('UPDATE codigos_verificacao SET usado_em = NOW() WHERE id = $1', [registro.id]);
    await client.query('COMMIT');
    return { ok: true, usuarioId: registro.usuario_id };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
};

/** Gera um código novo para o mesmo desafio (respeitando o intervalo de reenvio). */
const reenviarCodigo = async (desafio) => {
  const { rows } = await pool.query(
    `SELECT cv.id, cv.finalidade, cv.usado_em, cv.tentativas,
            EXTRACT(EPOCH FROM (NOW() - cv.ultimo_envio_em)) AS segundos,
            u.id AS usuario_id, u.nome, u.email
       FROM codigos_verificacao cv
       JOIN usuarios u ON u.id = cv.usuario_id
      WHERE cv.desafio = $1`,
    [desafio]
  );
  const registro = rows[0];
  if (!registro || registro.usado_em || registro.tentativas >= MAX_TENTATIVAS) {
    return { ok: false, status: 400, erro: 'Este código não é mais válido. Faça login de novo.', reiniciar: true };
  }
  const espera = Math.ceil(INTERVALO_REENVIO_S - Number(registro.segundos));
  if (espera > 0) {
    return { ok: false, status: 429, erro: `Aguarde ${espera} segundos para pedir outro código.` };
  }

  const codigo = gerarCodigo();
  await pool.query(
    `UPDATE codigos_verificacao
        SET codigo_hash = $1, tentativas = 0, ultimo_envio_em = NOW(),
            expira_em = NOW() + ($2 || ' minutes')::interval
      WHERE id = $3`,
    [hash(codigo), String(VALIDADE_MIN), registro.id]
  );
  await enviarCodigo({ id: registro.usuario_id, nome: registro.nome, email: registro.email }, registro.finalidade, codigo);
  return { ok: true };
};

module.exports = { criarDesafio, verificarCodigo, reenviarCodigo, INTERVALO_REENVIO_S };
