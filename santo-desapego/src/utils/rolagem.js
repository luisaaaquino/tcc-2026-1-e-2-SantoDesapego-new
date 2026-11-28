/* ── Rolar até uma seção da página ───────────────────────────
   O cabeçalho do site é fixo (busca + barra de categorias). Rolar
   direto para a seção deixava o título dela escondido atrás dele —
   aqui a altura real do cabeçalho é descontada, com uma folga.
   Devolve false se a seção não existe nesta página. ── */
const FOLGA = 24;

export const rolarAteSecao = (id, { suave = true } = {}) => {
  const el = document.getElementById(id);
  if (!el) return false;
  const cabecalho = document.querySelector('.site-header')?.offsetHeight || 0;
  const topo = el.getBoundingClientRect().top + window.scrollY - cabecalho - FOLGA;
  window.scrollTo({ top: Math.max(0, topo), behavior: suave ? 'smooth' : 'auto' });
  return true;
};
