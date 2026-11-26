import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GavetaPerfil from '../componentes/GavetaPerfil';
import './Home.css';
import Mapa from '../componentes/Mapa';
import SeletorBairro, { BAIRROS } from '../componentes/SeletorBairro';
import NotificacoesSino from '../componentes/NotificacoesSino';
import LegalModal from '../componentes/LegalModal';
import RodapeSite from '../componentes/RodapeSite';
import CartaoAnuncio from '../componentes/CartaoAnuncio';
import { IconSearch, IconLogout, IconCamera, IconShield, IconCheck } from '../componentes/Icones';
import { PlacaBairro } from '../componentes/CartaoAnuncio';
import { API_URL } from '../config';
import { formatarPreco } from '../utils/formato';
import { montarMoment } from '../utils/camadaMovimento';

/* ── Como funciona: o fluxo real de uma venda, em ordem ───────── */
const PASSOS = [
  {
    titulo: 'Anuncie',
    texto: 'Foto, descrição e preço. Só é possível anunciar com CEP de Santo Amaro e região.',
  },
  {
    titulo: 'Pague pelo site',
    texto: 'O comprador paga com cartão pelo Mercado Pago. O valor fica retido até a entrega.',
  },
  {
    titulo: 'Confirme a entrega',
    texto: 'Vocês combinam a entrega pelo chat. O comprador digita o código recebido e o valor é liberado ao vendedor.',
  },
];

const HOODS = BAIRROS;

/* ── Janelas do "Como funciona" ───────────────────────────────
   Cada passo mostra o pedaço da interface do próprio site em que
   ele acontece (formulário do anúncio, resumo do checkout, código
   de entrega no perfil), com o anúncio mais recente quando houver.
   São ilustrações: aria-hidden e sem nada clicável dentro. */
const JanelaAnuncio = ({ item }) => (
  <div className="janela" aria-hidden="true">
    <div className="janela-foto">
      {item?.imagem_principal ? <img src={item.imagem_principal} alt="" /> : <IconCamera size={28} />}
    </div>
    <div className="janela-corpo">
      <span className="janela-rotulo">Título</span>
      <span className="janela-campo">{item?.titulo || 'Seu item'}</span>
      <span className="janela-rotulo">Preço</span>
      <span className="janela-campo">{item ? formatarPreco(item.preco) : 'R$ 0,00'}</span>
      <div className="janela-linha">
        <PlacaBairro bairro={item?.bairro} />
        <span className="janela-botao">Publicar anúncio</span>
      </div>
    </div>
  </div>
);

const JanelaPagamento = ({ item }) => (
  <div className="janela" aria-hidden="true">
    <div className="janela-corpo">
      <div className="janela-resumo">
        <span className="janela-miniatura">
          {item?.imagem_principal ? <img src={item.imagem_principal} alt="" /> : <IconCamera size={18} />}
        </span>
        <span className="janela-resumo-titulo">{item?.titulo || 'Seu item'}</span>
        <strong>{item ? formatarPreco(item.preco) : 'R$ 0,00'}</strong>
      </div>
      <p className="janela-aviso"><IconShield size={16} /> O valor fica retido até a entrega.</p>
      <span className="janela-botao janela-botao--largo">Ir para o pagamento</span>
    </div>
  </div>
);

