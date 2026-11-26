import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { atualizarMovimento } from '../utils/camadaMovimento';
import './TransicaoPagina.css';

/* ── Transição suave entre telas ──
   A `key` muda a cada troca de página, então o React remonta o
   invólucro e a animação de entrada (TransicaoPagina.css) roda de novo.

   Só depende do pathname (não da query string), igual ao ScrollToTop:
   telas que só trocam parâmetros de URL (ex.: filtros do Explorar)
   não devem piscar a cada clique. ── */
const TransicaoPagina = ({ children }) => {
  const { pathname } = useLocation();

  // A camada de movimento (skill design-taste-frontend) procura a abertura
  // e as abas da tela nova depois que ela aparece. Telas que só montam as
  // abas depois de carregar dados chamam atualizarMovimento() por conta própria.
  useEffect(() => {
    const id = requestAnimationFrame(atualizarMovimento);
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div key={pathname} className="transicao-pagina">
      {children}
    </div>
  );
};

export default TransicaoPagina;
