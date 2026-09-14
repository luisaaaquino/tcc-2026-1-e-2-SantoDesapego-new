import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Explorar.css';
import SeletorBairro, { BAIRROS } from '../componentes/SeletorBairro';
import NotificacoesSino from '../componentes/NotificacoesSino';

const API_URL = 'http://localhost:8080/api';

/* ── Ícones — UI ────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
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
const IconMore = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="1.4" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.4" fill="currentColor"/>
  </svg>
);

/* ── Condição do produto — emoji + rótulo legível ─────────── */
const ESTADO_LABEL = {
  'novo':        { emoji: '✨', label: 'Novo' },
  'seminovo':    { emoji: '👌', label: 'Seminovo' },
  'usado':       { emoji: '👍', label: 'Usado' },
  'para-reparo': { emoji: '🔧', label: 'Para reparo' },
};

/* ── Data relativa (pt-BR) — "Hoje", "Ontem", "há 3 dias"... ─ */
const tempoRelativo = (dataISO) => {
  const dias = Math.floor((Date.now() - new Date(dataISO).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} sem.`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return new Date(dataISO).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* ── Mapa id da categoria → componente de ícone ───────────── */
const CATEGORY_ICONS = {
  1: IconSofa,     // Móveis & Casa
  2: IconLaptop,   // Eletrônicos
  3: IconShirt,    // Moda
  4: IconBaby,     // Infantil & Bebê
  5: IconBook,     // Livros
  6: IconBike,     // Esporte & Lazer
  7: IconPalette,  // Arte & Decoração
  8: IconWrench,   // Ferramentas
  9: IconHanger,   // Brechó vintage
  10: IconMore,    // Outros
};

const Explorar = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [usuario, setUsuario] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [anuncios, setAnuncios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');

  // Estados de filtros
  const [ordenacao, setOrdenacao] = useState('recentes');
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [tabAtiva, setTabAtiva] = useState('todos');
  const [precoMax, setPrecoMax] = useState(5000);           // valor ao vivo do slider (label)
  const [precoMaxAplicado, setPrecoMaxAplicado] = useState(5000); // valor usado no filtro
  const [condicoes, setCondicoes] = useState([]);
  const [bairroFiltro, setBairroFiltro] = useState('');
  const [limite, setLimite] = useState(12);
  const [totalItens, setTotalItens] = useState(0);

  // Evita condição de corrida: se duas buscas estiverem "no ar" (ex.: o
  // filtro de categoria muda logo após a busca sem filtro ter disparado),
  // só o resultado da requisição mais recente pode atualizar a tela.
  const buscaIdRef = useRef(0);

  // Lê usuário do localStorage
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

  // Busca categorias
  useEffect(() => {
    fetch(`${API_URL}/categorias`)
      .then(res => res.json())
      .then(data => setCategorias(data.categorias || []))
      .catch(err => console.error('Erro ao buscar categorias:', err));
  }, []);

  // Lê parâmetros da URL quando a página carrega
  useEffect(() => {
    const categoriaUrl = searchParams.get('categoria_id');
    const aceitaTrocaUrl = searchParams.get('aceita_troca');
    const buscaUrl = searchParams.get('busca');
    const bairroUrl = searchParams.get('bairro');

    if (categoriaUrl) {
      setCategoriaAtiva(parseInt(categoriaUrl));
    }
    if (aceitaTrocaUrl === 'true') {
      setTabAtiva('troca');
    }
    // Atualiza o input de busca com o termo da URL
    if (buscaUrl) {
      setTermoBusca(buscaUrl);
    } else {
      setTermoBusca('');
    }
    // Atualiza o bairro selecionado com o valor vindo da URL (ex: link da Home)
    if (bairroUrl) {
      setBairroFiltro(bairroUrl);
    }
  }, [searchParams]);

  // Busca anúncios quando algum filtro real muda — reinicia a paginação
  useEffect(() => {
    setLimite(12);
    buscarAnuncios(12);
  }, [ordenacao, categoriaAtiva, tabAtiva, bairroFiltro, searchParams, condicoes.join(','), precoMaxAplicado]);

  const buscarAnuncios = async (limiteParam) => {
    const idDestaBusca = ++buscaIdRef.current;
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      params.append('ordenacao', ordenacao);
      params.append('limite', limiteParam || limite);

      if (categoriaAtiva) params.append('categoria_id', categoriaAtiva);
      if (tabAtiva === 'troca') params.append('aceita_troca', 'true');
      if (bairroFiltro) params.append('bairro', bairroFiltro);
      if (precoMaxAplicado < 5000) params.append('preco_max', precoMaxAplicado);
      if (condicoes.length > 0) params.append('estado_conservacao', condicoes.join(','));

      // Adiciona termo de busca se existir na URL
      const buscaUrl = searchParams.get('busca');
      if (buscaUrl) params.append('busca', buscaUrl);

      const res = await fetch(`${API_URL}/anuncios?${params}`);
      const data = await res.json();

      // Se uma busca mais nova já foi disparada enquanto esta esperava a
      // resposta, ignora este resultado desatualizado (evita sobrescrever
      // a tela com dados de um filtro antigo).
      if (idDestaBusca !== buscaIdRef.current) return;

      setAnuncios(data.anuncios || []);
      setTotalItens(data.paginacao?.total_itens ?? (data.anuncios || []).length);
    } catch (erro) {
      console.error('Erro ao buscar anúncios:', erro);
      if (idDestaBusca !== buscaIdRef.current) return;
      setAnuncios([]);
      setTotalItens(0);
    } finally {
      if (idDestaBusca === buscaIdRef.current) setCarregando(false);
    }
  };

  const carregarMais = () => {
    const novoLimite = limite + 12;
    setLimite(novoLimite);
    buscarAnuncios(novoLimite);
  };

  const handleLogout = () => {
    localStorage.removeItem('sd_token');
    localStorage.removeItem('sd_usuario');
    setUsuario(null);
    navigate('/');
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);

    if (termoBusca.trim()) {
      params.set('busca', termoBusca.trim());
    } else {
      params.delete('busca');
    }

    navigate(`/explorar?${params.toString()}`);
  };

  // Toggle checkbox
  const toggleCheckbox = (array, setArray, value) => {
    if (array.includes(value)) {
      setArray(array.filter(item => item !== value));
    } else {
      setArray([...array, value]);
    }
  };

  // Limpar filtro específico
  const limparPreco = () => {
    setPrecoMax(5000);
    setPrecoMaxAplicado(5000);
  };
  const limparCondicoes = () => setCondicoes([]);
  const limparBairro = () => setBairroFiltro('');

  const formatarPreco = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  /* ── Divide categorias em "principais" e "extras" ─────────────
     IDs 1-8 = principais (Móveis, Eletrônicos, ..., Ferramentas)
     IDs 9+  = extras (Brechó vintage, Outros) — vêm depois do separador */
  const categoriasMain   = categorias.filter(c => c.id <= 8);
  const categoriasExtras = categorias.filter(c => c.id >= 9);

  /* Renderiza um link de categoria já com o ícone certo */
  const renderCategoria = (cat) => {
    const Icon = CATEGORY_ICONS[cat.id] || IconMore;
    return (
      <a
        key={cat.id}
        href="#"
        className={categoriaAtiva === cat.id ? 'active' : ''}
        onClick={(e) => { e.preventDefault(); setCategoriaAtiva(cat.id); }}
      >
        <Icon />
        <span>{cat.nome}</span>
      </a>
    );
  };

  return (
    <div className="explorar-wrapper">

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
              onKeyPress={(e) => e.key === 'Enter' && handleBuscar(e)}
            />
            <SeletorBairro value={bairroFiltro} onChange={setBairroFiltro} />
            <button className="search-btn" onClick={handleBuscar}>Buscar</button>
          </div>

          <nav className="nav-actions">
            {usuario ? (
              <>
                <NotificacoesSino />
                <Link to="/perfil" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  fontSize: '0.9rem', color: 'var(--ink)', fontWeight: 600, textDecoration: 'none',
                }} title="Meu perfil">
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--terracotta)', color: 'var(--cream)',
                    display: 'grid', placeItems: 'center', fontSize: '0.8rem',
                    fontWeight: 700, overflow: 'hidden',
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
                <Link to="/login" className="nav-btn">Entrar</Link>
                <Link to="/cadastro" className="btn-sell">+ Anunciar grátis</Link>
              </>
            )}
          </nav>
        </div>

        {/* ── Nav de categorias — versão editorial com line icons ── */}
        <nav className="nav-categories">
          <a
            href="#"
            className={!categoriaAtiva ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); setCategoriaAtiva(null); }}
          >
            <IconGrid />
            <span>Todos</span>
          </a>

          {categoriasMain.map(renderCategoria)}

          {categoriasExtras.length > 0 && (
            <span className="nav-sep" aria-hidden="true" />
          )}

          {categoriasExtras.map(renderCategoria)}
        </nav>
      </header>

      {/* ── Main Content ── */}
      <div className="explorar-container">

        {/* Breadcrumb */}
        <div className="explorar-breadcrumb">
          <Link to="/">Início</Link>
          <span>›</span>
          <span>Explorar</span>
        </div>

        {/* Header */}
        <div className="explorar-header">
          <div className="explorar-header-top">
            <div>
              <h1>Explorar <em>desapegos</em></h1>
              <p className="explorar-header-subtitle">
                {totalItens} {totalItens === 1 ? 'anúncio encontrado' : 'anúncios encontrados'} em Santo Amaro
              </p>
            </div>

            <div className="explorar-sort">
              <span>Ordenar por:</span>
              <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value)}>
                <option value="recentes">Mais recentes</option>
                <option value="preco-menor">Menor preço</option>
                <option value="preco-maior">Maior preço</option>
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="explorar-tabs">
            <button
              className={`explorar-tab ${tabAtiva === 'todos' ? 'active' : ''}`}
              onClick={() => setTabAtiva('todos')}
            >
              Todos <span className="count">{totalItens}</span>
            </button>
            <button
              className={`explorar-tab ${tabAtiva === 'troca' ? 'active' : ''}`}
              onClick={() => setTabAtiva('troca')}
            >
              Aceita Troca <span className="count">{anuncios.filter(a => a.aceita_troca).length}</span>
            </button>
          </div>
        </div>

        {/* Layout principal: Sidebar + Grid */}
        <div className="explorar-main">

          {/* ── Sidebar de filtros ── */}
          <aside className="explorar-sidebar">

            {/* Faixa de preço */}
            <div className="filter-section">
              <div className="filter-section-title">
                <h3>Faixa de preço</h3>
                <button className="filter-clear" onClick={limparPreco}>Limpar</button>
              </div>
              <div className="price-range">
                <div className="price-range-labels">
                  <span>R$ 0</span>
                  <span>até R$ {precoMax}{precoMax === 5000 ? '+' : ''}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={precoMax}
                  onChange={(e) => setPrecoMax(parseInt(e.target.value))}
                  onMouseUp={() => setPrecoMaxAplicado(precoMax)}
                  onTouchEnd={() => setPrecoMaxAplicado(precoMax)}
                  onKeyUp={() => setPrecoMaxAplicado(precoMax)}
                />
              </div>
            </div>

            {/* Bairro */}
            <div className="filter-section">
              <div className="filter-section-title">
                <h3>Bairro</h3>
                <button className="filter-clear" onClick={limparBairro}>Limpar</button>
              </div>
              <div className="filter-options">
                <button
                  className={`filter-option ${!bairroFiltro ? 'active' : ''}`}
                  onClick={() => setBairroFiltro('')}
                >
                  Todos
                </button>
                {BAIRROS.map((b) => (
                  <button
                    key={b}
                    className={`filter-option ${bairroFiltro === b ? 'active' : ''}`}
                    onClick={() => setBairroFiltro(b)}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Condição */}
            <div className="filter-section">
              <div className="filter-section-title">
                <h3>Condição</h3>
                <button className="filter-clear" onClick={limparCondicoes}>Limpar</button>
              </div>
              <div className="filter-checkboxes">
                {[
                  { value: 'novo', label: 'Novo / Na caixa' },
                  { value: 'seminovo', label: 'Seminovo' },
                  { value: 'usado', label: 'Usado' },
                  { value: 'para-reparo', label: 'Para reparo' },
                ].map((c) => (
                  <div key={c.value} className="filter-checkbox">
                    <input
                      type="checkbox"
                      id={`cond-${c.value}`}
                      checked={condicoes.includes(c.value)}
                      onChange={() => toggleCheckbox(condicoes, setCondicoes, c.value)}
                    />
                    <label htmlFor={`cond-${c.value}`}>
                      {c.label}
                      <span className="count">{anuncios.filter(a => a.estado_conservacao === c.value).length}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Grid de produtos ── */}
          <div className="explorar-content">
            {carregando && anuncios.length === 0 ? (
              <div className="explorar-loading">Carregando...</div>
            ) : anuncios.length > 0 ? (
              <div className="explorar-grid">
                {anuncios.map((anuncio) => {
                  const estado = ESTADO_LABEL[anuncio.estado_conservacao] || { emoji: '📦', label: anuncio.estado_conservacao };
                  return (
                    /* Card inteiro vira link para a página do anúncio */
                    <Link
                      key={anuncio.id}
                      to={`/anuncio/${anuncio.id}`}
                      className="ecard"
                    >
                      <div className="ecard-imagem">
                        {anuncio.imagem_principal ? (
                          <img src={anuncio.imagem_principal} alt={anuncio.titulo} loading="lazy" />
                        ) : (
                          <div className="ecard-imagem-vazia">📦</div>
                        )}
                        {anuncio.aceita_troca && (
                          <span className="ecard-badge">🔄 Aceita troca</span>
                        )}
                      </div>
                      <div className="ecard-info">
                        <h3 className="ecard-titulo">{anuncio.titulo}</h3>
                        <p className="ecard-preco">{formatarPreco(anuncio.preco)}</p>
                        <p className="ecard-local">📍 {anuncio.bairro || 'Santo Amaro'}</p>
                        <div className="ecard-meta">
                          <span className="ecard-condicao">{estado.emoji} {estado.label}</span>
                          <span className="ecard-tempo">{tempoRelativo(anuncio.data_criacao)}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="explorar-grid">
                <div className="explorar-empty">
                  <div className="explorar-empty-icon">📦</div>
                  <h3>Nenhum anúncio por aqui ainda</h3>
                  <p>
                    Seja o primeiro a anunciar! Publique seu desapego e comece a
                    movimentar a economia local de Santo Amaro.
                  </p>
                  <Link to={usuario ? '/anunciar' : '/cadastro'}>
                    {usuario ? '+ Criar meu primeiro anúncio' : '+ Cadastre-se para anunciar'}
                  </Link>
                </div>
              </div>
            )}

            {anuncios.length > 0 && anuncios.length < totalItens && (
              <button className="explorar-carregar-mais" onClick={carregarMais} disabled={carregando}>
                {carregando ? 'Carregando...' : `Carregar mais anúncios (${anuncios.length} de ${totalItens})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="footer-wrap">
          <div className="footer-brand">
            <Link to="/" className="logo">
              <span className="logo-mark">SD</span>
              Santo <em>Desapego</em>
            </Link>
            <p>Marketplace C2C hiperlocal para Santo Amaro, São Paulo. Economia compartilhada e consumo consciente.</p>
          </div>

          <div className="footer-col">
            <h4>Plataforma</h4>
            <a href="#">Como funciona</a>
            <a href="#">Anunciar</a>
            <a href="#">Categorias</a>
          </div>

          <div className="footer-col">
            <h4>Comunidade</h4>
            <a href="#">Nosso impacto</a>
            <a href="#">Bairros atendidos</a>
            <a href="#">Indique um vizinho</a>
          </div>

          <div className="footer-col">
            <h4>Suporte</h4>
            <Link to="/central-ajuda">Central de ajuda</Link>
            <a href="#">Termos de uso</a>
            <a href="#">Privacidade (LGPD)</a>
          </div>
        </div>

        <div className="footer-tcc">
          <div>
            <strong>Projeto acadêmico</strong> — Trabalho de Conclusão de Curso • Bacharelado em Sistemas de Informação • Centro Universitário Senac Santo Amaro
          </div>
          <div>Luisa Aquino • Maria Erica Cruz • Paulo Santana</div>
        </div>
      </footer>
    </div>
  );
};

export default Explorar;