import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Home.css';
import Mapa from '../componentes/Mapa';
import SeletorBairro from '../componentes/SeletorBairro';
import NotificacoesSino from '../componentes/NotificacoesSino';
import {
  IconSearch, IconArrowRight, IconLogout, IconGrid, IconSofa, IconLaptop,
  IconShirt, IconBaby, IconBook, IconBike, IconPalette, IconWrench,
  IconHanger, IconMore,
} from '../componentes/Icones';

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
  'Vila Sofia', 'Vila Mascote',
];

const FOOTER_LINKS = [
  {
    title: 'Plataforma',
    links: ['Como funciona', 'Anunciar', 'Categorias'],
  },
  {
    title: 'Comunidade',
    links: ['Nosso impacto', 'Bairros atendidos', 'Indique um vizinho'],
  },
  {
    title: 'Suporte',
    links: ['Central de ajuda', 'Termos de uso', 'Privacidade (LGPD)'],
  },
];

const HERO_CARDS = [
  { img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80', price: 'R$ 480',  hood: 'Sofá • Jardim Marajoara',      cls: 'hero-card-1', accent: 'terracotta' },
  { img: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=400&q=80', price: 'R$ 120',  hood: 'Bicicleta • Campo Belo', cls: 'hero-card-2', accent: 'forest' },
  { img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=80', price: 'R$ 35',   hood: 'Livros • Vila Cruzeiro',          cls: 'hero-card-3', accent: 'mustard' },
  { img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80', price: 'R$ 220',  hood: 'Tênis • Vila Mascote',            cls: 'hero-card-4', accent: 'ink' },
];

/* ── Ícones — UI ────────────────────────────────────────────── */
const IconPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Home = () => {
  const navigate = useNavigate();
  const [termoBusca, setTermoBusca] = useState('');
  const [bairroBusca, setBairroBusca] = useState('');
  const [bairroFoco, setBairroFoco] = useState(null);

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

  const irParaExplorar = (busca, bairro) => {
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    if (bairro) params.set('bairro', bairro);
    const query = params.toString();
    navigate(query ? `/explorar?${query}` : '/explorar');
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    setMostrarSugestoes(false);
    irParaExplorar(termoBusca, bairroBusca);
  };

  const handleBairro = (bairro) => {
    setBairroBusca(bairro);
    irParaExplorar(termoBusca, bairro);
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
            <SeletorBairro value={bairroBusca} onChange={handleBairro} />
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
                <NotificacoesSino />
                <Link to="/sobre" className="nav-btn">Sobre nós</Link>
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
                <button onClick={handleLogout} className="nav-btn" style={{ cursor: 'pointer', fontFamily: 'inherit' }}>
                  <IconLogout />
                  Sair
                </button>
                <Link to="/anunciar" className="btn-sell">+ Anunciar grátis</Link>
              </>
            ) : (
              <>
                <Link to="/sobre" className="nav-btn">Sobre nós</Link>
                <Link to="/login" className="nav-btn">Entrar</Link>
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
          <Link to="/explorar?categoria_id=9"><IconHanger /><span>Brechó vintage</span></Link>
          <Link to="/explorar?categoria_id=10"><IconMore /><span>Outros</span></Link>
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
              Explorar desapegos <IconArrowRight />
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
          <Mapa bairroFoco={bairroFoco} />

          <div className="local-text">
            <h2>Feito <em>pra cá</em>, feito <em>por aqui</em>.</h2>
            <p>
              Diferente de marketplaces globais, o Santo Desapego nasce com foco hiperlocal:
              apenas moradores da região podem anunciar, e todas as transações acontecem
              dentro do distrito. Menos logística, mais vínculo comunitário.
            </p>
            <p>
              A plataforma valida endereços por CEP e prioriza entregas a pé, de bike ou em
              encontros presenciais seguros — sempre perto de casa.
            </p>
            <div className="local-hoods">
              {HOODS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`hood-tag${bairroFoco === h ? ' active' : ''}`}
                  onClick={() => setBairroFoco(bairroFoco === h ? null : h)}
                >
                  📍 {h}
                </button>
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
            {usuario ? 'Criar novo anúncio' : 'Anunciar meu primeiro item'} <IconArrowRight />
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
                  : l === 'Central de ajuda'
                  ? <Link key={l} to="/central-ajuda">Central de ajuda</Link>
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