import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerificacaoCodigo from '../src/componentes/VerificacaoCodigo';
import { respostaJson, simularFetch } from './helpers';

// Token JWT falso com a validade (exp) desejada
const tokenComValidade = (segundosAPartirDeAgora) => {
  const payload = btoa(JSON.stringify({ id: 1, exp: Math.floor(Date.now() / 1000) + segundosAPartirDeAgora }));
  return `cabecalho.${payload}.assinatura`;
};

describe('RF02 - Autenticação e Gestão de Sessão', () => {
  // O módulo guarda se já está redirecionando: cada teste carrega do zero
  let sessao;
  beforeEach(async () => {
    vi.resetModules();
    sessao = await import('../src/utils/sessao');
  });

  test('ao abrir o site com o login vencido, a sessão é encerrada', () => {
    localStorage.setItem('sd_token', tokenComValidade(-60));
    localStorage.setItem('sd_usuario', '{"nome":"Ana"}');
    sessao.limparSessaoSeVencida();
    expect(localStorage.getItem('sd_token')).toBeNull();
    expect(localStorage.getItem('sd_usuario')).toBeNull();
  });

  test('login ainda válido é mantido', () => {
    localStorage.setItem('sd_token', tokenComValidade(3600));
    sessao.limparSessaoSeVencida();
    expect(localStorage.getItem('sd_token')).not.toBeNull();
  });

  test('token em formato desconhecido fica para a API decidir', () => {
    localStorage.setItem('sd_token', 'nao-e-jwt');
    sessao.limparSessaoSeVencida();
    expect(localStorage.getItem('sd_token')).toBe('nao-e-jwt');
  });

  test('sair encerra a sessão (apaga token e dados do usuário)', () => {
    localStorage.setItem('sd_token', 'x');
    localStorage.setItem('sd_usuario', '{}');
    sessao.limparSessao();
    expect(localStorage.length).toBe(0);
  });

  describe('sessão que vence com o site aberto', () => {
    const instalar = (resposta) => {
      vi.stubGlobal('fetch', vi.fn(async () => resposta));
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, pathname: '/perfil', assign });
      sessao.avisarSessaoExpiradaNaApi();
      return assign;
    };

    test('API avisa que o token venceu: encerra a sessão e leva ao login com aviso', async () => {
      localStorage.setItem('sd_token', 'x');
      const assign = instalar(respostaJson({ erro: 'Token inválido ou expirado.' }, 401));

      await window.fetch('/api/usuario/perfil', { headers: { Authorization: 'Bearer x' } });

      expect(localStorage.getItem('sd_token')).toBeNull();
      expect(assign).toHaveBeenCalledWith('/login?sessao=expirada');
    });

    test('erro 401 de senha errada (sem token) não derruba ninguém', async () => {
      localStorage.setItem('sd_token', 'x');
      const assign = instalar(respostaJson({ erro: 'E-mail ou senha inválidos.' }, 401));

      await window.fetch('/api/auth/login', { method: 'POST' });

      expect(localStorage.getItem('sd_token')).toBe('x');
      expect(assign).not.toHaveBeenCalled();
    });

    test('outros erros da API não encerram a sessão', async () => {
      localStorage.setItem('sd_token', 'x');
      const assign = instalar(respostaJson({ erro: 'Acesso restrito a administradores.' }, 403));
      await window.fetch('/api/admin', { headers: { Authorization: 'Bearer x' } });
      expect(localStorage.getItem('sd_token')).toBe('x');
      expect(assign).not.toHaveBeenCalled();
    });
  });
});

