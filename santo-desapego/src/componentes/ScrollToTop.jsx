import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { rolarAteSecao } from '../utils/rolagem';

/* ── Rola pro topo (ou pra âncora certa) a cada troca de página ──
   O React Router não faz isso sozinho: ao navegar de uma página
   pra outra (ex.: clicar num link no rodapé estando lá embaixo),
   a posição de rolagem fica igual à da página anterior — dá a
   impressão de que o clique não fez nada, principalmente quando
   as duas páginas têm um rodapé parecido.

   Também trata links com âncora tipo "/#como-funciona" — usados
   pra apontar pra uma seção específica da Home a partir de OUTRA
   página (ex.: "Como funciona" no rodapé da Sobre). Sem isso, o
   link até navegava pra Home, mas não rolava pra seção nenhuma.

   Só depende do pathname (não da query string) pra não interferir
   em telas que trocam parâmetros de URL sem trocar de página
   (ex.: Perfil limpando o parâmetro "mp" depois de voltar do
   Mercado Pago). ── */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      // Vindo de outra página: vai direto (sem animação) para a seção
      if (rolarAteSecao(id, { suave: false })) {
        // Os anúncios da Home ainda estão chegando e empurram a seção para
        // baixo — a pessoa via a lista de anúncios por um instante. Enquanto
        // a página cresce, mantém a seção no lugar; para quando assenta
        // (ou se a própria pessoa rolar a página).
        const manter = () => rolarAteSecao(id, { suave: false });
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observador = new ResizeObserver(manter);
        observador.observe(document.body);
        const parar = () => {
          observador.disconnect();
          clearTimeout(limite);
          ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((ev) => window.removeEventListener(ev, parar));
        };
        const limite = setTimeout(parar, 4000);
        ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, parar, { passive: true }));
        return parar;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
