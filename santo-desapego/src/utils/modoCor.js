/* ── Modo de cor para daltonismo ────────────────────────────
   Guarda a escolha no navegador e aplica como atributo no <html>
   (data-daltonismo). As paletas alternativas ficam em index.css,
   sobrescrevendo as variáveis da paleta padrão. ── */
const CHAVE = 'sd_modo_cor';

export const MODOS_COR = ['padrao', 'protan-deutan', 'tritan'];

export const lerModoCor = () => {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return MODOS_COR.includes(salvo) ? salvo : 'padrao';
  } catch {
    return 'padrao';
  }
};

export const aplicarModoCor = (modo) => {
  const raiz = document.documentElement;
  if (modo === 'padrao') raiz.removeAttribute('data-daltonismo');
  else raiz.setAttribute('data-daltonismo', modo);
  try { localStorage.setItem(CHAVE, modo); } catch { /* sem storage: vale só nesta visita */ }
};

/* Etiqueta "Modo para daltonismo" ao lado do botão: aparece só até a
   pessoa interagir com ele pela primeira vez */
const CHAVE_DICA = 'sd_dica_modo_cor_vista';

export const dicaModoCorVista = () => {
  try { return localStorage.getItem(CHAVE_DICA) === '1'; } catch { return false; }
};

export const marcarDicaModoCorVista = () => {
  try { localStorage.setItem(CHAVE_DICA, '1'); } catch { /* sem storage: volta na próxima visita */ }
};
