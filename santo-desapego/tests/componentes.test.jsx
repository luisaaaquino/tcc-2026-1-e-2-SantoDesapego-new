import { describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeletorBairro, { BAIRROS } from '../src/componentes/SeletorBairro';
import NotificacoesSino from '../src/componentes/NotificacoesSino';
import DicasSeguranca from '../src/componentes/DicasSeguranca';
import { iconeDaCategoria } from '../src/utils/categorias';
import { IconSofa, IconLaptop, IconMore } from '../src/componentes/Icones';
import { renderComRota, respostaJson, simularFetch, logar } from './helpers';

/* ─────────────────────────────────────────────────────────── */
describe('RF08 - Busca Geolocalizada por Proximidade', () => {
  test('a lista tem os 18 bairros de Santo Amaro e região atendidos', () => {
    expect(BAIRROS).toHaveLength(18);
    expect(BAIRROS).toEqual(expect.arrayContaining(['Santo Amaro Centro', 'Brooklin', 'Campo Belo', 'Socorro']));
  });

  test('sem bairro escolhido, mostra "Todos os bairros"', () => {
    renderComRota(<SeletorBairro value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Todos os bairros/ })).toBeInTheDocument();
  });

  test('escolher um bairro filtra a busca e fecha a lista', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderComRota(<SeletorBairro value="" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Todos os bairros/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Granja Julieta' }));

    expect(onChange).toHaveBeenCalledWith('Granja Julieta');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('"Todos os bairros" tira o filtro', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderComRota(<SeletorBairro value="Brooklin" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Brooklin/ }));
    await user.click(screen.getAllByRole('button', { name: /Todos os bairros/ }).at(-1));
    expect(onChange).toHaveBeenCalledWith('');
  });

  test('a lista fecha ao clicar fora', async () => {
    const user = userEvent.setup();
    renderComRota(<div><p>fora</p><SeletorBairro value="" onChange={() => {}} /></div>);
    await user.click(screen.getByRole('button', { name: /Todos os bairros/ }));
    fireEvent.mouseDown(screen.getByText('fora'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF09 - Categorização Hierárquica de Produtos', () => {
  test('cada categoria principal tem o seu ícone', () => {
    expect(iconeDaCategoria(1)).toBe(IconSofa);
    expect(iconeDaCategoria(2)).toBe(IconLaptop);
  });

  test('categoria nova, sem ícone próprio, usa o ícone genérico', () => {
    expect(iconeDaCategoria(999)).toBe(IconMore);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF18 - Notificações ao Usuário', () => {
  const agora = new Date();
  const minutosAtras = (m) => new Date(agora.getTime() - m * 60000).toISOString();
  const NOTIFICACOES = [
    { id: 1, tipo: 'nova_mensagem', titulo: 'Nova mensagem de Ana', mensagem: 'Ainda está disponível?', link: '/mensagens', lida: false, criada_em: minutosAtras(5) },
    { id: 2, tipo: 'pagamento_confirmado', titulo: 'Pagamento confirmado', mensagem: 'Combine a entrega', link: '/perfil?aba=vendas', lida: false, criada_em: minutosAtras(180) },
    { id: 3, tipo: 'anuncio_expirando', titulo: 'Anúncio expirando', mensagem: 'Renove', link: null, lida: true, criada_em: minutosAtras(60 * 24 * 2) },
  ];
  const abrirSino = (notificacoes = NOTIFICACOES, totalNaoLidas = 2) => {
    logar();
    const fetchFalso = simularFetch({
      'lidas-todas': respostaJson({}),
      '/lida': respostaJson({}),
      '/api/notificacoes': respostaJson({ notificacoes, total_nao_lidas: totalNaoLidas }),
    });
    renderComRota(<NotificacoesSino />);
    return { user: userEvent.setup(), fetchFalso };
  };

  test('quem não está logado não vê o sino', () => {
    simularFetch();
    renderComRota(<NotificacoesSino />);
    expect(screen.queryByRole('button', { name: /Notificações/ })).not.toBeInTheDocument();
  });

  test('o sino mostra quantas notificações não foram lidas (também para leitor de tela)', async () => {
    abrirSino();
    expect(await screen.findByRole('button', { name: 'Notificações (2 não lidas)' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('mais de 9 não lidas aparece como 9+', async () => {
    abrirSino(NOTIFICACOES, 14);
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  test('abre a lista com título, mensagem e há quanto tempo chegou', async () => {
    const { user } = abrirSino();
    await user.click(await screen.findByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Nova mensagem de Ana')).toBeInTheDocument();
    expect(screen.getByText('há 5 min')).toBeInTheDocument();
    expect(screen.getByText('há 3h')).toBeInTheDocument();
    expect(screen.getByText('há 2d')).toBeInTheDocument();
  });

  test('clicar numa notificação marca como lida e leva à página dela', async () => {
    const { user, fetchFalso } = abrirSino();
    await user.click(await screen.findByRole('button', { name: /Notificações/ }));
    await user.click(screen.getByText('Nova mensagem de Ana'));

    expect(screen.getByTestId('rota-atual')).toHaveTextContent('/mensagens');
    expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('/api/notificacoes/1/lida'), expect.objectContaining({ method: 'PUT' }));
    expect(screen.getByRole('button', { name: 'Notificações (1 não lidas)' })).toBeInTheDocument();
  });

  test('marcar todas como lidas zera o contador', async () => {
    const { user, fetchFalso } = abrirSino();
    await user.click(await screen.findByRole('button', { name: /Notificações/ }));
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
    expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('lidas-todas'), expect.objectContaining({ method: 'PUT' }));
  });

  test('sem notificações, avisa que a lista está vazia', async () => {
    const { user } = abrirSino([], 0);
    await user.click(await screen.findByRole('button', { name: /Notificações/ }));
    expect(screen.getByText('Você não tem notificações ainda.')).toBeInTheDocument();
  });

  test('a lista é atualizada sozinha a cada 20 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetchFalso } = abrirSino();
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(1));
    await act(async () => { vi.advanceTimersByTime(20000); });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  test('login vencido esconde o sino', async () => {
    logar();
    simularFetch({ '/api/notificacoes': respostaJson({ erro: 'Token inválido ou expirado.' }, 401) });
    renderComRota(<NotificacoesSino />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Notificações/ })).not.toBeInTheDocument());
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF25 - Central de Ajuda', () => {
  test('a Central de Ajuda mostra todas as dicas de segurança por público', () => {
    renderComRota(<DicasSeguranca variante="completa" />);
    expect(screen.getAllByRole('heading').map((h) => h.textContent))
      .toEqual(['Para quem compra', 'Para quem vende', 'Para todo mundo']);
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
  });

  test('nas telas de compra aparecem só as dicas daquele momento, com link para a lista toda', () => {
    renderComRota(<DicasSeguranca dicas={['pague-no-site', 'codigo-entrega', 'nao-existe']} titulo="Compra segura" />);
    expect(screen.getByRole('complementary', { name: 'Compra segura' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver todas as dicas de segurança' })).toHaveAttribute('href', '/central-ajuda#seguranca');
  });

  test('a dica sobre o código de entrega orienta só passar depois de conferir o produto', () => {
    renderComRota(<DicasSeguranca dicas={['codigo-entrega']} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('depois de receber e conferir o produto');
  });
});
