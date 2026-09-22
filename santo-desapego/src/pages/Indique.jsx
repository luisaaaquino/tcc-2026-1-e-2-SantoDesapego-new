import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Indique.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import LegalModal from '../componentes/LegalModal';
import { IconArrowRight, IconLogout, IconCheck } from '../componentes/Icones';

/* ── Dados — altere aqui sem tocar no JSX ──────────────────── */
const MOTIVOS = [
  {
    num: '01',
    title: 'Mais opções pertinho de casa',
    desc: 'Cada vizinho que entra é mais um sofá, uma bicicleta ou um livro que pode aparecer a poucos quarteirões de você.',
    accent: 'terracotta',
  },
  {
    num: '02',
    title: 'Menos coisa parada, menos lixo',
    desc: 'Quanto mais gente do bairro desapegando, mais itens ganham uma segunda vida em vez de ir pro aterro.',
    accent: 'forest',
  },
  {
    num: '03',
    title: 'Uma comunidade mais forte',
    desc: 'Negócio fechado com quem mora perto cria confiança de verdade — e reputação que vale pra próxima troca.',
    accent: 'mustard',
  },
];

const FOOTER_LINKS = [
  {
    title: 'Plataforma',
    links: ['Como funciona', 'Anunciar', 'Categorias'],
  },
  {
    title: 'Comunidade',
    links: ['Nosso impacto', 'Indique um vizinho'],
  },
  {
    title: 'Suporte',
    links: ['Central de ajuda', 'Termos de uso', 'Privacidade (LGPD)'],
  },
];

