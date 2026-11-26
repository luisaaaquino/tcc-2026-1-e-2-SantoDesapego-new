import { Link } from 'react-router-dom';
import { EMAILS } from '../config';

// Rodapé das páginas públicas (Home, Explorar e Sobre). Antes estava
// copiado nos três arquivos; agora as três mostram o mesmo conteúdo.
// As classes (.home-footer, .footer-col...) continuam as mesmas: o
// estilo fica em Home.css e cada página abre os <details> no desktop.
//
// usuario       — decide se "Anunciar" leva ao /anunciar ou ao /cadastro
// onAbrirLegal  — (aba) => (evento) => abre o LegalModal da página
const RodapeSite = ({ usuario, onAbrirLegal }) => {
  const linkAnunciar = usuario ? '/anunciar' : '/cadastro';

  return (
    <footer className="home-footer">
      <div className="footer-wrap">
        <div className="footer-brand">
          <Link to="/" className="logo">
            <span className="logo-mark">SD</span>
            Santo <em>Desapego</em>
          </Link>
          <p>Marketplace C2C hiperlocal para Santo Amaro, São Paulo. Economia compartilhada e consumo consciente.</p>
        </div>

        <details className="footer-col">
          <summary><h4>Plataforma</h4></summary>
          <div className="footer-col-links">
            <Link to="/#como-funciona">Como funciona</Link>
            <Link to={linkAnunciar}>Anunciar</Link>
            <Link to="/explorar">Categorias</Link>
            <Link to="/sobre">Sobre nós</Link>
          </div>
        </details>

        <details className="footer-col">
          <summary><h4>Suporte</h4></summary>
          <div className="footer-col-links">
            <Link to="/central-ajuda">Central de ajuda</Link>
            <a href={`mailto:${EMAILS.contato}`}>{EMAILS.contato}</a>
            <a href="#termos" onClick={onAbrirLegal('termos')}>Termos de uso</a>
            <a href="#termos" onClick={onAbrirLegal('privacidade')}>Privacidade (LGPD)</a>
          </div>
        </details>
      </div>

      <div className="footer-tcc">
        <p className="footer-autores">
          <span>Luisa Aquino</span>
          <span>Maria Erica Cruz</span>
          <span>Paulo Santana</span>
        </p>

        <div className="cc-license">
          <Link to="/">Santo Desapego</Link> © 2026 by{' '}
          <span className="cc-authors">Paulo Santana, Maria Erica Cruz e Luisa Aquino</span>{' '}
          is licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-NC-ND 4.0
          </a>
          <img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="CC" />
          <img src="https://mirrors.creativecommons.org/presskit/icons/by.svg" alt="BY" />
          <img src="https://mirrors.creativecommons.org/presskit/icons/nc.svg" alt="NC" />
          <img src="https://mirrors.creativecommons.org/presskit/icons/nd.svg" alt="ND" />
        </div>
      </div>
    </footer>
  );
};

export default RodapeSite;
