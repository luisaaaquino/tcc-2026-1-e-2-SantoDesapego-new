// Ponte entre o React e a camada de movimento da skill design-taste-frontend.
//
// Os arquivos do kit ficam em public/assets/taste-skill (copiados sem edição)
// e são carregados como arquivos soltos, do jeito que a skill pede. Como o
// React monta as telas depois do carregamento da página, o motion.js precisa
// ser avisado a cada troca de tela (refresh) para achar a abertura com
// data-enter e as abas (role="tablist"). Os moments são montados e
// desmontados pela própria tela que os usa (montarMoment).
//
// Nos testes (jsdom) nada disso é carregado: os arquivos não existem lá
// e o movimento não muda nenhum comportamento.

const BASE = '/assets/taste-skill';
const ativo = () => typeof window !== 'undefined' && import.meta.env.MODE !== 'test';

let motionP = null;
const carregarMotion = () => {
  if (!motionP) motionP = import(/* @vite-ignore */ `${BASE}/motion/motion.js`);
  return motionP;
};

let momentsP = null;
const carregarMoments = () => {
  if (!momentsP) momentsP = import(/* @vite-ignore */ `${BASE}/moments/moments.js`);
  return momentsP;
};

/** Avisa a camada de movimento que a tela mudou (abertura, abas). */
export function atualizarMovimento() {
  if (!ativo()) return;
  carregarMotion()
    .then((m) => m.refresh())
    .catch(() => { /* sem a camada o site funciona igual, só sem movimento */ });
}

/** Monta o moment de um elemento [data-moment]; devolve a função que desmonta. */
export function montarMoment(el) {
  if (!ativo() || !el) return () => {};
  let desmontado = false;
  carregarMoments()
    .then((m) => { if (!desmontado) return m.mount(el); })
    .catch(() => { el.classList.add('mo-safe'); });
  return () => {
    desmontado = true;
    try { el.__moment?.destroy?.(); } catch { /* já saiu */ }
    delete el.__moment;
    delete el.__momentP;
    el.removeAttribute('data-moment-mounted');
  };
}