/* ── Ícones locais desta página ─────────────────────────────── */
const IconWhatsapp = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.35-.5.05-.96.24-3.24-.68-2.74-1.1-4.5-3.9-4.64-4.08-.14-.19-1.1-1.47-1.1-2.8 0-1.34.7-1.99.96-2.26.24-.27.53-.34.7-.34h.5c.17 0 .38-.03.6.46.24.55.78 1.9.85 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.45-.14.16-.29.36-.41.48-.14.14-.28.28-.12.56.16.28.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.21 1.36.28.14.44.12.6-.07.17-.2.7-.82.88-1.1.19-.28.37-.23.62-.14.26.09 1.6.75 1.87.89.28.14.46.2.53.32.07.13.07.7-.17 1.19Z" />
  </svg>
);
const IconLink = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Indique = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [erroCopia, setErroCopia] = useState(false);

  // ── Menu mobile (hambúrguer + gaveta) — mesmo padrão das outras páginas
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);

  useEffect(() => {
    document.body.style.overflow = menuAberto ? 'hidden' : '';
    if (!menuAberto) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setMenuAberto(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuAberto]);

  // Colunas do rodapé (<details>) ficam sempre abertas
  useEffect(() => {
    document.querySelectorAll('.home-footer details').forEach((d) => { d.open = true; });
  }, []);

  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('sd_usuario');
    if (usuarioSalvo) {
      try {
        setUsuario(JSON.parse(usuarioSalvo));
      } catch {
        localStorage.removeItem('sd_usuario');
        localStorage.removeItem('sd_token');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('sd_token');
    localStorage.removeItem('sd_usuario');
    setUsuario(null);
    navigate('/');
  };

  const linkAnunciar = usuario ? '/anunciar' : '/cadastro';

  // ── Modal de Termos de Uso / Privacidade (aberto pelos links do rodapé)
  const [legalAberto, setLegalAberto] = useState(null); // null | 'termos' | 'privacidade'
  const abrirLegal = (aba) => (e) => {
    e.preventDefault();
    setLegalAberto(aba);
  };

  // ── Convite: mesmo link pra todo mundo (sem código de indicação) ──
  const linkConvite = typeof window !== 'undefined' ? window.location.origin : 'https://santodesapego.com.br';
  const mensagemConvite = `Vem ver o Santo Desapego! A gente compra, vende e troca com os vizinhos aqui de Santo Amaro, sem frete e sem complicação: ${linkConvite}`;
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensagemConvite)}`;

  const linkTextoRef = useRef(null);

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkConvite);
      setCopiado(true);
      setErroCopia(false);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de clipboard (comum fora de HTTPS/contextos restritos) —
      // nunca usar window.prompt/alert aqui: são diálogos bloqueantes que
      // travam a página. Em vez disso, seleciona o texto do link na tela
      // pro usuário copiar manualmente (Ctrl+C) e mostra um aviso simples.
      const el = linkTextoRef.current;
      if (el && window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setErroCopia(true);
      setTimeout(() => setErroCopia(false), 4000);
    }
  };

  return (
    <div className="indique-page">

      {/* ── Announcement ── */}
      <div className="announcement">
        🌱 Economia circular em Santo Amaro:{' '}
        <strong>menos descarte, mais comunidade</strong> entre vizinhos.
      </div>

      {/* ── Header (mesmo padrão da Sobre) ── */}
      <header className="site-header">
        <div className="nav-top sobre-nav">
          <Link to="/" className="logo">
            <span className="logo-mark">SD</span>
            Santo <em>Desapego</em>
          </Link>

          <nav className="sobre-nav-links">
            <Link to="/">Início</Link>
            <Link to="/explorar">Explorar</Link>
            <Link to="/sobre">Sobre nós</Link>
          </nav>

          <nav className="nav-actions">
            {usuario ? (
              <>
                <NotificacoesSino />
                <Link to="/perfil" className="sobre-user-chip" title="Meu perfil">
                  <span className="sobre-user-avatar">
                    {usuario.foto_perfil
                      ? <img src={usuario.foto_perfil} alt="" />
                      : usuario.nome[0].toUpperCase()}
                  </span>
                  Olá, {usuario.nome}!
                </Link>
                <button onClick={handleLogout} className="nav-btn" style={{ cursor: 'pointer', fontFamily: 'inherit' }}>
                  <IconLogout />
                  Sair
                </button>
                <Link to="/anunciar" className="btn-sell">+ Anunciar grátis</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-btn nav-login-btn">Entrar</Link>
                <Link to="/cadastro" className="btn-sell">+ Anunciar grátis</Link>
              </>
            )}
          </nav>

          <button
            type="button"
            className="nav-burger"
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* ── Gaveta do menu (mobile) ── */}
      <div className={`mobile-drawer${menuAberto ? ' open' : ''}`} aria-hidden={!menuAberto}>
        <div className="mobile-drawer-backdrop" onClick={fecharMenu} />
        <nav className="mobile-drawer-panel" aria-label="Menu principal">
          {usuario && (
            <Link to="/perfil" className="drawer-user" onClick={fecharMenu}>
              <span className="drawer-avatar">
                {usuario.foto_perfil
                  ? <img src={usuario.foto_perfil} alt="" />
                  : usuario.nome[0].toUpperCase()}
              </span>
              <span>Olá, {usuario.nome}!<small>Ver meu perfil</small></span>
            </Link>
          )}
          <Link to="/" onClick={fecharMenu}>Início</Link>
          <Link to="/explorar" onClick={fecharMenu}>Explorar desapegos</Link>
          <Link to="/sobre" onClick={fecharMenu}>Sobre nós</Link>
          <Link to="/central-ajuda" onClick={fecharMenu}>Central de ajuda</Link>
          {usuario ? (
            <button type="button" className="drawer-logout" onClick={() => { fecharMenu(); handleLogout(); }}>
              <IconLogout /> Sair
            </button>
          ) : (
            <Link to="/login" onClick={fecharMenu}>Entrar</Link>
          )}
          <Link to={linkAnunciar} className="btn-home-primary drawer-cta" onClick={fecharMenu}>
            + Anunciar grátis
          </Link>
        </nav>
      </div>

      {/* ── Aviso: página em construção — remover quando o programa
          de indicação (código rastreável, recompensas etc.) estiver
          pronto ── */}
      <div className="indique-aviso-obras">
        🚧 <strong>Em breve, novidades por aqui:</strong> essa página ainda vai ganhar mais funcionalidades. Por enquanto, é só compartilhar o link mesmo!
      </div>

      {/* ══════════════════════════════════
          HERO
          ══════════════════════════════════ */}
      <section className="indique-hero">
        <span className="hero-kicker">Indique um vizinho • Santo Amaro</span>
        <h1>
          Quanto mais vizinhos aqui,<br />
          mais <em>desapego</em> pra todo mundo.
        </h1>
        <p className="indique-lede">
          O Santo Desapego funciona melhor quanto mais gente do bairro participa.
          Chama aquele vizinho, o grupo da rua ou a família — quanto mais perto,
          melhor o negócio pros dois lados.
        </p>
      </section>

      {/* ══════════════════════════════════
          CONVITE — compartilhar
          ══════════════════════════════════ */}
      <section className="indique-convite-section">
        <div className="indique-convite-card">
          <span className="badge-ods">Convide agora</span>
          <h2>Manda o link pra quem <em>merece saber</em>.</h2>
          <p>
            Sem código, sem enrolação: é só compartilhar o Santo Desapego com quem
            mora perto de você. Quanto mais vizinhos, mais opções de compra, venda
            e troca aqui do lado de casa.
          </p>

          <div className="indique-link-box">
            <IconLink />
            <span ref={linkTextoRef}>{linkConvite}</span>
          </div>

          <div className="indique-acoes">
            <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer" className="btn-home-primary indique-btn-whatsapp">
              <IconWhatsapp /> Chamar no WhatsApp
            </a>
            <button type="button" className="btn-ghost" onClick={copiarLink}>
              {copiado ? <><IconCheck /> Link copiado!</> : <><IconLink /> Copiar link</>}
            </button>
          </div>

          {erroCopia && (
            <p className="indique-copia-aviso">
              Não consegui copiar automaticamente — selecionei o link acima, é só apertar Ctrl+C (ou Cmd+C).
            </p>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════
          POR QUE INDICAR
          ══════════════════════════════════ */}
      <section className="indique-motivos-section">
        <div className="section">
          <div className="section-head">
            <div>
              <h2>Por que chamar <em>o vizinho</em></h2>
              <p>Cada pessoa nova no Santo Desapego fortalece o bairro inteiro.</p>
            </div>
          </div>

          <div className="indique-motivos-grid">
            {MOTIVOS.map((m) => (
              <article key={m.num} className={`impact-card impact-card--${m.accent}`}>
                <span className="impact-card-num">{m.num}</span>
                <h3 className="impact-card-title">{m.title}</h3>
                <p className="impact-card-desc">{m.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          CTA
          ══════════════════════════════════ */}
      <section className="cta-section">
        <div className="cta-wrap">
          <h2>Ainda não tem uma<br />conta <em>no Santo Desapego</em>?</h2>
          <p>Comece você também — é grátis, leva menos de 2 minutos e o primeiro anúncio pode ser hoje.</p>
          <Link to={linkAnunciar} className="btn-home-primary cta-btn">
            {usuario ? 'Criar novo anúncio' : 'Criar minha conta'} <IconArrowRight />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════
          FOOTER (mesmo das outras páginas)
          ══════════════════════════════════ */}
      <footer className="home-footer">
        <div className="footer-wrap">
          <div className="footer-brand">
            <Link to="/" className="logo">
              <span className="logo-mark">SD</span>
              Santo <em>Desapego</em>
            </Link>
            <p>Marketplace C2C hiperlocal para Santo Amaro, São Paulo. Economia compartilhada e consumo consciente.</p>
          </div>

          {FOOTER_LINKS.map((col) => (
            <details key={col.title} className="footer-col">
              <summary><h4>{col.title}</h4></summary>
              <div className="footer-col-links">
                {col.links.map((l) => {
                  if (l === 'Como funciona') return <Link key={l} to="/#como-funciona">{l}</Link>;
                  if (l === 'Anunciar') return <Link key={l} to={linkAnunciar}>{l}</Link>;
                  if (l === 'Categorias') return <Link key={l} to="/explorar">{l}</Link>;
                  if (l === 'Nosso impacto') return <Link key={l} to="/sobre">Sobre nós</Link>;
                  if (l === 'Indique um vizinho') return <Link key={l} to="/indique" className="active">Indique um vizinho</Link>;
                  if (l === 'Central de ajuda') return <Link key={l} to="/central-ajuda">Central de ajuda</Link>;
                  if (l === 'Termos de uso') return <a key={l} href="#termos" onClick={abrirLegal('termos')}>{l}</a>;
                  if (l === 'Privacidade (LGPD)') return <a key={l} href="#termos" onClick={abrirLegal('privacidade')}>{l}</a>;
                  return <a key={l} href="#">{l}</a>;
                })}
              </div>
            </details>
          ))}
        </div>

        <div className="footer-tcc">
          <div className="footer-tcc-info">
            <div>Luisa Aquino • Maria Erica Cruz • Paulo Santana</div>
          </div>

          <div className="cc-license">
            <Link to="/">Santo Desapego</Link> © 2026 by{' '}
            <span className="cc-authors">Paulo Santana, Maria Erica Cruz e Luisa Nascimento</span>{' '}
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

      <LegalModal aba={legalAberto} onSelectAba={setLegalAberto} onClose={() => setLegalAberto(null)} />

    </div>
  );
};

export default Indique;
