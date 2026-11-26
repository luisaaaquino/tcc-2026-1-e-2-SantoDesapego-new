import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GavetaPerfil from '../componentes/GavetaPerfil';
import './Sobre.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import LegalModal from '../componentes/LegalModal';
import RodapeSite from '../componentes/RodapeSite';
import { IconLogout, IconCheck, IconArrowRight, IconPin, IconSearch, IconChat } from '../componentes/Icones';
import { BAIRROS } from '../componentes/SeletorBairro';

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
  { num: '01', title: 'Vizinhança primeiro', desc: 'A melhor venda é a que se resolve a pé.', accent: 'terracotta' },
  { num: '02', title: 'Nada vira lixo', desc: 'Cada item anunciado é um a menos no aterro.', accent: 'forest' },
  { num: '03', title: 'Confiança se constrói', desc: 'Avaliações de vizinho para vizinho.', accent: 'mustard' },
  { num: '04', title: 'Tecnologia com propósito', desc: 'Código a serviço do bairro.', accent: 'ink' },
];

const MARCOS = [
  { data: '2025', titulo: 'A pergunta', desc: 'Nasce a inquietação: por que é tão difícil desapegar de algo bom para alguém que mora a duas quadras?' },
  { data: '2026.1', titulo: 'O projeto', desc: 'O Santo Desapego sai do papel: pesquisa, prototipação e as primeiras linhas de código.' },
  { data: '2026.2', titulo: 'A plataforma', desc: 'React, Node.js e PostgreSQL dão forma ao marketplace hiperlocal, com cadastro, anúncios e busca por bairro.' },
  { data: 'Próximos passos', titulo: 'O bairro inteiro', desc: 'Chegar aos bairros do distrito que ainda não estão na lista de atendimento.' },
];


// Os três jeitos de manter a venda no bairro (ilustração do "Por que existe")
const PILARES = [
  { Icone: IconPin, titulo: 'Só CEP da região', texto: 'Para anunciar, o CEP precisa ser de Santo Amaro e arredores.' },
  { Icone: IconSearch, titulo: 'Busca por bairro', texto: 'Os anúncios mais perto de você aparecem primeiro.' },
  { Icone: IconChat, titulo: 'Entrega entre vizinhos', texto: 'Vocês combinam pelo chat e se encontram no bairro.' },
];

// Faz cada [data-revelar] aparecer suavemente quando entra na tela.
// Sem IntersectionObserver ou com "reduzir movimento", tudo já aparece.
const useRevelarAoRolar = (ref) => {
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;
    const itens = raiz.querySelectorAll('[data-revelar]');
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzir || typeof IntersectionObserver === 'undefined') {
      itens.forEach((el) => el.setAttribute('data-visivel', ''));
      return undefined;
    }
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) {
          e.target.setAttribute('data-visivel', '');
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    itens.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ref]);
};

