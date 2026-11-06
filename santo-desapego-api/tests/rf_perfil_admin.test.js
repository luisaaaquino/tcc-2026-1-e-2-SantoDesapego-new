jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('mercadopago', () => ({ MercadoPagoConfig: jest.fn(), OAuth: jest.fn(() => ({})), Preference: jest.fn(), Payment: jest.fn() }));

const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../db');
const { TERMOS_VERSAO_ATUAL } = require('../utils/termos');
const { montarApp, tokenDe, linhas } = require('./helpers');

const appUsuario = montarApp(require('../routes/usuario'));
const appFavoritos = montarApp(require('../routes/favoritos'));
const appAdmin = montarApp(require('../routes/admin'));

const USUARIO = 1;
const ADMIN = 100;
const SENHA = 'Desapego@2026';
const HASH_SENHA = bcrypt.hashSync(SENHA, 4);

// Responde cada consulta pelo primeiro padrão de SQL que bater
const responderPorSql = (respostas) => pool.query.mockImplementation(async (sql) => {
  for (const [padrao, resposta] of respostas) {
    if (new RegExp(padrao).test(sql)) return typeof resposta === 'function' ? resposta() : resposta;
  }
  return linhas();
});

const sqls = () => pool.query.mock.calls.map(([sql]) => sql);
const chamadaCom = (padrao) => pool.query.mock.calls.find(([sql]) => new RegExp(padrao).test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
});

