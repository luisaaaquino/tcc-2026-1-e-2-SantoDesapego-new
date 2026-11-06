import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcessibilidadeCores from '../src/componentes/AcessibilidadeCores';
import { lerModoCor, aplicarModoCor, MODOS_COR } from '../src/utils/modoCor';
import { lerEscalaFonte, aplicarEscalaFonte, NIVEIS_FONTE } from '../src/utils/tamanhoFonte';

const raiz = () => document.documentElement;
const abrirPainel = async (user) => {
  await user.click(screen.getByRole('button', { name: /Acessibilidade: tamanho do texto e modo de cor/ }));
};

describe('RNF12 - Acessibilidade WCAG 2.1 Nível AA', () => {
  // ── Modo de cor para daltonismo ──
  test('oferece modo padrão e dois modos para daltonismo (vermelho-verde e azul-amarelo)', () => {
    expect(MODOS_COR).toEqual(['padrao', 'protan-deutan', 'tritan']);
  });

  test('sem escolha salva, o site abre no modo de cor padrão', () => {
    expect(lerModoCor()).toBe('padrao');
  });

  test('a escolha do modo de cor é aplicada na página e lembrada na próxima visita', () => {
    aplicarModoCor('tritan');
    expect(raiz()).toHaveAttribute('data-daltonismo', 'tritan');
    expect(lerModoCor()).toBe('tritan');

    aplicarModoCor('padrao');
    expect(raiz()).not.toHaveAttribute('data-daltonismo');
  });

  test('valor inválido salvo no navegador volta para o padrão', () => {
    localStorage.setItem('sd_modo_cor', 'roxo');
    expect(lerModoCor()).toBe('padrao');
  });

  test('sem acesso ao armazenamento do navegador o site continua funcionando', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerModoCor()).toBe('padrao');
    expect(lerEscalaFonte()).toBe(1);
    expect(() => aplicarModoCor('tritan')).not.toThrow();
    expect(() => aplicarEscalaFonte(1.5)).not.toThrow();
  });

  // ── Tamanho do texto ──
  test('o texto pode ser ampliado de 100% até 150%', () => {
    expect(NIVEIS_FONTE).toEqual([1, 1.1, 1.25, 1.5]);
  });

  test('o tamanho escolhido é aplicado na página e lembrado', () => {
    aplicarEscalaFonte(1.25);
    expect(raiz().style.getPropertyValue('--escala-fonte')).toBe('1.25');
    expect(lerEscalaFonte()).toBe(1.25);
  });

  test('tamanho salvo fora da lista volta para 100%', () => {
    localStorage.setItem('sd_escala_fonte', '3');
    expect(lerEscalaFonte()).toBe(1);
  });

  // ── Painel de acessibilidade ──
  test('o botão de acessibilidade tem nome acessível e informa se o painel está aberto', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    const botao = screen.getByRole('button', { name: /Acessibilidade/ });
    expect(botao).toHaveAttribute('aria-expanded', 'false');

    await user.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Acessibilidade' })).toBeInTheDocument();
  });

  test('o modo de cor é escolhido por botões de opção com rótulo', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    await abrirPainel(user);

    await user.click(screen.getByRole('radio', { name: /Vermelho-verde/ }));

    expect(screen.getByRole('radio', { name: /Vermelho-verde/ })).toBeChecked();
    expect(raiz()).toHaveAttribute('data-daltonismo', 'protan-deutan');
  });

  test('aumenta o texto passo a passo e trava no máximo (150%)', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    await abrirPainel(user);
    const maior = screen.getByRole('button', { name: 'Aumentar texto' });

    for (let i = 0; i < 3; i++) await user.click(maior);

    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(maior).toBeDisabled();
    expect(raiz().style.getPropertyValue('--escala-fonte')).toBe('1.5');
  });

  test('no tamanho padrão não dá para diminuir mais', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    await abrirPainel(user);
    expect(screen.getByRole('button', { name: 'Diminuir texto' })).toBeDisabled();
    expect(screen.queryByText('Restaurar tamanho padrão')).not.toBeInTheDocument();
  });

  test('restaura o tamanho padrão do texto', async () => {
    localStorage.setItem('sd_escala_fonte', '1.25');
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    await abrirPainel(user);

    await user.click(screen.getByRole('button', { name: 'Restaurar tamanho padrão' }));

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  test('o painel fecha com a tecla Esc', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);
    await abrirPainel(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Acessibilidade' })).not.toBeInTheDocument();
  });

  test('o painel fecha ao clicar fora dele e pelo botão Fechar', async () => {
    const user = userEvent.setup();
    render(<div><p>fora</p><AcessibilidadeCores /></div>);
    await abrirPainel(user);
    fireEvent.mouseDown(screen.getByText('fora'));
    expect(screen.queryByRole('group', { name: 'Acessibilidade' })).not.toBeInTheDocument();

    await abrirPainel(user);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('group', { name: 'Acessibilidade' })).not.toBeInTheDocument();
  });

  test('todo o painel funciona só com o teclado', async () => {
    const user = userEvent.setup();
    render(<AcessibilidadeCores />);

    await user.tab();
    expect(screen.getByRole('button', { name: /Acessibilidade/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('group', { name: 'Acessibilidade' })).toBeInTheDocument();

    screen.getByRole('button', { name: 'Aumentar texto' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('110%')).toBeInTheDocument();
  });

  test('na primeira visita o botão se apresenta sozinho e depois não repete', () => {
    vi.useFakeTimers();
    const { unmount } = render(<AcessibilidadeCores />);
    const botao = screen.getByRole('button', { name: /Acessibilidade/ });

    act(() => { vi.advanceTimersByTime(700); });
    expect(botao).toHaveClass('expandido');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(botao).not.toHaveClass('expandido');
    expect(localStorage.getItem('sd_dica_modo_cor_vista')).toBe('1');

    unmount();
    render(<AcessibilidadeCores />);
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.getByRole('button', { name: /Acessibilidade/ })).not.toHaveClass('expandido');
  });
});
