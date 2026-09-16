import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Sobre.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import { IconArrowRight, IconLogout } from '../componentes/Icones';

/* ── Dados — altere aqui sem tocar no JSX ──────────────────── */

// Ajuste os papéis de cada integrante como preferirem!
const TEAM = [
  {
    nome: 'Luisa Aquino',
    papel: 'Desenvolvimento & Banco de Dados',
    bio: 'Responsável pela integração entre a API Node.js e o PostgreSQL, além da configuração do ambiente da aplicação.',
    accent: 'terracotta',
  },
  {
    nome: 'Maria Erica Cruz',
    papel: 'Frontend & Experiência do Usuário',
    bio: 'Cuida das interfaces em React e da jornada de quem compra, vende e troca dentro da plataforma.',
    accent: 'forest',
  },
  {
    nome: 'Paulo Santana',
    papel: 'Backend & Arquitetura',
    bio: 'Estrutura as rotas da API, a autenticação com JWT e as regras de negócio do marketplace.',
    accent: 'mustard',
  },
];

const VALORES = [
  {
    num: '01',
    title: 'Vizinhança em primeiro lugar',
    desc: 'Acreditamos que a melhor transação é a que acontece a pé. Validamos CEPs para garantir que tudo fique dentro do distrito de Santo Amaro.',
    accent: 'terracotta',
  },
  {
    num: '02',
    title: 'Nada vira lixo antes da hora',
    desc: 'Cada sofá, livro ou bicicleta anunciada é um item a menos no aterro — e uma história a mais na casa de alguém.',
    accent: 'forest',
  },
  {
    num: '03',
    title: 'Confiança se constrói',
    desc: 'Avaliações mútuas após cada transação criam uma reputação real, de vizinho para vizinho.',
    accent: 'mustard',
  },
  {
    num: '04',
    title: 'Tecnologia com propósito',
    desc: 'Um projeto acadêmico que usa código para responder a uma pergunta concreta: como o bairro pode consumir melhor?',
    accent: 'ink',
  },
];

