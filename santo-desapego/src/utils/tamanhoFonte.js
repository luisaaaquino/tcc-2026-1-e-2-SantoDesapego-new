/* ── Tamanho do texto (acessibilidade) ──────────────────────
   O site usa rem em quase tudo, então basta escalar o font-size
   do <html>: a variável --escala-fonte multiplica o tamanho base
   (ver index.css e o ajuste de celular em Home.css). ── */
const CHAVE = 'sd_escala_fonte';

// 100% a 150%. Os 200% da WCAG 1.4.4 ficam a cargo do zoom do navegador (testado ok)
export const NIVEIS_FONTE = [1, 1.1, 1.25, 1.5];

export const lerEscalaFonte = () => {
  try {
    const salvo = Number(localStorage.getItem(CHAVE));
    return NIVEIS_FONTE.includes(salvo) ? salvo : 1;
  } catch {
    return 1;
  }
};

export const aplicarEscalaFonte = (escala) => {
  document.documentElement.style.setProperty('--escala-fonte', escala);
  try { localStorage.setItem(CHAVE, String(escala)); } catch { /* sem storage: vale só nesta visita */ }
};