const CODIGO_EXEMPLO = ['4', '8', '1', '5', '2', '7'];
const JanelaEntrega = () => (
  <div className="janela" aria-hidden="true">
    <div className="janela-corpo">
      <span className="janela-rotulo">Código de entrega</span>
      <div className="janela-codigo">
        {CODIGO_EXEMPLO.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <span className="janela-botao janela-botao--largo">Confirmar recebimento</span>
      <p className="janela-ok"><IconCheck size={16} /> Valor liberado ao vendedor</p>
    </div>
  </div>
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

  // ── Anúncios recentes e categorias (o conteúdo da página)
  const [recentes, setRecentes] = useState(null); // null = carregando
  const [categorias, setCategorias] = useState([]);

  // ── Moment "pinned-chapters" (skill design-taste-frontend) no Como funciona
  const comoRef = useRef(null);
  useEffect(() => montarMoment(comoRef.current), []);

  // Fotos da abertura: os três anúncios recentes que têm foto
  const vitrine = (recentes || []).filter((a) => a.imagem_principal).slice(0, 3);
  const mostrarVitrine = recentes === null || vitrine.length === 3;
  const exemplo = vitrine[0] || (recentes || [])[0];

  useEffect(() => {
    fetch(`${API_URL}/api/anuncios?ordenacao=recentes&limite=8`)
      .then((r) => r.json())
      .then((d) => setRecentes(d.anuncios || []))
      .catch(() => setRecentes([]));
    fetch(`${API_URL}/api/categorias`)
      .then((r) => r.json())
      .then((d) => setCategorias((d.categorias || []).filter((c) => !c.categoria_pai)))
      .catch(() => setCategorias([]));
  }, []);

  // ── Menu mobile (hambúrguer + gaveta)
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

  // ── Modal de Termos de Uso / Privacidade (aberto pelos links do rodapé)
  const [legalAberto, setLegalAberto] = useState(null); // null | 'termos' | 'privacidade'
  const abrirLegal = (aba) => (e) => {
    e.preventDefault();
    setLegalAberto(aba);
  };

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
          `${API_URL}/api/anuncios?busca=${encodeURIComponent(termoBusca.trim())}&limite=5`
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
              placeholder="Buscar sofá, bicicleta, livro…"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar(e)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              onFocus={() => sugestoes.length > 0 && setMostrarSugestoes(true)}
            />
            <SeletorBairro value={bairroBusca} onChange={handleBairro} />
            <button className="search-btn" onClick={handleBuscar} aria-label="Buscar">
              <span className="search-btn-label">Buscar</span>
              <span className="search-btn-icon"><IconSearch /></span>
            </button>

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
            <Link to="/explorar" className="nav-link">Explorar</Link>
            <Link to="/sobre" className="nav-link">Sobre nós</Link>
            {usuario ? (
              <>
                <NotificacoesSino />
                <Link to="/perfil" className="nav-profile-chip" style={{
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
                    width: '2.35em', // proporcional à letra: cresce junto com o texto ampliado
                    height: '2.35em',
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
          <Link to="/explorar" onClick={fecharMenu}>Explorar desapegos</Link>
          <a href="#como-funciona" onClick={fecharMenu}>Como funciona</a>
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

      <main className="inicio">

        {/* ── Abertura: o que é, em uma frase, as duas ações e as categorias;
               ao lado, as fotos dos anúncios mais recentes. Entra uma vez ao
               carregar (data-enter, camada de movimento da skill). ── */}
        <section
          className={`inicio-abertura hero bg-topglow${mostrarVitrine ? '' : ' sem-vitrine'}`}
          data-enter
          aria-labelledby="titulo-inicio"
        >
          <div className="inicio-abertura-texto">
            <h1 id="titulo-inicio">Usados à venda entre vizinhos de Santo Amaro</h1>
            <p>
              Compre e venda perto de casa. O pagamento fica retido no Mercado Pago
              até o comprador confirmar que recebeu o item.
            </p>
            <div className="inicio-acoes">
              <Link to={linkAnunciar} className="btn-primary">Anunciar um item</Link>
              <a href="#como-funciona" className="nav-btn">Como funciona</a>
            </div>
            {/* ── Categorias ── */}
            {categorias.length > 0 && (
              <nav className="inicio-categorias" aria-label="Categorias">
                <Link to="/explorar" className="m-link m-link--bare">Todas</Link>
                {categorias.map((c) => (
                  <Link key={c.id} to={`/explorar?categoria_id=${c.id}`} className="m-link m-link--bare">{c.nome}</Link>
                ))}
              </nav>
            )}
          </div>

          {mostrarVitrine && (
            <div className="inicio-vitrine" data-enter-media>
              {recentes === null
                ? [0, 1, 2].map((i) => <span key={i} className="inicio-vitrine-foto" />)
                : vitrine.map((v, i) => (
                    <Link
                      key={v.id}
                      to={`/anuncio/${v.id}`}
                      className="inicio-vitrine-foto m-zoom"
                      aria-label={`${v.titulo}, ${formatarPreco(v.preco)}`}
                    >
                      <img src={v.imagem_principal} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
                    </Link>
                  ))}
            </div>
          )}
        </section>

        {/* ── Anúncios recentes (o conteúdo principal) ── */}
        <section className="inicio-recentes" aria-labelledby="titulo-recentes">
          <div className="inicio-titulo-linha">
            <h2 id="titulo-recentes">Anunciados recentemente</h2>
            <Link to="/explorar" className="inicio-ver-todos m-link">Ver todos os anúncios</Link>
          </div>

          {recentes === null ? (
            <p className="inicio-vazio">Carregando anúncios…</p>
          ) : recentes.length === 0 ? (
            <div className="inicio-vazio">
              <p>Ainda não há anúncios ativos. Que tal publicar o primeiro?</p>
              <Link to={linkAnunciar} className="btn-primary">Anunciar um item</Link>
            </div>
          ) : (
            <div className="inicio-grade">
              {recentes.map((a, i) => <CartaoAnuncio key={a.id} anuncio={a} prioridade={i < 4} />)}
            </div>
          )}
        </section>

        {/* ── Como funciona: o fluxo real de uma venda. Moment "pinned-chapters"
               da skill: no computador a seção fica parada enquanto os três passos
               abrem um a um e a janela ao lado troca; no celular, com "reduzir
               movimento" ou sem script, os passos ficam um embaixo do outro. ── */}
        <section
          className="inicio-como"
          id="como-funciona"
          aria-labelledby="titulo-como"
          data-moment="pinned-chapters"
          ref={comoRef}
        >
          <div className="mo-pc__grid">
            <div className="mo-pc__text">
              <h2 id="titulo-como">Como funciona uma venda</h2>
              <ol className="mo-pc__steps">
                {PASSOS.map((p, i) => (
                  <li key={p.titulo} className="mo-pc__step">
                    <h3><span className="inicio-passo-num" aria-hidden="true">{i + 1}</span>{p.titulo}</h3>
                    <p>{p.texto}</p>
                    <figure className="mo-pc__visual mo-pc__visual--lit">
                      {i === 0 && <JanelaAnuncio item={exemplo} />}
                      {i === 1 && <JanelaPagamento item={exemplo} />}
                      {i === 2 && <JanelaEntrega />}
                    </figure>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mo-pc__visuals" />
          </div>
        </section>

        {/* ── Bairros atendidos (mapa) ── */}
        <section className="inicio-bairros" aria-labelledby="titulo-bairros">
          <div className="inicio-bairros-texto">
            <h2 id="titulo-bairros">Bairros atendidos</h2>
            <p>
              O Santo Desapego funciona em {HOODS.length} bairros de Santo Amaro e arredores.
              Qualquer pessoa pode comprar; para anunciar, o CEP precisa ser desta região.
            </p>
            <div className="inicio-bairros-lista">
              {HOODS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`inicio-bairro${bairroFoco === h ? ' ativo' : ''}`}
                  aria-pressed={bairroFoco === h}
                  onClick={() => setBairroFoco(bairroFoco === h ? null : h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <Mapa bairroFoco={bairroFoco} />
        </section>

      </main>

      {/* ══════════════════════════════════
          FOOTER
          ══════════════════════════════════ */}
      <RodapeSite usuario={usuario} onAbrirLegal={abrirLegal} />

      {/* ══════════════════════════════════
          MODAL — TERMOS DE USO / PRIVACIDADE
          ══════════════════════════════════ */}
      <LegalModal aba={legalAberto} onSelectAba={setLegalAberto} onClose={() => setLegalAberto(null)} />

    </div>
  );
};

export default Home;