const MARCOS = [
  { data: '2025', titulo: 'A pergunta', desc: 'Nasce a inquietação: por que é tão difícil desapegar de algo bom para alguém que mora a duas quadras?' },
  { data: '2026.1', titulo: 'O projeto', desc: 'O Santo Desapego sai do papel: pesquisa, prototipação e as primeiras linhas de código.' },
  { data: '2026.2', titulo: 'A plataforma', desc: 'React, Node.js e PostgreSQL dão forma ao marketplace hiperlocal, com cadastro, anúncios e busca por bairro.' },
  { data: 'Futuro', titulo: 'O bairro inteiro', desc: 'Chat entre vizinhos, entregas de bike e a meta de cobrir os mais de 20 bairros do distrito.' },
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


/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Sobre = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);

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

  return (
    <div className="sobre-page">

      {/* ── Announcement ── */}
      <div className="announcement">
        🌱 Economia circular em Santo Amaro:{' '}
        <strong>menos descarte, mais comunidade</strong> entre vizinhos.
      </div>

      {/* ── Header (mesmo padrão da home, sem search) ── */}
      <header className="site-header">
        <div className="nav-top sobre-nav">
          <Link to="/" className="logo">
            <span className="logo-mark">SD</span>
            Santo <em>Desapego</em>
          </Link>

          <nav className="sobre-nav-links">
            <Link to="/">Início</Link>
            <Link to="/explorar">Explorar</Link>
            <Link to="/sobre" className="active">Sobre nós</Link>
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
        </div>
      </header>

      {/* ══════════════════════════════════
          HERO
          ══════════════════════════════════ */}
      <section className="sobre-hero">
        <span className="hero-kicker">Sobre nós • Santo Amaro, São Paulo</span>
        <h1>
          Somos vizinhos criando um jeito<br />
          mais <em>circular</em> de consumir.
        </h1>
        <p className="sobre-lede">
          O Santo Desapego é um marketplace hiperlocal nascido dentro da faculdade
          e feito para as ruas de Santo Amaro: uma plataforma onde o que sobra na
          sua casa encontra quem precisa — a poucos quarteirões de distância.
        </p>
      </section>

      {/* ══════════════════════════════════
          MANIFESTO / HISTÓRIA
          ══════════════════════════════════ */}
      <section className="sobre-manifesto">
        <div className="sobre-manifesto-wrap">
          <div className="sobre-manifesto-title">
            <span className="badge-ods">Por que existimos</span>
            <h2>Todo objeto parado é uma <em>história interrompida</em>.</h2>
          </div>
          <div className="sobre-manifesto-text">
            <p>
              A ideia nasceu de uma cena comum: móveis bons na calçada esperando o
              caminhão de lixo, enquanto a poucos metros dali alguém procurava
              exatamente aquilo em um marketplace gigante — e pagava frete de outro
              estado.
            </p>
            <p>
              Os grandes marketplaces conectam o Brasil inteiro, mas desconectam o
              quarteirão. O Santo Desapego faz o caminho contrário: valida o CEP de
              cada morador, mostra a distância real entre comprador e vendedor e
              transforma a transação em um encontro de vizinhos.
            </p>
            <p>
              Somos um projeto acadêmico com ambição de bairro — e acreditamos que
              é exatamente nessa escala, a da vizinhança, que a economia circular
              deixa de ser conceito e vira hábito.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          LINHA DO TEMPO
          ══════════════════════════════════ */}
      <section className="sobre-timeline-section">
        <div className="section">
          <div className="section-head">
            <div>
              <h2>Do rascunho ao <em>bairro</em></h2>
              <p>A trajetória do projeto, semestre a semestre.</p>
            </div>
          </div>
          <div className="sobre-timeline">
            {MARCOS.map((m) => (
              <div key={m.data} className="sobre-marco">
                <span className="sobre-marco-data">{m.data}</span>
                <h3>{m.titulo}</h3>
                <p>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          VALORES
          ══════════════════════════════════ */}
      <section className="sobre-valores-section">
        <div className="section">
          <div className="section-head">
            <div>
              <h2>No que a gente <em>acredita</em></h2>
              <p>Os princípios que guiam cada decisão da plataforma.</p>
            </div>
          </div>
          <div className="sobre-valores-grid">
            {VALORES.map((v) => (
              <article key={v.num} className={`impact-card impact-card--${v.accent}`}>
                <span className="impact-card-num">{v.num}</span>
                <h3 className="impact-card-title">{v.title}</h3>
                <p className="impact-card-desc">{v.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          EQUIPE
          ══════════════════════════════════ */}
      <section className="sobre-team-section">
        <div className="section">
          <div className="section-head">
            <div>
              <h2>Quem faz o <em>Santo Desapego</em></h2>
              <p>Três estudantes, um bairro e muitas linhas de código.</p>
            </div>
          </div>
          <div className="sobre-team-grid">
            {TEAM.map((pessoa) => (
              <article key={pessoa.nome} className={`sobre-team-card sobre-team-card--${pessoa.accent}`}>
                <span className="sobre-team-avatar">
                  {pessoa.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </span>
                <h3>{pessoa.nome}</h3>
                <span className="sobre-team-role">{pessoa.papel}</span>
                <p>{pessoa.bio}</p>
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
          <h2>Quer fazer parte<br />dessa <em>história</em>?</h2>
          <p>Anuncie o que está parado, encontre o que procura e conheça seus vizinhos no caminho.</p>
          <Link to={linkAnunciar} className="btn-home-primary cta-btn">
            Começar a desapegar <IconArrowRight />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════
          FOOTER (mesmo da home)
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
                l === 'Central de ajuda'
                  ? <Link key={l} to="/central-ajuda">Central de ajuda</Link>
                  : <a key={l} href="#">{l}</a>
              )}
            </div>
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

    </div>
  );
};

export default Sobre;