const useContador = (alvo, duracao = 1100) => {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let quadro;
    const inicio = performance.now();
    const passo = (agora) => {
      const t = reduzir ? 1 : Math.min(1, (agora - inicio) / duracao);
      const suave = 1 - (1 - t) ** 3;
      setValor(Math.round(alvo * suave));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracao]);
  return valor;
};

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Sobre = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);

  // ── Interações da página
  const [marcoAtivo, setMarcoAtivo] = useState(2);
  const totalBairros = useContador(BAIRROS.length);
  const mainRef = useRef(null);
  useRevelarAoRolar(mainRef);

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
          <GavetaPerfil usuario={usuario} onNavegar={fecharMenu} />
          <Link to="/" onClick={fecharMenu}>Início</Link>
          <Link to="/explorar" onClick={fecharMenu}>Explorar desapegos</Link>
          <Link to="/sobre" onClick={fecharMenu}>Sobre nós</Link>
          <Link to="/central-ajuda" onClick={fecharMenu}>Central de ajuda</Link>
          {usuario && (
            <button type="button" className="drawer-logout" onClick={() => { fecharMenu(); handleLogout(); }}>
              <IconLogout /> Sair
            </button>
          )}
          <Link to={linkAnunciar} className="btn-home-primary drawer-cta" onClick={fecharMenu}>
            Anunciar
          </Link>
        </nav>
      </div>

      <main className="sobre" ref={mainRef}>

        {/* ── Abertura ── */}
        <section className="sobre-abertura" aria-labelledby="titulo-sobre">
          <div className="sobre-abertura-texto">
            <h1 id="titulo-sobre">
              Um marketplace do tamanho do{' '}
              <span className="sobre-destaque">
                bairro
                <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 14 C 50 4, 120 4, 197 11" />
                </svg>
              </span>
            </h1>
            <p className="sobre-lede">
              Usados de vizinho para vizinho em Santo Amaro e região. O que sobra numa
              casa chega a quem precisa, a poucas quadras.
            </p>
            <div className="sobre-acoes">
              <Link to="/explorar" className="btn-primary">Ver os desapegos <IconArrowRight size={16} /></Link>
              <a href="#quem-faz" className="nav-btn">Conhecer a equipe</a>
            </div>
          </div>

          <dl className="sobre-numeros" aria-label="O Santo Desapego em números">
            <div className="sobre-numero sobre-numero--destaque">
              <dd aria-label={String(BAIRROS.length)}>{totalBairros}</dd>
              <dt>bairros atendidos</dt>
              <div className="sobre-letreiro" aria-hidden="true">
                <div className="sobre-letreiro-faixa">
                  {[...BAIRROS, ...BAIRROS].map((b, i) => <span key={i}>{b}</span>)}
                </div>
              </div>
            </div>
            <div className="sobre-numero">
              <dd>5%</dd>
              <dt>de taxa, só quando a venda acontece</dt>
            </div>
            <div className="sobre-numero">
              <dd>R$&nbsp;0</dd>
              <dt>para anunciar</dt>
            </div>
          </dl>
        </section>

        {/* ── Por que existe: a cena + mini mapa animado ── */}
        <section className="sobre-bloco sobre-porque" aria-labelledby="titulo-porque" data-revelar>
          <div className="sobre-porque-texto">
            <span className="sobre-sobretitulo">Por que existe</span>
            <h2 id="titulo-porque">Os grandes marketplaces conectam o Brasil. A gente conecta o quarteirão.</h2>
            <ol className="sobre-historia">
              <li>
                <span className="sobre-historia-rotulo">A cena</span>
                <p>
                  Móveis bons na calçada esperando o caminhão de lixo, enquanto a poucos
                  metros dali alguém procurava exatamente aquilo num marketplace grande,
                  comprando de outro estado.
                </p>
              </li>
              <li>
                <span className="sobre-historia-rotulo sobre-historia-rotulo--verde">A resposta</span>
                <p>
                  O Santo Desapego faz o caminho contrário: o que sobra numa casa encontra
                  quem precisa a poucas quadras.
                </p>
              </li>
            </ol>
          </div>

          <div className="sobre-mapinha">
            <figure className="sobre-mapinha-quadro" aria-hidden="true">
              <svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice">
                {/* quarteirões */}
                <g className="mapinha-quadras">
                  <rect x="20" y="20" width="90" height="70" rx="6" />
                  <rect x="130" y="20" width="120" height="70" rx="6" />
                  <rect x="270" y="20" width="110" height="70" rx="6" />
                  <rect x="20" y="110" width="90" height="70" rx="6" />
                  <rect x="130" y="110" width="50" height="70" rx="6" />
                  <rect x="200" y="110" width="50" height="70" rx="6" />
                  <rect x="270" y="110" width="110" height="70" rx="6" />
                  <rect x="20" y="200" width="90" height="70" rx="6" />
                  <rect x="130" y="200" width="120" height="70" rx="6" />
                  <rect x="270" y="200" width="110" height="70" rx="6" />
                </g>
                {/* rota curta: pelas ruas, entre vizinhos */}
                <path className="mapinha-rota" d="M120 190 H190 V100 H260" />
                {/* pinos */}
                <g className="mapinha-pino mapinha-pino--a" transform="translate(120 190)">
                  <circle className="mapinha-onda" r="10" />
                  <circle r="9" />
                </g>
                <g className="mapinha-pino mapinha-pino--b" transform="translate(260 100)">
                  <circle className="mapinha-onda" r="10" />
                  <circle r="9" />
                </g>
              </svg>
              <span className="mapinha-etiqueta mapinha-etiqueta--a">Sofá na calçada</span>
              <span className="mapinha-etiqueta mapinha-etiqueta--b">Vizinho procurando</span>
              <span className="mapinha-etiqueta mapinha-etiqueta--rota">a poucas quadras</span>
            </figure>

            <ul className="sobre-pilares">
              {PILARES.map(({ Icone, titulo, texto }, i) => (
                <li key={titulo} style={{ '--i': i }}>
                  <span className="sobre-pilar-icone" aria-hidden="true"><Icone size={18} /></span>
                  <div>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Trajetória: linha do tempo clicável ── */}
        <section className="sobre-bloco" aria-labelledby="titulo-trajetoria" data-revelar>
          <span className="sobre-sobretitulo">Trajetória</span>
          <h2 id="titulo-trajetoria">Da pergunta à plataforma</h2>

          <div className="sobre-tempo">
            <ol
              className="sobre-tempo-marcos"
              style={{ '--p': marcoAtivo / (MARCOS.length - 1) }}
            >
              {MARCOS.map((m, i) => (
                <li key={m.data}>
                  <button
                    type="button"
                    className={`${i === marcoAtivo ? 'ativo' : ''}${i < marcoAtivo ? ' passado' : ''}`}
                    aria-pressed={i === marcoAtivo}
                    aria-controls="sobre-tempo-detalhe"
                    onClick={() => setMarcoAtivo(i)}
                  >
                    <span className="sobre-tempo-ponto" aria-hidden="true" />
                    <span className="sobre-tempo-data">{m.data}</span>
                    <span className="sobre-tempo-titulo">{m.titulo}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div id="sobre-tempo-detalhe" className="sobre-tempo-detalhe" aria-live="polite">
              <div key={marcoAtivo} className="sobre-tempo-detalhe-conteudo">
                <span className="sobre-tempo-detalhe-data">{MARCOS[marcoAtivo].data}</span>
                <h3>{MARCOS[marcoAtivo].titulo}</h3>
                <p>{MARCOS[marcoAtivo].desc}</p>
              </div>
              <div className="sobre-tempo-navegar">
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => setMarcoAtivo((i) => Math.max(0, i - 1))}
                  disabled={marcoAtivo === 0}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => setMarcoAtivo((i) => Math.min(MARCOS.length - 1, i + 1))}
                  disabled={marcoAtivo === MARCOS.length - 1}
                >
                  Próximo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Valores ── */}
        <section className="sobre-bloco" aria-labelledby="titulo-valores">
          <span className="sobre-sobretitulo" data-revelar>No que a gente acredita</span>
          <h2 id="titulo-valores" data-revelar>Quatro princípios que guiaram cada tela</h2>
          <ul className="sobre-valores">
            {VALORES.map((v, i) => (
              <li
                key={v.title}
                className={`sobre-valor sobre-valor--${v.accent}`}
                data-revelar
                style={{ '--atraso': `${i * 70}ms` }}
              >
                <span className="sobre-valor-num" aria-hidden="true">{v.num}</span>
                <h3>{v.title}</h3>
                <p>{v.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Equipe ── */}
        <section className="sobre-bloco" id="quem-faz" aria-labelledby="titulo-equipe">
          <span className="sobre-sobretitulo" data-revelar>Quem faz</span>
          <h2 id="titulo-equipe" data-revelar>Três estudantes, um bairro</h2>
          <p className="sobre-intro" data-revelar>Passe o mouse em cada pessoa para ver o que ela faz no projeto.</p>
          <ul className="sobre-equipe">
            {TEAM.map((pessoa, i) => (
              <li
                key={pessoa.nome}
                className={`sobre-pessoa sobre-pessoa--${pessoa.accent}`}
                data-revelar
                tabIndex={0}
                style={{ '--atraso': `${i * 90}ms` }}
              >
                <span className="sobre-pessoa-iniciais" aria-hidden="true">
                  {pessoa.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </span>
                <h3>{pessoa.nome}</h3>
                <p className="sobre-pessoa-papel">{pessoa.papel}</p>
                <div className="sobre-pessoa-bio">
                  <span className="sobre-pessoa-bio-rotulo">No projeto</span>
                  <p>{pessoa.bio}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Chamada final ── */}
        <section className="sobre-fim" data-revelar>
          <div>
            <h2>Tem algo parado em casa?</h2>
            <p>Anunciar leva poucos minutos e não custa nada. Alguém a poucas quadras pode estar procurando.</p>
          </div>
          <div className="sobre-fim-acoes">
            <Link to={linkAnunciar} className="btn-primary">Anunciar um item</Link>
            <Link to="/explorar" className="sobre-fim-link">
              <IconCheck size={16} /> Ver o que já está à venda
            </Link>
          </div>
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