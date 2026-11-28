import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GavetaPerfil from '../componentes/GavetaPerfil';
import './Home.css';
import Mapa from '../componentes/Mapa';
import SeletorBairro, { BAIRROS } from '../componentes/SeletorBairro';
import NotificacoesSino from '../componentes/NotificacoesSino';
import LegalModal from '../componentes/LegalModal';
import RodapeSite from '../componentes/RodapeSite';
import BarraCategorias from '../componentes/BarraCategorias';
import CartaoAnuncio from '../componentes/CartaoAnuncio';
import { IconSearch, IconLogout, IconPin, IconTag, IconShield } from '../componentes/Icones';
import { API_URL } from '../config';
import { rolarAteSecao } from '../utils/rolagem';

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

/* ── Vantagens (abertura): só o que o site faz de verdade ─────── */
const VANTAGENS = [
  {
    Icone: IconTag,
    titulo: 'Anúncio pronto com ajuda da IA',
    texto: 'Conte o que quer vender numa frase ou numa conversa. A IA monta o título e a descrição, e você confere antes de publicar.',
  },
  {
    Icone: IconPin,
    titulo: 'Tudo perto de você',
    texto: `Anúncios de ${BAIRROS.length} bairros de Santo Amaro e arredores. Vocês combinam a entrega, sem frete e sem esperar transportadora.`,
  },
  {
    Icone: IconShield,
    titulo: 'Pagamento protegido',
    texto: 'O valor fica retido no Mercado Pago e só vai para o vendedor quando você confirma a entrega com o código.',
  },
];

// "Móveis", "Móveis e Livros", "Móveis, Livros e Infantil"
const juntar = (itens) => (itens.length <= 1 ? itens.join('')
  : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

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

  // ── Anúncios recentes (o conteúdo da página)
  const [recentes, setRecentes] = useState(null); // null = carregando

  // "Para você" [RF24]: só para quem está logado e já viu algum anúncio
  const [paraVoce, setParaVoce] = useState({ anuncios: [], categorias: [] });
  useEffect(() => {
    const token = localStorage.getItem('sd_token');
    if (!token) return;
    fetch(`${API_URL}/api/recomendacoes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setParaVoce({ anuncios: d.anuncios || [], categorias: d.categorias || [] }))
      .catch(() => {});
  }, []);

  // Logado: sem os próprios anúncios (mesma regra do Explorar — não dá
  // para comprar de si mesmo). Visitante: o parâmetro não muda nada.
  useEffect(() => {
    const token = localStorage.getItem('sd_token');
    fetch(`${API_URL}/api/anuncios?ordenacao=recentes&limite=30&excluir_proprios=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => setRecentes(d.anuncios || []))
      .catch(() => setRecentes([]));
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
        const token = localStorage.getItem('sd_token');
        const res = await fetch(
          `${API_URL}/api/anuncios?busca=${encodeURIComponent(termoBusca.trim())}&limite=5&excluir_proprios=1`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
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

        <BarraCategorias />
      </header>

      {/* ── Gaveta do menu (mobile) ── */}
      <div className={`mobile-drawer${menuAberto ? ' open' : ''}`} aria-hidden={!menuAberto}>
        <div className="mobile-drawer-backdrop" onClick={fecharMenu} />
        <nav className="mobile-drawer-panel" aria-label="Menu principal">
          <GavetaPerfil usuario={usuario} onNavegar={fecharMenu} />
          <Link to="/explorar" onClick={fecharMenu}>Explorar desapegos</Link>
          <a href="#como-funciona" onClick={(e) => {
            e.preventDefault();
            fecharMenu();
            // espera a gaveta fechar (ela trava a rolagem da página enquanto aberta)
            setTimeout(() => rolarAteSecao('como-funciona'), 60);
          }}>Como funciona</a>
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

        {/* ── Abertura: o que é, em uma frase, e as duas ações;
               ao lado, as vantagens do site. Entra uma vez ao carregar
               (data-enter, camada de movimento da skill). ── */}
        <section
          className="inicio-abertura hero bg-topglow"
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
              <a href="#como-funciona" className="nav-btn"
                onClick={(e) => { e.preventDefault(); rolarAteSecao('como-funciona'); }}>
                Como funciona
              </a>
            </div>
          </div>

          {/* Vantagens do site: o que cada um ganha usando o Santo Desapego */}
          <ul className="inicio-vantagens" data-enter-media>
            {VANTAGENS.map(({ Icone, titulo, texto }) => (
              <li key={titulo}>
                <span className="inicio-vantagem-icone"><Icone size={20} /></span>
                <div>
                  <strong className="inicio-vantagem-titulo">{titulo}</strong>
                  <p>{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Para você [RF24]: anúncios das categorias que a pessoa viu,
               priorizando a faixa de preço e o bairro dela. Sem histórico,
               a seção não aparece. ── */}
        {paraVoce.anuncios.length > 0 && (
          <section className="inicio-recentes inicio-para-voce" aria-labelledby="titulo-para-voce">
            <div className="inicio-titulo-linha">
              <div>
                <h2 id="titulo-para-voce">Para você</h2>
                <p className="inicio-subtitulo">
                  Com base nos anúncios que você viu em {juntar(paraVoce.categorias)}.
                </p>
              </div>
            </div>
            <div className="inicio-grade">
              {paraVoce.anuncios.map((a) => <CartaoAnuncio key={a.id} anuncio={a} />)}
            </div>
          </section>
        )}

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
            <>
              <div className="inicio-grade">
                {recentes.map((a, i) => <CartaoAnuncio key={a.id} anuncio={a} prioridade={i < 4} />)}
              </div>
              {/* Repete o "ver todos" no fim da grade, para não precisar rolar de volta */}
              <div className="inicio-ver-mais">
                <Link to="/explorar" className="nav-btn">Ver todos os anúncios</Link>
              </div>
            </>
          )}
        </section>

        {/* ── Como funciona: o fluxo real de uma venda, três passos lado a lado
               na faixa verde (no celular, um embaixo do outro) ── */}
        <section className="inicio-como" id="como-funciona" aria-labelledby="titulo-como">
          <h2 id="titulo-como">Como funciona uma venda</h2>
          <ol className="inicio-passos">
            {PASSOS.map((p, i) => (
              <li key={p.titulo}>
                <h3><span className="inicio-passo-num" aria-hidden="true">{i + 1}</span>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
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
                  <IconPin size={13} />{h}
                </button>
              ))}
            </div>
          </div>
          <Mapa bairroFoco={bairroFoco} />
        </section>

        {/* ── Fechamento: o convite da primeira versão, em tamanho de bloco ── */}
        <section className="inicio-fim" aria-labelledby="titulo-fim">
          <div>
            <h2 id="titulo-fim">Tem algo parado em casa?</h2>
            <p>Anunciar é gratuito e leva poucos minutos. A plataforma só fica com 5% quando a venda acontece.</p>
          </div>
          <Link to={linkAnunciar} className="inicio-fim-botao">Anunciar um item</Link>
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