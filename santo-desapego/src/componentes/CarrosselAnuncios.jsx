import { useEffect, useState } from 'react';
import CartaoAnuncio from './CartaoAnuncio';
import './CarrosselAnuncios.css';

// Carrossel de anúncios em "páginas": mostra 5 por vez no computador
// (3 no tablet, 2 no celular). A seta da direita avança um grupo inteiro;
// no último grupo, volta para o primeiro (e a da esquerda faz o inverso).

const porVistaAtual = () => {
  if (typeof window === 'undefined') return 5;
  if (window.innerWidth <= 600) return 2;
  if (window.innerWidth <= 1024) return 3;
  return 5;
};

const Seta = ({ direcao }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {direcao === 'esq' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
  </svg>
);

const CarrosselAnuncios = ({ titulo, subtitulo, anuncios, id = 'carrossel' }) => {
  const [porVista, setPorVista] = useState(porVistaAtual);
  const [grupo, setGrupo] = useState(0);

  useEffect(() => {
    const aoRedimensionar = () => setPorVista(porVistaAtual());
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  const totalGrupos = Math.max(1, Math.ceil(anuncios.length / porVista));
  // Se a tela mudar de tamanho, o grupo atual pode deixar de existir
  const atual = Math.min(grupo, totalGrupos - 1);

  if (anuncios.length === 0) return null;

  const ir = (passo) => setGrupo((atual + passo + totalGrupos) % totalGrupos);

  return (
    <section className="carrossel" aria-labelledby={`${id}-titulo`} style={{ '--por-vista': porVista }}>
      <div className="carrossel-topo">
        <div>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          {subtitulo && <p className="carrossel-subtitulo">{subtitulo}</p>}
        </div>
        {totalGrupos > 1 && (
          <div className="carrossel-controles">
            <span className="carrossel-posicao" aria-live="polite">{atual + 1} de {totalGrupos}</span>
            <button type="button" className="carrossel-seta" onClick={() => ir(-1)} aria-label="Anúncios anteriores">
              <Seta direcao="esq" />
            </button>
            <button type="button" className="carrossel-seta" onClick={() => ir(1)} aria-label="Próximos anúncios">
              <Seta direcao="dir" />
            </button>
          </div>
        )}
      </div>

      <div className="carrossel-janela">
        <ul className="carrossel-trilho" style={{ transform: `translateX(calc(${-atual} * (100% + var(--carrossel-gap))))` }}>
          {anuncios.map((a, i) => {
            const visivel = Math.floor(i / porVista) === atual;
            return (
              // fora do grupo visível: some do leitor de tela e do Tab
              <li key={a.id} inert={!visivel}>
                <CartaoAnuncio anuncio={a} prioridade={i < porVista} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default CarrosselAnuncios;
