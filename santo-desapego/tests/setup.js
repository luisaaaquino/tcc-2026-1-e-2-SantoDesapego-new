import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cada teste começa com o navegador "limpo": sem login, sem preferências
// salvas e sem atributos de acessibilidade aplicados no <html>.
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-daltonismo');
  document.documentElement.style.removeProperty('--escala-fonte');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// O site rola a página para mostrar erros; o jsdom não implementa isso
window.scrollTo = () => {};
