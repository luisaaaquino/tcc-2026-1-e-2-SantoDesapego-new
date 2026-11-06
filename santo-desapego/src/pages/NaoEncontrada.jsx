import { Link } from 'react-router-dom';
import SiteHeader from '../componentes/SiteHeader';
import './NaoEncontrada.css';

/* ── Página não encontrada (rota "*") ────────────────────────
   Antes, endereço inexistente (ou link antigo, como /indique)
   mostrava a tela toda em branco. ── */
const NaoEncontrada = () => (
  <div className="nao-encontrada-wrapper">
    <SiteHeader />
    <main className="nao-encontrada">
      <span className="nao-encontrada-codigo" aria-hidden="true">404</span>
      <h1>Página não encontrada</h1>
      <p>O endereço pode ter mudado ou a página não existe mais.</p>
      <div className="nao-encontrada-acoes">
        <Link to="/explorar" className="nao-encontrada-btn">Ver os desapegos</Link>
        <Link to="/" className="nao-encontrada-btn secundario">Ir para o início</Link>
      </div>
    </main>
  </div>
);

export default NaoEncontrada;
