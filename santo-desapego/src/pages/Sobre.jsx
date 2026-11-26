import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Sobre.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import LegalModal from '../componentes/LegalModal';
import RodapeSite from '../componentes/RodapeSite';
import { IconLogout } from '../componentes/Icones';

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
    bio: 'Cuida das interfaces em React e da jornada de quem compra e vende dentro da plataforma.',
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
  { data: 'Próximos passos', titulo: 'O bairro inteiro', desc: 'Chegar aos bairros do distrito que ainda não estão na lista de atendimento.' },
];


/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Sobre = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);

  // ── Menu mobile (hambúrguer + gaveta) — mesmo padrão da Home/Explorar.
  // Abaixo de 768px o .sobre-nav-links (Início/Explorar/Sobre nós) some
  // e precisa de um jeito alternativo de navegar.
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

  return (
    <div className="sobre-page">


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
            <Link to="/sobre" className="active" aria-current="page">Sobre nós</Link>
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
                  {usuario.nome}
                </Link>
                <button onClick={handleLogout} className="nav-btn" style={{ cursor: 'pointer', fontFamily: 'inherit' }}>
                  <IconLogout />
                  Sair
                </button>
                <Link to="/anunciar" className="btn-sell">Anunciar</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-btn nav-login-btn">Entrar</Link>
                <Link to="/cadastro" className="btn-sell">Anunciar</Link>
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
              <span>{usuario.nome}<small>Ver meu perfil</small></span>
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
            Anunciar
          </Link>
        </nav>
      </div>

      <main className="sobre">

        <section className="sobre-abertura">
          <h1>Sobre o Santo Desapego</h1>
          <p className="sobre-lede">
            O Santo Desapego é um marketplace de usados para quem mora em Santo Amaro
            e região. Nasceu como Trabalho de Conclusão de Curso no Centro Universitário
            Senac Santo Amaro: o que sobra numa casa encontra quem precisa a poucos
            quarteirões de distância.
          </p>
        </section>

        <section className="sobre-bloco">
          <h2>Por que existe</h2>
          <div className="sobre-texto">
            <p>
              A ideia nasceu de uma cena comum: móveis bons na calçada esperando o
              caminhão de lixo, enquanto a poucos metros dali alguém procurava
              exatamente aquilo em um marketplace grande, comprando de outro estado.
            </p>
            <p>
              Os grandes marketplaces conectam o Brasil inteiro, mas não o quarteirão.
              O Santo Desapego faz o caminho contrário: anúncios só com CEP da região,
              busca e ordenação por bairro e a entrega combinada entre vizinhos.
            </p>
          </div>
        </section>

        <section className="sobre-bloco">
          <h2>Trajetória do projeto</h2>
          <ol className="sobre-linha">
            {MARCOS.map((m) => (
              <li key={m.data}>
                <span className="sobre-linha-data">{m.data}</span>
                <div>
                  <h3>{m.titulo}</h3>
                  <p>{m.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="sobre-bloco">
          <h2>No que a gente acredita</h2>
          <dl className="sobre-valores">
            {VALORES.map((v) => (
              <div key={v.title}>
                <dt>{v.title}</dt>
                <dd>{v.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="sobre-bloco">
          <h2>Quem faz</h2>
          <ul className="sobre-equipe">
            {TEAM.map((pessoa) => (
              <li key={pessoa.nome}>
                <span className="sobre-equipe-iniciais" aria-hidden="true">
                  {pessoa.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </span>
                <div>
                  <h3>{pessoa.nome}</h3>
                  <p className="sobre-equipe-papel">{pessoa.papel}</p>
                  <p>{pessoa.bio}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="sobre-fim">
          <p>Tem algo parado em casa? Anunciar leva poucos minutos.</p>
          <Link to={linkAnunciar} className="btn-primary">Anunciar um item</Link>
        </section>

      </main>

      {/* ══════════════════════════════════
          FOOTER (mesmo da home)
          ══════════════════════════════════ */}
      <RodapeSite usuario={usuario} onAbrirLegal={abrirLegal} />

      <LegalModal aba={legalAberto} onSelectAba={setLegalAberto} onClose={() => setLegalAberto(null)} />

    </div>
  );
};

export default Sobre;