import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Home.css';
import Mapa from '../componentes/Mapa';

/* ── Dados — altere aqui sem tocar no JSX ──────────────────── */
const STEPS = [
  {
    num: '01',
    title: 'Anuncie em 2 minutos',
    desc: 'Fotografe, descreva, defina o preço. Nosso sistema valida seu CEP e posiciona seu anúncio para vizinhos do bairro.',
  },
  {
    num: '02',
    title: 'Conecte-se com vizinhos',
    desc: 'Converse direto no chat seguro da plataforma. Combine o encontro, a forma de pagamento e esclareça dúvidas em tempo real.',
  },
  {
    num: '03',
    title: 'Feche o negócio perto de casa',
    desc: 'Retire pessoalmente ou escolha entrega hiperlocal. Após a transação, ambos se avaliam e fortalecem a reputação da comunidade.',
  },
];

/* ── Pilares do Santo Desapego ─────────────────────────────── */
const IMPACT_CARDS = [
  {
    num: '01',
    title: 'Hiperlocal',
    desc: 'Cadastros validados por CEP. Anúncios e transações acontecem 100% dentro do distrito de Santo Amaro.',
    accent: 'terracotta',
  },
  {
    num: '02',
    title: 'Circular',
    desc: 'Cada item ganha uma nova história em vez de virar descarte. Menos lixo no aterro, menos produção nova.',
    accent: 'forest',
  },
  {
    num: '03',
    title: 'Comunidade',
    desc: 'Conexões reais entre quem mora perto. A reputação do vizinho se constrói anúncio a anúncio.',
    accent: 'mustard',
  },
  {
    num: '04',
    title: 'Consciente',
    desc: 'Preço justo e ciclo de vida prolongado. Um modelo pensado para um consumo mais responsável.',
    accent: 'ink',
  },
];

const HOODS = [
  'Santo Amaro Centro', 'Jardim Marajoara', 'Campo Belo',
  'Brooklin', 'Granja Julieta', 'Vila Cruzeiro',
  'Vila Sofia', 'Vila Mascote', '+ 12 bairros',
];

const FOOTER_LINKS = [
  {
    title: 'Plataforma',
    links: ['Como funciona', 'Anunciar', 'Categorias', 'Dicas de segurança'],
  },
  {
    title: 'Comunidade',
    links: ['Nosso impacto', 'Bairros atendidos', 'Blog', 'Indique um vizinho'],
  },
  {
    title: 'Suporte',
    links: ['Central de ajuda', 'Fale conosco', 'Termos de uso', 'Privacidade (LGPD)'],
  },
];

const HERO_CARDS = [
  { img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80', price: 'R$ 480',  hood: 'Sofá • Jardim Marajoara',      cls: 'hero-card-1', accent: 'terracotta' },
  { img: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&q=80', price: 'R$ 120',  hood: 'Bicicleta • Campo Belo', cls: 'hero-card-2', accent: 'forest' },
  { img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=80', price: 'R$ 35',   hood: 'Livros • Vila Cruzeiro',          cls: 'hero-card-3', accent: 'mustard' },
  { img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80', price: 'R$ 220',  hood: 'Tênis • Vila Mascote',            cls: 'hero-card-4', accent: 'ink' },
];

/* ── Ícones — UI ────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
const IconPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
    <path d="M5 12h14M13 5l7 7-7 7"/>
  </svg>
);
const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

/* ── Ícones — categorias (line icons editoriais) ──────────── */
const IconGrid = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/>
    <rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>
  </svg>
);
const IconSofa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/>
    <path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/>
    <path d="M4 18v2M20 18v2"/>
  </svg>
);
const IconLaptop = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>
  </svg>
);
const IconShirt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
  </svg>
);
const IconBaby = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/>
    <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>
  </svg>
);
const IconBook = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
  </svg>
);
const IconBike = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/>
    <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
  </svg>
);
const IconPalette = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor"/>
    <circle cx="8.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);
