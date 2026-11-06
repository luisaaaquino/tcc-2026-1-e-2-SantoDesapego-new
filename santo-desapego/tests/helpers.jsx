import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

// Mostra a rota atual na tela, para conferir redirecionamentos
const RotaAtual = () => {
  const local = useLocation();
  return <div data-testid="rota-atual">{local.pathname + local.search}</div>;
};

// Renderiza um componente dentro do roteador, numa rota escolhida
export const renderComRota = (elemento, { rota = '/', caminho = '*' } = {}) => render(
  <MemoryRouter initialEntries={[rota]}>
    <Routes>
      <Route path={caminho} element={elemento} />
      <Route path="*" element={null} />
    </Routes>
    <RotaAtual />
  </MemoryRouter>,
);

// Resposta de fetch no formato do navegador
export const respostaJson = (corpo, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  clone() { return respostaJson(corpo, status); },
});

// Substitui o fetch global; `rotas` mapeia trecho da URL -> resposta (ou função)
export const simularFetch = (rotas = {}) => {
  const fetchFalso = vi.fn(async (url, opcoes) => {
    for (const [trecho, resposta] of Object.entries(rotas)) {
      if (String(url).includes(trecho)) return typeof resposta === 'function' ? resposta(url, opcoes) : resposta;
    }
    return respostaJson({});
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
};

// Login falso no navegador
export const logar = (usuario = { id: 1, nome: 'Ana' }) => {
  localStorage.setItem('sd_token', 'token-de-teste');
  localStorage.setItem('sd_usuario', JSON.stringify(usuario));
};