/* ─────────────────────────────────────────────────────────── */
describe('RF03 - Aceite de Termos e Política de Privacidade', () => {
  test('perfil avisa quando o usuário aceitou uma versão antiga dos termos', async () => {
    responderPorSql([['FROM usuarios WHERE id', linhas({ id: USUARIO, termos_versao: '0.9' })]]);
    const res = await request(appUsuario).get('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO));
    expect(res.body.usuario.termos_atualizados).toBe(true);
    expect(res.body.usuario.termos_versao_atual).toBe(TERMOS_VERSAO_ATUAL);
  });

  test('perfil não pede novo aceite quando a versão aceita é a atual', async () => {
    responderPorSql([['FROM usuarios WHERE id', linhas({ id: USUARIO, termos_versao: TERMOS_VERSAO_ATUAL })]]);
    const res = await request(appUsuario).get('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO));
    expect(res.body.usuario.termos_atualizados).toBe(false);
  });

  test('novo aceite registra a versão atual com data e hora', async () => {
    pool.query.mockResolvedValueOnce(linhas({ termos_versao: TERMOS_VERSAO_ATUAL, termos_aceitos_em: '2026-11-06' }));
    const res = await request(appUsuario).put('/api/usuario/aceitar-termos').set('Authorization', tokenDe(USUARIO));

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/termos_aceitos_em = NOW\(\)/);
    expect(params).toEqual([TERMOS_VERSAO_ATUAL, USUARIO]);
  });

  test('o admin vê quem está com o aceite desatualizado', async () => {
    responderPorSql([
      ['^SELECT papel FROM usuarios', linhas({ papel: 'administrador' })],
      ['SELECT COUNT', linhas({ count: '2' })],
      ['FROM usuarios WHERE 1=1', linhas({ id: 1, termos_versao: '0.9' }, { id: 2, termos_versao: TERMOS_VERSAO_ATUAL })],
    ]);
    const res = await request(appAdmin).get('/api/admin/usuarios').set('Authorization', tokenDe(ADMIN));
    expect(res.body.usuarios.map((u) => u.termos_atualizados)).toEqual([true, false]);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF04 - Gestão de Dados Pessoais (LGPD)', () => {
  const dados = {
    id: USUARIO, nome: 'Ana', sobrenome: 'Lima', cpf: '52998224725', telefone: null,
    email: 'ana@teste.com', cep: '04710150', bairro: 'Santo Amaro Centro', complemento: 'Apto "B"',
  };

  test('usuário visualiza os próprios dados no perfil', async () => {
    responderPorSql([['FROM usuarios WHERE id', linhas(dados)]]);
    const res = await request(appUsuario).get('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO));
    expect(res.body.usuario.email).toBe('ana@teste.com');
    expect(pool.query.mock.calls[0][1]).toEqual([USUARIO]);
  });

  test('exporta os dados em JSON com a base legal da LGPD', async () => {
    pool.query.mockResolvedValueOnce(linhas(dados));
    const res = await request(appUsuario).get('/api/usuario/exportar').set('Authorization', tokenDe(USUARIO));

    expect(res.status).toBe(200);
    expect(res.body.usuario).toEqual(dados);
    expect(res.body.base_legal).toMatch(/13\.709\/2018/);
    expect(new Date(res.body.exportadoEm).toString()).not.toBe('Invalid Date');
  });

  test('exporta os dados em CSV, pronto para abrir no Excel', async () => {
    pool.query.mockResolvedValueOnce(linhas(dados));
    const res = await request(appUsuario).get('/api/usuario/exportar').query({ formato: 'CSV' }).set('Authorization', tokenDe(USUARIO));

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/santo-desapego-meus-dados\.csv/);
    const [cabecalho, valores] = res.text.replace(/^﻿/, '').split('\n');
    expect(cabecalho).toBe(Object.keys(dados).map((c) => `"${c}"`).join(','));
    expect(valores).toContain('"Apto ""B"""'); // aspas escapadas
    expect(valores).toContain('""'); // campo vazio (telefone)
  });

  test('exportação de usuário inexistente retorna 404', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    expect((await request(appUsuario).get('/api/usuario/exportar').set('Authorization', tokenDe(USUARIO))).status).toBe(404);
  });

  const excluir = (senhaConfirmacao) => request(appUsuario).delete('/api/usuario/conta')
    .set('Authorization', tokenDe(USUARIO)).send({ senhaConfirmacao });

  test('excluir a conta exige confirmar a senha', async () => {
    expect((await excluir(undefined)).status).toBe(400);
  });

  test('senha errada não exclui a conta', async () => {
    pool.query.mockResolvedValueOnce(linhas({ senha: HASH_SENHA }));
    expect((await excluir('Errada@2026')).status).toBe(401);
    expect(sqls().join()).not.toMatch(/DELETE|anonimizada_em/);
  });

  test('conta sem transações é excluída', async () => {
    responderPorSql([['SELECT senha', linhas({ senha: HASH_SENHA })], ['FROM compras', linhas()]]);
    const res = await excluir(SENHA);
    expect(res.body.anonimizada).toBe(false);
    expect(chamadaCom('DELETE FROM usuarios')).toBeDefined();
  });

  test('conta com transações é anonimizada e o usuário é avisado do motivo', async () => {
    responderPorSql([['SELECT senha', linhas({ senha: HASH_SENHA })], ['FROM compras', linhas({ 1: 1 })]]);
    const res = await excluir(SENHA);
    expect(res.body.anonimizada).toBe(true);
    expect(res.body.mensagem).toMatch(/5 anos/);
  });

  test('atualiza os dados cadastrais do perfil', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: USUARIO, nome: 'Ana' }));
    const res = await request(appUsuario).put('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO))
      .send({ nome: ' Ana ', sobrenome: 'Lima', bairro: 'Brooklin' });
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1].slice(0, 2)).toEqual(['Ana', 'Lima']);
  });

  test('perfil sem nome ou sobrenome é recusado', async () => {
    const res = await request(appUsuario).put('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO)).send({ nome: 'Ana' });
    expect(res.status).toBe(400);
  });

  test('troca e remoção da foto de perfil', async () => {
    pool.query.mockResolvedValue(linhas());
    const trocar = await request(appUsuario).put('/api/usuario/foto').set('Authorization', tokenDe(USUARIO))
      .send({ foto_perfil: 'data:image/jpeg;base64,AAAA' });
    const remover = await request(appUsuario).put('/api/usuario/foto').set('Authorization', tokenDe(USUARIO))
      .send({ foto_perfil: null });
    expect(trocar.body.mensagem).toBe('Foto atualizada!');
    expect(remover.body.mensagem).toBe('Foto removida!');
  });

  test.each([
    ['grande demais', `data:image/jpeg;base64,${'A'.repeat(700001)}`],
    ['que não é imagem', 'data:application/pdf;base64,AAAA'],
    ['em formato inválido', 12345],
  ])('foto %s é recusada', async (_caso, foto_perfil) => {
    const res = await request(appUsuario).put('/api/usuario/foto').set('Authorization', tokenDe(USUARIO)).send({ foto_perfil });
    expect(res.status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN03 - Política de Senhas Robustas', () => {
  const trocar = (senhaAtual, novaSenha) => {
    pool.query.mockResolvedValueOnce(linhas({ nome: 'Ana', sobrenome: 'Lima', senha: HASH_SENHA })).mockResolvedValueOnce(linhas());
    return request(appUsuario).put('/api/usuario/senha').set('Authorization', tokenDe(USUARIO)).send({ senhaAtual, novaSenha });
  };

  test('alteração de senha aceita senha nova que segue a política', async () => {
    const res = await trocar(SENHA, 'Vizinho#2027');
    expect(res.status).toBe(200);
    expect(await bcrypt.compare('Vizinho#2027', pool.query.mock.calls[1][1][0])).toBe(true);
  });

  test('alteração de senha recusa senha nova fraca', async () => {
    expect((await trocar(SENHA, 'vizinho2027')).status).toBe(400);
  });

  test('alteração de senha exige a senha atual correta', async () => {
    expect((await trocar('Errada@2026', 'Vizinho#2027')).status).toBe(401);
  });

  test('a senha nova precisa ser diferente da atual', async () => {
    const res = await trocar(SENHA, SENHA);
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/diferente/);
  });

  test('alteração sem informar as duas senhas é recusada', async () => {
    const res = await request(appUsuario).put('/api/usuario/senha').set('Authorization', tokenDe(USUARIO)).send({ novaSenha: 'x' });
    expect(res.status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF05 - Perfil Público do Usuário', () => {
  const perfilPublico = () => {
    responderPorSql([
      ['FROM usuarios WHERE id', linhas({ id: 2, nome: 'Caio', sobrenome: 'Souza', foto_perfil: null, data_cadastro: '2026-03-01' })],
      ['FROM avaliacoes', linhas({ media: 4.5, total: '8' })],
      ['FROM compras', linhas({ total: '11' })],
      ['FROM anuncios a', linhas({ id: 10, titulo: 'Bicicleta' })],
    ]);
    return request(appUsuario).get('/api/usuarios/2/publico');
  };

  test('mostra nome, reputação, número de transações e tempo de cadastro', async () => {
    const res = await perfilPublico();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      usuario: { nome_exibicao: 'Caio Souza', membro_desde: '2026-03-01' },
      reputacao: { media: 4.5, total_avaliacoes: 8 },
      total_transacoes: 11,
    });
    expect(res.body.anuncios_ativos).toHaveLength(1);
  });

  test('não expõe dados pessoais (e-mail, CPF, telefone, endereço)', async () => {
    const res = await perfilPublico();
    expect(chamadaCom('FROM usuarios WHERE id')[0]).not.toMatch(/email|cpf|telefone|cep|logradouro/);
    expect(JSON.stringify(res.body)).not.toMatch(/email|cpf|telefone|logradouro/);
  });

  test('mostra só os anúncios ativos do vendedor', async () => {
    await perfilPublico();
    expect(chamadaCom('FROM anuncios a')[0]).toMatch(/a\.status = 'ativo'/);
  });

  test('conta anonimizada não tem perfil público', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appUsuario).get('/api/usuarios/2/publico');
    expect(res.status).toBe(404);
    expect(pool.query.mock.calls[0][0]).toMatch(/anonimizada_em IS NULL/);
  });

  test('id inválido é recusado', async () => {
    expect((await request(appUsuario).get('/api/usuarios/abc/publico')).status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF10 - Favoritos e Itens Salvos', () => {
  test('salva um anúncio nos favoritos', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 10 })).mockResolvedValueOnce(linhas());
    const res = await request(appFavoritos).post('/api/favoritos').set('Authorization', tokenDe(USUARIO)).send({ anuncio_id: 10 });
    expect(res.status).toBe(201);
    expect(res.body.favoritado).toBe(true);
  });

  test('favoritar duas vezes o mesmo anúncio não duplica', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 10 })).mockResolvedValueOnce(linhas());
    await request(appFavoritos).post('/api/favoritos').set('Authorization', tokenDe(USUARIO)).send({ anuncio_id: 10 });
    expect(pool.query.mock.calls[1][0]).toMatch(/ON CONFLICT \(usuario_id, anuncio_id\) DO NOTHING/);
  });

  test('não favorita anúncio inexistente', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appFavoritos).post('/api/favoritos').set('Authorization', tokenDe(USUARIO)).send({ anuncio_id: 999 });
    expect(res.status).toBe(404);
  });

  test('favoritar sem informar o anúncio é recusado', async () => {
    const res = await request(appFavoritos).post('/api/favoritos').set('Authorization', tokenDe(USUARIO)).send({});
    expect(res.status).toBe(400);
  });

  test('lista os favoritos do usuário, do mais recente para o mais antigo', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 10 }, { id: 11 }));
    const res = await request(appFavoritos).get('/api/favoritos').set('Authorization', tokenDe(USUARIO));
    expect(res.body.favoritos).toHaveLength(2);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY f\.criado_em DESC/);
    expect(params).toEqual([USUARIO]);
  });

  test('remove um anúncio dos favoritos (só da própria lista)', async () => {
    pool.query.mockResolvedValueOnce(linhas());
    const res = await request(appFavoritos).delete('/api/favoritos/10').set('Authorization', tokenDe(USUARIO));
    expect(res.body.favoritado).toBe(false);
    expect(pool.query.mock.calls[0][1]).toEqual([USUARIO, '10']);
  });

  test('favoritos exigem login', async () => {
    expect((await request(appFavoritos).get('/api/favoritos')).status).toBe(401);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF13 - Painel do Vendedor', () => {
  test('lista todos os anúncios do vendedor, em qualquer estado', async () => {
    pool.query.mockResolvedValueOnce(linhas({ id: 1, status: 'ativo' }, { id: 2, status: 'pausado' }, { id: 3, status: 'vendido' }));
    const res = await request(appUsuario).get('/api/usuario/anuncios').set('Authorization', tokenDe(USUARIO));

    expect(res.body.anuncios.map((a) => a.status)).toEqual(['ativo', 'pausado', 'vendido']);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE a\.vendedor_id = \$1/);
    expect(sql).not.toMatch(/a\.status =/);
    expect(params).toEqual([USUARIO]);
  });

  test('o perfil traz o resumo de anúncios, compras e reputação', async () => {
    responderPorSql([
      ['FROM usuarios WHERE id', linhas({ id: USUARIO, termos_versao: TERMOS_VERSAO_ATUAL })],
      ['FROM anuncios WHERE vendedor_id', linhas({ anuncios_ativos: '4', anuncios_vendidos: '2', anuncios_pausados: '1' })],
      ['FROM compras', linhas({ total: '3' })],
      ['FROM avaliacoes', linhas({ media: 4.8, total: '5' })],
    ]);
    const res = await request(appUsuario).get('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO));
    expect(res.body.estatisticas).toMatchObject({
      anuncios_ativos: 4, anuncios_vendidos: 2, anuncios_pausados: 1,
      compras_realizadas: 3, reputacao_media: 4.8, total_avaliacoes: 5,
    });
  });

  test('vendedor sem avaliações fica sem média (não aparece nota zero)', async () => {
    responderPorSql([
      ['FROM usuarios WHERE id', linhas({ id: USUARIO })],
      ['FROM avaliacoes', linhas({ media: null, total: '0' })],
    ]);
    const res = await request(appUsuario).get('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO));
    expect(res.body.estatisticas.reputacao_media).toBeNull();
    expect(res.body.estatisticas.anuncios_ativos).toBe(0);
  });

  test('vê as avaliações recebidas com a média', async () => {
    responderPorSql([
      ['AVG\\(nota\\)', linhas({ media: 4.5, total: '2' })],
      ['FROM avaliacoes av', linhas({ id: 1, nota: 5 }, { id: 2, nota: 4 })],
    ]);
    const res = await request(appUsuario).get('/api/usuario/avaliacoes').set('Authorization', tokenDe(USUARIO));
    expect(res.body).toMatchObject({ media: 4.5, total: 2 });
    expect(res.body.avaliacoes).toHaveLength(2);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF22 - Newsletter', () => {
  test.each([[true, true], [false, false], ['sim', false]])(
    'opt-in da newsletter enviado como %s grava %s', async (enviado, gravado) => {
      pool.query.mockResolvedValueOnce(linhas({ id: USUARIO }));
      await request(appUsuario).put('/api/usuario/perfil').set('Authorization', tokenDe(USUARIO))
        .send({ nome: 'Ana', sobrenome: 'Lima', recebe_newsletter: enviado });
      expect(pool.query.mock.calls[0][1][8]).toBe(gravado);
    },
  );
});

/* ─────────────────────────────────────────────────────────── */
describe('RF20 - Módulo Administrativo', () => {
  const admin = (respostas = []) => responderPorSql([
    ['^SELECT papel FROM usuarios WHERE id = \\$1$', linhas({ papel: 'administrador' })],
    ...respostas,
  ]);
  const logsGravados = () => pool.query.mock.calls
    .filter(([sql]) => /INSERT INTO logs_auditoria/.test(sql))
    .map(([, p]) => ({ admin: p[0], acao: p[1], alvo: p[2] }));

  // ── Acesso ──
  test('usuário comum não acessa o painel administrativo', async () => {
    responderPorSql([['SELECT papel', linhas({ papel: 'usuario' })]]);
    expect((await request(appAdmin).get('/api/admin/dashboard').set('Authorization', tokenDe(USUARIO))).status).toBe(403);
  });

  test('visitante sem login não acessa o painel', async () => {
    expect((await request(appAdmin).get('/api/admin/dashboard')).status).toBe(401);
  });

  test('o painel mostra o resumo da plataforma', async () => {
    admin([
      ['status_conta = .suspensa', linhas({ total: '50', suspensos: '2' })],
      ['FROM anuncios$', linhas({ total: '30', ativos: '20', pausados: '5', vendidos: '5' })],
      ['FROM compras', linhas({ total: '5', volume: '1234.50' })],
      ['FROM denuncias', linhas({ pendentes: '3', total: '7' })],
      ['GROUP BY c\\.id', linhas({ nome: 'Móveis', total: '9' })],
      ['generate_series', linhas({ dia: '2026-11-06', total: '4' })],
      ['FROM mensagens_suporte', linhas({ pendentes: '1', total: '4' })],
    ]);
    const res = await request(appAdmin).get('/api/admin/dashboard').set('Authorization', tokenDe(ADMIN));
    expect(res.body).toMatchObject({
      usuarios: { total: 50, suspensos: 2 },
      anuncios: { total: 30, ativos: 20, pausados: 5, vendidos: 5 },
      compras: { total: 5, volume: 1234.5 },
      denuncias: { pendentes: 3 },
      top_categorias: [{ nome: 'Móveis', total: 9 }],
    });
  });

  // ── Usuários ──
  test('busca usuários por nome ou e-mail e por situação da conta', async () => {
    admin([['SELECT COUNT', linhas({ count: '1' })], ['FROM usuarios WHERE 1=1', linhas({ id: 1 })]]);
    await request(appAdmin).get('/api/admin/usuarios').query({ busca: 'ana', status: 'suspensa' }).set('Authorization', tokenDe(ADMIN));
    const [sql, params] = chamadaCom('ORDER BY data_cadastro');
    expect(sql).toMatch(/nome ILIKE \$1 OR sobrenome ILIKE \$1 OR email ILIKE \$1/);
    expect(params.slice(0, 2)).toEqual(['%ana%', 'suspensa']);
  });

  test('suspende a conta de um usuário e registra no log de auditoria (RN02)', async () => {
    admin([['SELECT papel, nome, email', linhas({ papel: 'usuario', nome: 'Zé', email: 'ze@t.com' })]]);
    const res = await request(appAdmin).put('/api/admin/usuarios/5/suspender').set('Authorization', tokenDe(ADMIN)).send({ motivo: 'Fraude' });

    expect(res.status).toBe(200);
    expect(sqls()).toContain("UPDATE usuarios SET status_conta = 'suspensa' WHERE id = $1");
    expect(logsGravados()).toEqual([{ admin: ADMIN, acao: 'suspender_usuario', alvo: 'usuario' }]);
  });

  test('admin não suspende a própria conta nem outro admin', async () => {
    admin([['SELECT papel, nome, email', linhas({ papel: 'administrador', nome: 'Outro', email: 'o@t.com' })]]);
    expect((await request(appAdmin).put(`/api/admin/usuarios/${ADMIN}/suspender`).set('Authorization', tokenDe(ADMIN)).send({})).status).toBe(400);
    expect((await request(appAdmin).put('/api/admin/usuarios/101/suspender').set('Authorization', tokenDe(ADMIN)).send({})).status).toBe(400);
  });

  test('reativa uma conta suspensa', async () => {
    admin([['SELECT nome, email', linhas({ nome: 'Zé', email: 'ze@t.com' })]]);
    const res = await request(appAdmin).put('/api/admin/usuarios/5/reativar').set('Authorization', tokenDe(ADMIN));
    expect(res.status).toBe(200);
    expect(sqls()).toContain("UPDATE usuarios SET status_conta = 'ativa' WHERE id = $1");
  });

  test('exclusão pelo admin anonimiza quando há transações e registra no log', async () => {
    admin([
      ['SELECT papel, nome, email', linhas({ papel: 'usuario', nome: 'Zé', email: 'ze@t.com' })],
      ['FROM compras', linhas({ 1: 1 })],
    ]);
    const res = await request(appAdmin).delete('/api/admin/usuarios/5').set('Authorization', tokenDe(ADMIN)).send({ motivo: 'LGPD' });
    expect(res.body.anonimizada).toBe(true);
    expect(logsGravados()[0].acao).toBe('anonimizar_usuario');
  });

  test('usuário inexistente retorna 404 na moderação', async () => {
    admin([['SELECT papel, nome, email', linhas()]]);
    expect((await request(appAdmin).delete('/api/admin/usuarios/999').set('Authorization', tokenDe(ADMIN)).send({})).status).toBe(404);
  });

  // ── Anúncios ──
  test('lista anúncios com os mais denunciados primeiro', async () => {
    admin([['SELECT COUNT\\(\\*\\) FROM \\(', linhas({ count: '1' })], ['FROM anuncios a', linhas({ id: 1, total_denuncias: '3' })]]);
    const res = await request(appAdmin).get('/api/admin/anuncios').query({ busca: 'bike', status: 'ativo' }).set('Authorization', tokenDe(ADMIN));
    expect(res.body.anuncios[0].total_denuncias).toBe(3);
    expect(chamadaCom('ORDER BY total_denuncias DESC')).toBeDefined();
  });

  test('pausa um anúncio por moderação', async () => {
    admin([['SELECT titulo, status', linhas({ titulo: 'Bike', status: 'ativo' })]]);
    const res = await request(appAdmin).put('/api/admin/anuncios/10/moderar').set('Authorization', tokenDe(ADMIN)).send({ acao: 'pausar' });
    expect(res.status).toBe(200);
    expect(chamadaCom('UPDATE anuncios SET status')[1]).toEqual(['pausado', '10']);
    expect(logsGravados()[0].acao).toBe('moderar_anuncio');
  });

  test('moderação com ação inválida ou anúncio vendido é recusada', async () => {
    admin([['SELECT titulo, status', linhas({ titulo: 'Bike', status: 'vendido' })]]);
    expect((await request(appAdmin).put('/api/admin/anuncios/10/moderar').set('Authorization', tokenDe(ADMIN)).send({ acao: 'apagar' })).status).toBe(400);
    expect((await request(appAdmin).put('/api/admin/anuncios/10/moderar').set('Authorization', tokenDe(ADMIN)).send({ acao: 'pausar' })).status).toBe(400);
  });

  test('remove anúncio sem compras e bloqueia a remoção de anúncio com compras', async () => {
    admin([['SELECT titulo FROM', linhas({ titulo: 'Bike' })], ['FROM compras', linhas({ count: '0' })]]);
    expect((await request(appAdmin).delete('/api/admin/anuncios/10').set('Authorization', tokenDe(ADMIN)).send({})).status).toBe(200);
    admin([['SELECT titulo FROM', linhas({ titulo: 'Bike' })], ['FROM compras', linhas({ count: '2' })]]);
    expect((await request(appAdmin).delete('/api/admin/anuncios/10').set('Authorization', tokenDe(ADMIN)).send({})).status).toBe(409);
  });

  // ── Categorias ──
  test('lista as categorias com quantos anúncios cada uma tem', async () => {
    admin([['FROM categorias c', linhas({ id: 1, nome: 'Móveis', total_anuncios: '9' })]]);
    const res = await request(appAdmin).get('/api/admin/categorias').set('Authorization', tokenDe(ADMIN));
    expect(res.body.categorias[0].total_anuncios).toBe(9);
  });

  test('cria subcategoria com slug em minúsculas', async () => {
    admin([['INSERT INTO categorias', linhas({ id: 30, nome: 'Bicicletas' })]]);
    const res = await request(appAdmin).post('/api/admin/categorias').set('Authorization', tokenDe(ADMIN))
      .send({ nome: ' Bicicletas ', slug: 'Bicicletas', categoria_pai: 5 });
    expect(res.status).toBe(201);
    expect(chamadaCom('INSERT INTO categorias')[1]).toEqual(['Bicicletas', 'bicicletas', null, 5, 0]);
  });

  test('categoria sem nome ou slug, ou com slug repetido, é recusada', async () => {
    admin();
    expect((await request(appAdmin).post('/api/admin/categorias').set('Authorization', tokenDe(ADMIN)).send({ nome: 'X' })).status).toBe(400);
    admin([['INSERT INTO categorias', () => { throw Object.assign(new Error('dup'), { code: '23505' }); }]]);
    expect((await request(appAdmin).post('/api/admin/categorias').set('Authorization', tokenDe(ADMIN)).send({ nome: 'X', slug: 'x' })).status).toBe(409);
  });

  test('edita categoria e impede que ela seja subcategoria de si mesma', async () => {
    admin([['UPDATE categorias', linhas({ id: 5 })]]);
    expect((await request(appAdmin).put('/api/admin/categorias/5').set('Authorization', tokenDe(ADMIN)).send({ nome: 'A', slug: 'a' })).status).toBe(200);
    expect((await request(appAdmin).put('/api/admin/categorias/5').set('Authorization', tokenDe(ADMIN)).send({ nome: 'A', slug: 'a', categoria_pai: 5 })).status).toBe(400);
  });

  test('categoria com anúncios vinculados não pode ser removida', async () => {
    admin([
      ['SELECT nome FROM categorias', linhas({ nome: 'Móveis' })],
      ['DELETE FROM categorias', () => { throw Object.assign(new Error('fk'), { code: '23503' }); }],
    ]);
    expect((await request(appAdmin).delete('/api/admin/categorias/1').set('Authorization', tokenDe(ADMIN))).status).toBe(409);
  });

  test('remove categoria sem vínculos', async () => {
    admin([['SELECT nome FROM categorias', linhas({ nome: 'Antiga' })]]);
    expect((await request(appAdmin).delete('/api/admin/categorias/9').set('Authorization', tokenDe(ADMIN))).status).toBe(200);
    expect(logsGravados()[0].acao).toBe('excluir_categoria');
  });

  // ── Denúncias e suporte ──
  test('filtra a fila de denúncias por status', async () => {
    admin([['SELECT COUNT', linhas({ count: '1' })], ['FROM denuncias d', linhas({ id: 1 })]]);
    const res = await request(appAdmin).get('/api/admin/denuncias').query({ status: 'pendente' }).set('Authorization', tokenDe(ADMIN));
    expect(res.body.denuncias).toHaveLength(1);
    expect(chamadaCom('ORDER BY d\\.criada_em')[1][0]).toBe('pendente');
  });

  test('resolver denúncia registra quem resolveu e quando', async () => {
    admin([['UPDATE denuncias', linhas({ id: 1, status: 'resolvida' })]]);
    await request(appAdmin).put('/api/admin/denuncias/1').set('Authorization', tokenDe(ADMIN)).send({ status: 'resolvida', resolucao: 'Removido' });
    const [sql, params] = chamadaCom('UPDATE denuncias');
    expect(sql).toMatch(/resolvida_em = NOW\(\)/);
    expect(params).toEqual(['resolvida', 'Removido', ADMIN, '1']);
  });

  test('colocar denúncia em análise não marca como resolvida', async () => {
    admin([['UPDATE denuncias', linhas({ id: 1 })]]);
    await request(appAdmin).put('/api/admin/denuncias/1').set('Authorization', tokenDe(ADMIN)).send({ status: 'em_analise' });
    expect(chamadaCom('UPDATE denuncias')[0]).toMatch(/resolvida_em = resolvida_em/);
  });

  test('status de denúncia inválido é recusado', async () => {
    admin();
    expect((await request(appAdmin).put('/api/admin/denuncias/1').set('Authorization', tokenDe(ADMIN)).send({ status: 'apagada' })).status).toBe(400);
  });

  test('responde um chamado da central de ajuda', async () => {
    admin([['SELECT COUNT', linhas({ count: '1' })], ['FROM mensagens_suporte s', linhas({ id: 1 })], ['UPDATE mensagens_suporte', linhas({ id: 1 })]]);
    expect((await request(appAdmin).get('/api/admin/suporte').query({ status: 'aberto' }).set('Authorization', tokenDe(ADMIN))).body.solicitacoes).toHaveLength(1);

    await request(appAdmin).put('/api/admin/suporte/1').set('Authorization', tokenDe(ADMIN)).send({ status: 'respondido', resposta: 'Resolvido' });
    expect(chamadaCom('UPDATE mensagens_suporte')[1]).toEqual(['respondido', 'Resolvido', ADMIN, '1']);
  });

  test('chamado inexistente ou com status inválido é recusado', async () => {
    admin();
    expect((await request(appAdmin).put('/api/admin/suporte/1').set('Authorization', tokenDe(ADMIN)).send({ status: 'xx' })).status).toBe(400);
    expect((await request(appAdmin).put('/api/admin/suporte/99').set('Authorization', tokenDe(ADMIN)).send({ status: 'em_atendimento' })).status).toBe(404);
  });

  test('consulta os logs de auditoria com paginação', async () => {
    admin([['FROM logs_auditoria$', linhas({ count: '45' })], ['FROM logs_auditoria l', linhas({ id: 1, acao: 'suspender_usuario' })]]);
    const res = await request(appAdmin).get('/api/admin/logs').query({ pagina: 2 }).set('Authorization', tokenDe(ADMIN));
    expect(res.body.paginacao).toEqual({ pagina_atual: 2, total_paginas: 2, total_itens: 45 });
    expect(chamadaCom('FROM logs_auditoria l')[1]).toEqual([30, 30]);
  });
});