describe('RN17 - Verificação em Duas Etapas', () => {
  const verificacao = { desafio: 'abc', email_mascarado: 'an***@teste.com', finalidade: 'login' };
  const montar = (props = {}) => {
    const aoVerificar = vi.fn();
    const aoVoltar = vi.fn();
    render(<VerificacaoCodigo verificacao={verificacao} aoVerificar={aoVerificar} aoVoltar={aoVoltar} {...props} />);
    return { aoVerificar, aoVoltar };
  };
  const campo = () => screen.getByLabelText('Código');

  test('mostra para qual e-mail o código foi enviado e que ele vale 10 minutos', () => {
    montar();
    expect(screen.getByText('an***@teste.com')).toBeInTheDocument();
    expect(screen.getByText(/vale 10 minutos/)).toBeInTheDocument();
  });

  test('o campo aceita só números e no máximo 6 dígitos', async () => {
    const user = userEvent.setup();
    montar();
    await user.type(campo(), '12a3-4567');
    expect(campo()).toHaveValue('123456');
  });

  test('o botão só libera com os 6 dígitos', async () => {
    const user = userEvent.setup();
    montar();
    const entrar = screen.getByRole('button', { name: 'Entrar' });
    await user.type(campo(), '12345');
    expect(entrar).toBeDisabled();
    await user.type(campo(), '6');
    expect(entrar).toBeEnabled();
  });

  test('código certo abre a sessão', async () => {
    const user = userEvent.setup();
    const fetchFalso = simularFetch({ 'verificar-codigo': respostaJson({ token: 't', usuario: { id: 1 } }) });
    const { aoVerificar } = montar();

    await user.type(campo(), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(aoVerificar).toHaveBeenCalledWith({ token: 't', usuario: { id: 1 } });
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body)).toEqual({ desafio: 'abc', codigo: '123456' });
  });

  test('código errado mostra o erro e limpa o campo', async () => {
    const user = userEvent.setup();
    simularFetch({ 'verificar-codigo': respostaJson({ erro: 'Código incorreto. Você tem mais 4 tentativa(s).' }, 400) });
    const { aoVerificar } = montar();

    await user.type(campo(), '000000');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('mais 4 tentativa');
    expect(campo()).toHaveValue('');
    expect(aoVerificar).not.toHaveBeenCalled();
  });

  test('depois de esgotar as tentativas, pede para fazer login de novo', async () => {
    const user = userEvent.setup();
    simularFetch({ 'verificar-codigo': respostaJson({ erro: 'Muitas tentativas erradas.', reiniciar: true }, 429) });
    const { aoVoltar } = montar();

    await user.type(campo(), '000000');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await user.click(await screen.findByRole('button', { name: 'Fazer login de novo' }));

    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();
    expect(aoVoltar).toHaveBeenCalled();
  });

  test('o reenvio só libera depois de 60 segundos', () => {
    vi.useFakeTimers();
    montar();
    const reenviar = screen.getByRole('button', { name: /Reenviar código em 60s/ });
    expect(reenviar).toBeDisabled();

    for (let i = 0; i < 60; i++) act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeEnabled();
  });

  test('reenviar mostra a confirmação e reinicia a contagem', async () => {
    vi.useFakeTimers();
    simularFetch({ 'reenviar-codigo': respostaJson({ mensagem: 'Enviamos um novo código para o seu e-mail.' }) });
    montar();
    for (let i = 0; i < 60; i++) act(() => { vi.advanceTimersByTime(1000); });

    await act(async () => { screen.getByRole('button', { name: 'Reenviar código' }).click(); });

    expect(screen.getByRole('status')).toHaveTextContent('Enviamos um novo código');
    expect(screen.getByRole('button', { name: /Reenviar código em 60s/ })).toBeDisabled();
  });

  test('sem conexão com o servidor, avisa em vez de travar', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    montar();
    await user.type(campo(), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao conectar com o servidor.');
  });

  test('no cadastro, a tela pede para confirmar o e-mail', () => {
    montar({ verificacao: { ...verificacao, finalidade: 'cadastro' } });
    expect(screen.getByRole('heading')).toHaveTextContent('Confirme seu e-mail');
    expect(screen.getByRole('button', { name: 'Confirmar e entrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fazer isso depois' })).toBeInTheDocument();
  });
});
