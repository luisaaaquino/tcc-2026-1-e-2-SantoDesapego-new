import { Link } from 'react-router-dom';
import './Legal.css';
import SiteHeader from '../componentes/SiteHeader';
import { TERMOS_USO, POLITICA_PRIVACIDADE } from './termosContent';

/* ── Termos / Privacidade em página própria ─────────────────
   Mesmo conteúdo do LegalModal, mas com URL pública
   (/termos e /privacidade) — exigida pela tela de branding
   do login com Google. ── */
const DOCUMENTOS = {
  termos: { titulo: 'Termos de Uso', secoes: TERMOS_USO },
  privacidade: { titulo: 'Política de Privacidade', secoes: POLITICA_PRIVACIDADE },
};

const Legal = ({ tipo }) => {
  const { titulo, secoes } = DOCUMENTOS[tipo];

  return (
    <div className="legal-pagina">
      <SiteHeader>
        <Link to={tipo === 'termos' ? '/privacidade' : '/termos'} className="nav-btn">
          {tipo === 'termos' ? 'Privacidade (LGPD)' : 'Termos de Uso'}
        </Link>
        <Link to="/" className="nav-btn">Início</Link>
      </SiteHeader>

      <main className="legal-pagina-conteudo">
        <h1>{titulo}</h1>
        {secoes.map((sec) => (
          <section key={sec.titulo} className="legal-pagina-secao">
            <h2>{sec.titulo}</h2>
            {sec.paragrafos?.map((p, i) => <p key={i}>{p}</p>)}
            {sec.lista && (
              <ul>
                {sec.lista.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
            {sec.rodape && <p className="legal-pagina-rodape">{sec.rodape}</p>}
            {sec.subsecoes?.map((sub) => (
              <div key={sub.titulo} className="legal-pagina-sub">
                <h3>{sub.titulo}</h3>
                {sub.paragrafos?.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </section>
        ))}
      </main>

      <footer className="site-footer">
        <span>© 2026 Santo Desapego</span>
      </footer>
    </div>
  );
};

export default Legal;
