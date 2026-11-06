jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/email', () => ({ enviarEmail: jest.fn() }));
jest.mock('../utils/notificacoes', () => ({ criarNotificacao: jest.fn() }));
jest.mock('../utils/verificacao', () => ({
  criarDesafio: jest.fn(async () => ({ desafio: 'abc', email_mascarado: 'an***@teste.com', finalidade: 'login' })),
  verificarCodigo: jest.fn(),
  reenviarCodigo: jest.fn(),
}));

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../db');
const { enviarEmail } = require('../utils/email');
const { criarNotificacao } = require('../utils/notificacoes');
const { criarDesafio, verificarCodigo, reenviarCodigo } = require('../utils/verificacao');
const { montarApp, tokenDe, linhas } = require('./helpers');

const appAuth = montarApp(require('../routes/auth'));
const appChat = montarApp(require('../routes/conversas'));
const appDenuncia = montarApp(require('../routes/avaliacoes'));

const COMPRADOR = 1;
const VENDEDOR = 2;
const ESTRANHO = 9;
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const SENHA = 'Desapego@2026';
const HASH_SENHA = bcrypt.hashSync(SENHA, 4);

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
});

/* ─────────────────────────────────────────────────────────── */
describe('RF02 - Autenticação e Gestão de Sessão', () => {
  const usuario = (extra = {}) => ({
    id: 5, nome: 'Ana', sobrenome: 'Lima', email: 'ana@teste.com', senha: HASH_SENHA,
    papel: 'usuario', status_conta: 'ativa', anonimizada_em: null, ...extra,
  });
  const login = (email, senha) => request(appAuth).post('/api/auth/login').send({ email, senha });

  test('login com senha certa não entra direto: envia o código por e-mail', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario()));
    const res = await login('ana@teste.com', SENHA);

    expect(res.status).toBe(200);
    expect(criarDesafio).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 'login');
    expect(res.body.token).toBeUndefined();
  });

  test('login aceita e-mail com maiúsculas e espaços', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario()));
    await login('  Ana@Teste.COM ', SENHA);
    expect(pool.query.mock.calls[0][1]).toEqual(['ana@teste.com']);
  });

  test('senha errada e e-mail inexistente dão a mesma resposta (não revela quem tem conta)', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario()));
    const senhaErrada = await login('ana@teste.com', 'Outra@2026');
    pool.query.mockResolvedValueOnce(linhas());
    const semConta = await login('ninguem@teste.com', SENHA);

    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(senhaErrada.body.erro).toBe(semConta.body.erro);
  });

  test('login sem e-mail ou senha é recusado', async () => {
    expect((await login('', SENHA)).status).toBe(400);
  });

  test('conta anonimizada (excluída) não entra mais', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario({ anonimizada_em: new Date() })));
    expect((await login('ana@teste.com', SENHA)).status).toBe(401);
  });

  test('se o e-mail do código não sai, o login avisa em vez de dar erro genérico', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario()));
    criarDesafio.mockRejectedValueOnce(new Error('SMTP fora'));
    const res = await login('ana@teste.com', SENHA);
    expect(res.status).toBe(503);
  });

  test('código de 6 dígitos correto abre a sessão (token válido por 7 dias)', async () => {
    verificarCodigo.mockResolvedValueOnce({ ok: true, usuarioId: 5 });
    pool.query.mockResolvedValueOnce(linhas(usuario()));

    const res = await request(appAuth).post('/api/auth/verificar-codigo').send({ desafio: 'abc', codigo: '123456' });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload.id).toBe(5);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);
    expect(res.body.usuario).not.toHaveProperty('senha');
  });

  test('código com menos de 6 dígitos é recusado sem consultar o banco', async () => {
    const res = await request(appAuth).post('/api/auth/verificar-codigo').send({ desafio: 'abc', codigo: '123' });
    expect(res.status).toBe(400);
    expect(verificarCodigo).not.toHaveBeenCalled();
  });

  test('código errado devolve o erro da verificação', async () => {
    verificarCodigo.mockResolvedValueOnce({ ok: false, status: 400, erro: 'Código incorreto.' });
    const res = await request(appAuth).post('/api/auth/verificar-codigo').send({ desafio: 'abc', codigo: '000000' });
    expect(res.status).toBe(400);
  });

  test('conta suspensa não recebe sessão mesmo com o código certo', async () => {
    verificarCodigo.mockResolvedValueOnce({ ok: true, usuarioId: 5 });
    pool.query.mockResolvedValueOnce(linhas(usuario({ status_conta: 'suspensa' })));
    const res = await request(appAuth).post('/api/auth/verificar-codigo').send({ desafio: 'abc', codigo: '123456' });
    expect(res.status).toBe(403);
  });

  test('reenvio do código repassa a resposta da verificação', async () => {
    reenviarCodigo.mockResolvedValueOnce({ ok: true });
    expect((await request(appAuth).post('/api/auth/reenviar-codigo').send({ desafio: 'abc' })).status).toBe(200);
    reenviarCodigo.mockResolvedValueOnce({ ok: false, status: 429, erro: 'Aguarde 30 segundos' });
    expect((await request(appAuth).post('/api/auth/reenviar-codigo').send({ desafio: 'abc' })).status).toBe(429);
  });

  // ── Recuperação de senha por token ──
  test('recuperação de senha envia link por e-mail e guarda só o hash do token, válido por 1 hora', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario())).mockResolvedValueOnce(linhas());
    const antes = Date.now();
    const res = await request(appAuth).post('/api/auth/recuperar-senha').send({ email: 'ana@teste.com' });

    expect(res.status).toBe(200);
    const [hashGuardado, expiraEm] = pool.query.mock.calls[1][1];
    const tokenNoEmail = enviarEmail.mock.calls[0][2].match(/token=([a-f0-9]{64})/)[1];
    expect(hashGuardado).toBe(sha256(tokenNoEmail));
    expect(expiraEm.getTime() - antes).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(expiraEm.getTime() - antes).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  test('recuperação para e-mail que não existe responde igual e não envia nada', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario())).mockResolvedValueOnce(linhas());
    const comConta = await request(appAuth).post('/api/auth/recuperar-senha').send({ email: 'ana@teste.com' });
    enviarEmail.mockClear();
    pool.query.mockResolvedValueOnce(linhas());
    const semConta = await request(appAuth).post('/api/auth/recuperar-senha').send({ email: 'x@teste.com' });

    expect(semConta.body).toEqual(comConta.body);
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  test('recuperação sem e-mail é recusada', async () => {
    expect((await request(appAuth).post('/api/auth/recuperar-senha').send({})).status).toBe(400);
  });

  test('link de recuperação válido é aceito e link expirado é recusado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ 1: 1 }));
    const valido = await request(appAuth).get('/api/auth/redefinir-senha/validar').query({ token: 'abc' });
    pool.query.mockResolvedValueOnce(linhas());
    const expirado = await request(appAuth).get('/api/auth/redefinir-senha/validar').query({ token: 'abc' });
    const semToken = await request(appAuth).get('/api/auth/redefinir-senha/validar');

    expect(valido.body.valido).toBe(true);
    expect(expirado.body.valido).toBe(false);
    expect(semToken.body.valido).toBe(false);
    expect(pool.query.mock.calls[0][0]).toMatch(/reset_senha_expira > NOW\(\)/);
  });

  test('redefinir senha troca a senha e invalida o link (uso único)', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario())).mockResolvedValueOnce(linhas());
    const res = await request(appAuth).post('/api/auth/redefinir-senha').send({ token: 'abc', novaSenha: 'Vizinho#2027' });

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toMatch(/reset_senha_token = NULL/);
    expect(await bcrypt.compare('Vizinho#2027', params[0])).toBe(true);
  });

  test('redefinir com link inválido ou expirado é recusado', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appAuth).post('/api/auth/redefinir-senha').send({ token: 'velho', novaSenha: 'Vizinho#2027' });
    expect(res.status).toBe(400);
  });

  test('a nova senha também precisa seguir a política de senhas', async () => {
    pool.query.mockResolvedValueOnce(linhas(usuario()));
    const res = await request(appAuth).post('/api/auth/redefinir-senha').send({ token: 'abc', novaSenha: 'senhafraca' });
    expect(res.status).toBe(400);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('redefinir sem token ou sem senha é recusado', async () => {
    expect((await request(appAuth).post('/api/auth/redefinir-senha').send({ token: 'abc' })).status).toBe(400);
  });

  // ── Login com Google ──
  describe('login com Google', () => {
    const respostaFetch = (ok, corpo) => ({ ok, json: async () => corpo });
    const GOOGLE_ID = '113184048014-ramhhojnofdd511oh1nl3h2ibono7581.apps.googleusercontent.com';
    const loginGoogle = () => request(appAuth).post('/api/auth/google').send({ credential: 'tok' });

    beforeEach(() => { global.fetch = jest.fn(); });

    test('conta Google verificada e cadastrada entra direto', async () => {
      fetch.mockResolvedValueOnce(respostaFetch(true, { aud: GOOGLE_ID }))
        .mockResolvedValueOnce(respostaFetch(true, { email: 'Ana@Teste.com', email_verified: true }));
      pool.query.mockResolvedValueOnce(linhas(usuario()));

      const res = await loginGoogle();
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(pool.query.mock.calls[0][1]).toEqual(['ana@teste.com']);
    });

    test('token do Google emitido para outro site é recusado', async () => {
      fetch.mockResolvedValueOnce(respostaFetch(true, { aud: 'outro-site' }));
      expect((await loginGoogle()).status).toBe(401);
    });

    test('conta Google sem e-mail verificado é recusada', async () => {
      fetch.mockResolvedValueOnce(respostaFetch(true, { aud: GOOGLE_ID }))
        .mockResolvedValueOnce(respostaFetch(true, { email: 'ana@teste.com', email_verified: false }));
      expect((await loginGoogle()).status).toBe(401);
    });

    test('e-mail do Google sem cadastro pede para criar a conta', async () => {
      fetch.mockResolvedValueOnce(respostaFetch(true, { aud: GOOGLE_ID }))
        .mockResolvedValueOnce(respostaFetch(true, { email: 'novo@teste.com', email_verified: true }));
      pool.query.mockResolvedValueOnce(linhas());
      const res = await loginGoogle();
      expect(res.status).toBe(404);
      expect(res.body.precisaCadastro).toBe(true);
    });

    test('token do Google inválido ou expirado é recusado', async () => {
      fetch.mockResolvedValueOnce(respostaFetch(false, {}));
      expect((await loginGoogle()).status).toBe(401);
    });

    test('sem token do Google a requisição é recusada', async () => {
      expect((await request(appAuth).post('/api/auth/google').send({})).status).toBe(400);
    });
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF15 - Chat Interno', () => {
  const conversa = (extra = {}) => ({
    id: 3, anuncio_id: 10, comprador_id: COMPRADOR, vendedor_id: VENDEDOR,
    anuncio_titulo: 'Bicicleta', anuncio_preco: '800.00', anuncio_status: 'ativo', ...extra,
  });

  test('lista só as conversas do usuário e soma as mensagens não lidas', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 3, nao_lidas: 2 }, { id: 4, nao_lidas: 1 }));
    const res = await request(appChat).get('/api/conversas').set('Authorization', tokenDe(COMPRADOR));

    expect(res.body.total_nao_lidas).toBe(3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/c\.comprador_id = \$1 OR c\.vendedor_id = \$1/);
    expect(params).toEqual([COMPRADOR]);
  });

  test('mensagens vêm em ordem de envio e as recebidas são marcadas como lidas', async () => {
    pool.query
      .mockResolvedValueOnce(linhas(conversa()))
      .mockResolvedValueOnce(linhas({ id: 12 }, { id: 11 }, { id: 10 }))
      .mockResolvedValueOnce(linhas());

    const res = await request(appChat).get('/api/conversas/3/mensagens').set('Authorization', tokenDe(COMPRADOR));

    expect(res.body.mensagens.map((m) => m.id)).toEqual([10, 11, 12]);
    expect(res.body.conversa.meu_papel).toBe('comprador');
    const [sqlLidas, paramsLidas] = pool.query.mock.calls[2];
    expect(sqlLidas).toMatch(/SET lida = TRUE/);
    expect(sqlLidas).toMatch(/remetente_id <> \$2/);
    expect(paramsLidas).toEqual(['3', COMPRADOR]);
  });

  test('atualização busca só as mensagens novas', async () => {
    pool.query
      .mockResolvedValueOnce(linhas(conversa()))
      .mockResolvedValueOnce(linhas({ id: 13 }))
      .mockResolvedValueOnce(linhas());

    const res = await request(appChat).get('/api/conversas/3/mensagens')
      .query({ depois_de: 12 }).set('Authorization', tokenDe(VENDEDOR));

    expect(pool.query.mock.calls[1][0]).toMatch(/id > \$2/);
    expect(res.body.tem_mais).toBe(false);
    expect(res.body.conversa.meu_papel).toBe('vendedor');
  });

  test('quem não participa da conversa não lê as mensagens', async () => {
    pool.query.mockResolvedValueOnce(linhas(conversa()));
    const res = await request(appChat).get('/api/conversas/3/mensagens').set('Authorization', tokenDe(ESTRANHO));
    expect(res.status).toBe(403);
  });

  test('conversa inexistente retorna 404', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appChat).get('/api/conversas/99/mensagens').set('Authorization', tokenDe(COMPRADOR));
    expect(res.status).toBe(404);
  });

  const enviar = (usuario, conteudo) => request(appChat).post('/api/conversas/3/mensagens')
    .set('Authorization', tokenDe(usuario)).send({ conteudo });

  test('participante envia mensagem e a conversa sobe para o topo', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, anuncio_titulo: 'Bicicleta', remetente_nome: 'Ana' }))
      .mockResolvedValueOnce(linhas({ id: 20, conteudo: 'Ainda está disponível?' }))
      .mockResolvedValueOnce(linhas());

    const res = await enviar(COMPRADOR, '  Ainda está disponível?  ');

    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[1][1]).toEqual(['3', COMPRADOR, 'Ainda está disponível?']);
    expect(pool.query.mock.calls[2][0]).toMatch(/ultima_mensagem_em = NOW\(\)/);
  });

  test('mensagem vazia é recusada', async () => {
    expect((await enviar(COMPRADOR, '   ')).status).toBe(400);
  });

  test('mensagem com mais de 1000 caracteres é recusada', async () => {
    expect((await enviar(COMPRADOR, 'a'.repeat(1001))).status).toBe(400);
  });

  test('quem não participa da conversa não envia mensagem', async () => {
    pool.query.mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, anuncio_titulo: 'x', remetente_nome: 'Zé' }));
    expect((await enviar(ESTRANHO, 'oi')).status).toBe(403);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF18 - Notificações ao Usuário', () => {
  test('nova mensagem no chat notifica o outro participante', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ comprador_id: COMPRADOR, vendedor_id: VENDEDOR, anuncio_titulo: 'Bicicleta', remetente_nome: 'Ana' }))
      .mockResolvedValueOnce(linhas({ id: 20 }))
      .mockResolvedValueOnce(linhas());

    await request(appChat).post('/api/conversas/3/mensagens')
      .set('Authorization', tokenDe(COMPRADOR)).send({ conteudo: 'Ainda está disponível?' });

    expect(criarNotificacao).toHaveBeenCalledWith(
      VENDEDOR, 'nova_mensagem', 'Nova mensagem de Ana', expect.stringContaining('Bicicleta'),
      '/mensagens', expect.objectContaining({ citacao: 'Ainda está disponível?' }),
    );
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF21 - Canal de Denúncias', () => {
  const denunciar = (dados, usuario = COMPRADOR) => request(appDenuncia).post('/api/denuncias')
    .set('Authorization', tokenDe(usuario)).send(dados);

  test('denúncia de anúncio registra também o vendedor denunciado (perfil)', async () => {
    pool.query
      .mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR }))
      .mockResolvedValueOnce(linhas({ id: 1, status: 'pendente' }));

    const res = await denunciar({ anuncio_id: 10, motivo: 'fraude', descricao: 'Pediu pagamento por fora' });

    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[1][1]).toEqual([COMPRADOR, 10, VENDEDOR, 'fraude', 'Pediu pagamento por fora']);
  });

  test.each(['conteudo_inadequado', 'fraude', 'violacao_termos', 'outro'])('aceita o motivo "%s"', async (motivo) => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR })).mockResolvedValueOnce(linhas({ id: 1 }));
    expect((await denunciar({ anuncio_id: 10, motivo })).status).toBe(201);
  });

  test('motivo fora da lista é recusado', async () => {
    expect((await denunciar({ anuncio_id: 10, motivo: 'nao_gostei' })).status).toBe(400);
  });

  test('denúncia sem anúncio nem usuário é recusada', async () => {
    expect((await denunciar({ motivo: 'fraude' })).status).toBe(400);
  });

  test('não é possível denunciar o próprio anúncio', async () => {
    pool.query.mockResolvedValueOnce(linhas({ vendedor_id: VENDEDOR }));
    expect((await denunciar({ anuncio_id: 10, motivo: 'fraude' }, VENDEDOR)).status).toBe(400);
  });

  test('não é possível denunciar a si mesmo', async () => {
    expect((await denunciar({ usuario_denunciado_id: COMPRADOR, motivo: 'fraude' })).status).toBe(400);
  });

  test('anúncio inexistente retorna 404', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    expect((await denunciar({ anuncio_id: 999, motivo: 'fraude' })).status).toBe(404);
  });

  test('descrição com mais de 1000 caracteres é recusada', async () => {
    expect((await denunciar({ anuncio_id: 10, motivo: 'outro', descricao: 'a'.repeat(1001) })).status).toBe(400);
  });

  test('usuário acompanha só as próprias denúncias e a resposta da equipe', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 1, status: 'resolvida', resolucao: 'Anúncio removido' }));
    const res = await request(appDenuncia).get('/api/denuncias').set('Authorization', tokenDe(COMPRADOR));
    expect(res.body.denuncias[0].resolucao).toBe('Anúncio removido');
    expect(pool.query.mock.calls[0][1]).toEqual([COMPRADOR]);
  });

  test('denunciar exige login', async () => {
    expect((await request(appDenuncia).post('/api/denuncias').send({ anuncio_id: 10, motivo: 'fraude' })).status).toBe(401);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF25 - Central de Ajuda', () => {
  const abrirChamado = (dados) => request(appDenuncia).post('/api/suporte')
    .set('Authorization', tokenDe(COMPRADOR)).send(dados);

  test.each(['duvida_conta', 'anuncio', 'pagamento', 'denuncia_seguranca', 'outro'])(
    'abre chamado com o assunto "%s"', async (assunto) => {
      pool.query.mockResolvedValueOnce(linhas({ id: 1, assunto, status: 'aberta' }));
      expect((await abrirChamado({ assunto, mensagem: 'Não consigo editar meu anúncio' })).status).toBe(201);
    },
  );

  test('assunto fora da lista é recusado', async () => {
    expect((await abrirChamado({ assunto: 'reclamacao', mensagem: 'oi' })).status).toBe(400);
  });

  test('chamado sem mensagem é recusado', async () => {
    expect((await abrirChamado({ assunto: 'outro', mensagem: '   ' })).status).toBe(400);
  });

  test('mensagem com mais de 2000 caracteres é recusada', async () => {
    expect((await abrirChamado({ assunto: 'outro', mensagem: 'a'.repeat(2001) })).status).toBe(400);
  });

  test('usuário vê só os próprios chamados com a resposta da equipe', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 1, resposta: 'Resolvido, tente de novo.' }));
    const res = await request(appDenuncia).get('/api/suporte').set('Authorization', tokenDe(COMPRADOR));
    expect(res.body.solicitacoes[0].resposta).toMatch(/Resolvido/);
    expect(pool.query.mock.calls[0][1]).toEqual([COMPRADOR]);
  });
});
