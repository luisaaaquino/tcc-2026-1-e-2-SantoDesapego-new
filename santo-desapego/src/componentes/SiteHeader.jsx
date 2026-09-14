import { Link } from 'react-router-dom';
import { IconArrowLeft } from './Icones';

/* ── Cabeçalho compartilhado ────────────────────────────────
   Usado pelas páginas com o padrão "simples" de header
   (logo + nav de ações). Home, Explorar e Sobre têm headers
   com busca/categorias/tabs próprios e não usam este componente. ── */
const SiteHeader = ({ variant = '', children }) => (
  <header className="site-header">
    <div className={variant ? `nav-top ${variant}` : 'nav-top'}>
      <Link to="/" className="logo">
        <span className="logo-mark">SD</span>
        Santo <em>Desapego</em>
      </Link>
      {children ? <nav className="nav-actions">{children}</nav> : null}
    </div>
  </header>
);

export const NavBackButton = ({ to, children }) => (
  <Link to={to} className="nav-btn">
    <IconArrowLeft />
    {children}
  </Link>
);

export default SiteHeader;