const IconWrench = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const IconHanger = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8a2 2 0 1 1 0-4 2 2 0 0 1 2 2c0 1-.5 1.5-1 2l-9 7a1 1 0 0 0 .6 1.8h16.8a1 1 0 0 0 .6-1.8L12 8z"/>
  </svg>
);
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>
  </svg>
);

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Home = () => {
  const navigate = useNavigate();
  const [termoBusca, setTermoBusca] = useState('');

  // ── Sugestões de busca (dropdown enquanto digita)
  const [sugestoes, setSugestoes] = useState([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  // ── Estado do usuário logado (lê do localStorage)
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('sd_usuario');
    if (usuarioSalvo) {
      try {
        setUsuario(JSON.parse(usuarioSalvo));
      } catch {
        // se o JSON estiver corrompido, limpa pra evitar loop de erro
        localStorage.removeItem('sd_usuario');
        localStorage.removeItem('sd_token');
      }
    }
  }, []);

  // Busca sugestões enquanto digita (com debounce de 300ms)
  useEffect(() => {
    if (termoBusca.trim().length < 2) {
      setSugestoes([]);
      setMostrarSugestoes(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `http://localhost:8080/api/anuncios?busca=${encodeURIComponent(termoBusca.trim())}&limite=5`
        );
        const data = await res.json();
        setSugestoes(data.anuncios || []);
        setMostrarSugestoes(true);
      } catch {
        setSugestoes([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [termoBusca]);

  const handleLogout = () => {
    localStorage.removeItem('sd_token');
    localStorage.removeItem('sd_usuario');
    setUsuario(null);
    navigate('/');
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    setMostrarSugestoes(false);
    if (termoBusca.trim()) {
      navigate(`/explorar?busca=${encodeURIComponent(termoBusca.trim())}`);
    } else {
      navigate('/explorar');
    }
  };

  // ── CTA "Anunciar grátis": leva pra /anunciar se logado, pra /cadastro se visitante ──
  const linkAnunciar = usuario ? '/anunciar' : '/cadastro';

  return (
    <div className="home-page">

      {/* ── Announcement ── */}
      <div className="announcement">
        🌱 Economia circular em Santo Amaro:{' '}
        <strong>menos descarte, mais comunidade</strong> entre vizinhos.
      </div>

      {/* ── Header ── */}
      <header className="site-header">
        <div className="nav-top home-nav">
          <Link to="/" className="logo">
            <span className="logo-mark">SD</span>
            Santo <em>Desapego</em>
          </Link>

          <div className="search-bar">
            <IconSearch />
            <input
              type="text"
              placeholder="Buscar sofá, bicicleta, livro, notebook..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar(e)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              onFocus={() => sugestoes.length > 0 && setMostrarSugestoes(true)}
            />
            <span className="search-location">
              <IconPin />
              Santo Amaro
            </span>
            <button className="search-btn" onClick={handleBuscar}>Buscar</button>

            {mostrarSugestoes && sugestoes.length > 0 && (
              <div className="search-suggestions">
                {sugestoes.map((s) => (
                  <Link key={s.id} to={`/anuncio/${s.id}`}>
                    <span>{s.titulo}</span>
                    <span className="sug-price">R$ {parseFloat(s.preco || 0).toFixed(2)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ───── Header dinâmico: muda se está logado ───── */}
          <nav className="nav-actions">
            {usuario ? (
              <>
                <Link to="/sobre">Sobre nós</Link>
                <Link to="/perfil" style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  color: 'var(--ink)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
                title="Meu perfil"
                >
                  <span style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'var(--terracotta)',
                    color: 'var(--cream)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                  }}>
                    {usuario.foto_perfil
                      ? <img src={usuario.foto_perfil} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : usuario.nome[0].toUpperCase()}
                  </span>
                  Olá, {usuario.nome}!
                </Link>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-muted)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <IconLogout />
                  Sair
                </button>
                <Link to="/anunciar" className="btn-sell">+ Anunciar grátis</Link>
              </>
            ) : (
              <>
                <Link to="/sobre">Sobre nós</Link>
                <Link to="/login">Entrar</Link>
                <Link to="/cadastro" className="btn-sell">+ Anunciar grátis</Link>
              </>
            )}
          </nav>
        </div>

        {/* ── Nav de categorias — linha única com scroll horizontal ── */}
        <nav className="nav-categories">
          <Link to="/explorar" className="nav-cat-all"><IconGrid /><span>Todos</span></Link>
          <Link to="/explorar?categoria_id=1"><IconSofa /><span>Móveis & Casa</span></Link>
          <Link to="/explorar?categoria_id=2"><IconLaptop /><span>Eletrônicos</span></Link>
          <Link to="/explorar?categoria_id=3"><IconShirt /><span>Moda</span></Link>
          <Link to="/explorar?categoria_id=4"><IconBaby /><span>Infantil & Bebê</span></Link>
          <Link to="/explorar?categoria_id=5"><IconBook /><span>Livros</span></Link>
          <Link to="/explorar?categoria_id=6"><IconBike /><span>Esporte & Lazer</span></Link>
          <Link to="/explorar?categoria_id=7"><IconPalette /><span>Arte & Decoração</span></Link>
          <Link to="/explorar?categoria_id=8"><IconWrench /><span>Ferramentas</span></Link>
          <span className="nav-sep" aria-hidden="true" />
          <Link to="/explorar"><IconHanger /><span>Brechó vintage</span></Link>
          <Link to="/explorar?aceita_troca=true"><IconRefresh /><span>Trocas</span></Link>
        </nav>
      </header>

      {/* ══════════════════════════════════
          HERO
          ══════════════════════════════════ */}
      <section className="hero">
        <div className="hero-text">
          <span className="hero-kicker">Economia compartilhada • Santo Amaro</span>
          <h1>
            {usuario ? (
              <>
                Olá, <em>{usuario.nome}</em>! <br />
                Veja o que tem de novo no <em>seu bairro</em>.
              </>
            ) : (
              <>
                Seu desapego <br />
                encontra uma <em>nova história</em> aqui perto.
              </>
            )}
          </h1>
          <p className="lede">
            Uma plataforma hiperlocal de compra, venda e troca entre vizinhos de Santo Amaro.
            Menos descarte, mais comunidade — e produtos com preço justo.
          </p>

          <div className="hero-cta-row">
            <Link to="/explorar" className="btn-home-primary">
              Explorar desapegos <IconArrow />
            </Link>
            <a href="#como-funciona" className="btn-ghost">Como funciona</a>
          </div>

          <div className="hero-trust">
            {[
              { num: '🌱', lbl: 'Economia circular' },
              { num: '🤝', lbl: 'Comunidade local' },
              { num: '♻️',  lbl: 'Consumo consciente' },
            ].map((t) => (
              <div className="trust-item" key={t.lbl}>
                <span className="num">{t.num}</span>
                <span className="lbl">{t.lbl}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual">
          {HERO_CARDS.map((c) => (
            <div key={c.cls} className={`hero-card ${c.cls} hero-card--${c.accent}`}>
              <div className="hero-card-img-wrap">
                <img src={c.img} alt="" />
                <span className="hero-card-price">{c.price}</span>
              </div>
              <div className="hero-card-hood">
                <IconPin />
                {c.hood}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          COMO FUNCIONA
          ══════════════════════════════════ */}
      <section className="how-section" id="como-funciona">
        <div className="section">
          <div className="section-head">
            <div>
              <h2>Três passos. <em>Zero complicação.</em></h2>
              <p>Do cadastro à entrega. Uma experiência pensada pra quem vive em Santo Amaro.</p>
            </div>
          </div>

          <div className="steps">
            {STEPS.map((s) => (
              <div key={s.num} className="step">
                <span className="step-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          NOSSOS PILARES
          ══════════════════════════════════ */}
      <section className="impact-section">
        <div className="impact-wrap">
          <div className="impact-text">
            <span className="badge-ods">Nossos pilares</span>
            <h2>Cada desapego é uma <em>pequena revolução</em> circular.</h2>
            <p>
              Mais que um marketplace, o Santo Desapego propõe um modelo de
              economia circular hiperlocal alinhado aos Objetivos de
              Desenvolvimento Sustentável da ONU — combinando sustentabilidade
              ambiental, vínculo comunitário e fortalecimento da economia
              do bairro.
            </p>
            <a href="#como-funciona" className="btn-ghost">Ver como funciona →</a>
          </div>

          <div className="impact-grid">
            {IMPACT_CARDS.map((c) => (
              <article
                key={c.num}
                className={`impact-card impact-card--${c.accent}`}
              >
                <span className="impact-card-num">{c.num}</span>
                <h3 className="impact-card-title">{c.title}</h3>
                <p className="impact-card-desc">{c.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          LOCAL — SANTO AMARO
          ══════════════════════════════════ */}
      <section className="local-section">
        <div className="local-wrap">
          <Mapa />

          <div className="local-text">
            <h2>Feito <em>pra cá</em>, feito <em>por aqui</em>.</h2>
            <p>
              Diferente de marketplaces globais, o Santo Desapego nasce com foco hiperlocal:
              apenas moradores da região podem anunciar, e todas as transações acontecem
              dentro do distrito. Menos logística, mais vínculo comunitário.
            </p>
            <p>
              A plataforma valida endereços por CEP, exibe a distância exata entre comprador
              e vendedor e prioriza entregas a pé, de bike ou em encontros presenciais seguros.
            </p>
            <div className="local-hoods">
              {HOODS.map((h) => (
                <span key={h} className="hood-tag">{h}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          CTA
          ══════════════════════════════════ */}
      <section className="cta-section">
        <div className="cta-wrap">
          <h2>Tem algo <em>parado em casa</em>?<br />Transforme em desapego.</h2>
          <p>{usuario
            ? 'Anúncio em 2 minutos. Seu próximo vizinho-comprador está aqui do lado.'
            : 'Cadastro gratuito, anúncio em 2 minutos. Seu próximo vizinho-comprador está aqui do lado.'}</p>
          <Link to={linkAnunciar} className="btn-home-primary cta-btn">
            {usuario ? 'Criar novo anúncio' : 'Anunciar meu primeiro item'} <IconArrow />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════
          FOOTER
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
            <div key={col.title} className="footer-col">
              <h4>{col.title}</h4>
              {col.links.map((l) =>
                l === 'Nosso impacto'
                  ? <Link key={l} to="/sobre">Sobre nós</Link>
                  : <a key={l} href="#">{l}</a>
              )}
            </div>
          ))}
        </div>

        <div className="footer-tcc">
          <div className="footer-tcc-info">
            <div>
              <strong>Projeto acadêmico</strong> — Trabalho de Conclusão de Curso • Bacharelado em Sistemas de Informação • Centro Universitário Senac Santo Amaro
            </div>
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

    </div>
  );
};

export default Home;