import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Perfil.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';
import {
  IconUser, IconMail, IconLock, IconPin, IconPhone, IconHome, IconID,
  IconChevron, IconEye, IconCheck, IconAlert, IconShield, IconTag,
  IconFlag, IconPlus, IconSearch, IconHeart,
} from '../componentes/Icones';

import { API_URL } from '../config';

/* ── Ícones SVG ───────────────────────────────────────────── */
const I = {
  data:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>,
  layout:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>,
  bag:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  star:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  message: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  camera:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>,
  download: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  wallet:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  trash:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
};

const BAIRROS = ['Santo Amaro Centro','Campo Belo','Brooklin','Granja Julieta','Jardim Marajoara','Vila Cruzeiro','Vila Mascote','Vila Sofia','Outro bairro'];

const STATUS_ANUNCIO = {
  ativo:    { label: 'Ativo',    cls: 'ativo' },
  vendido:  { label: 'Vendido',  cls: 'vendido' },
  pausado:  { label: 'Pausado',  cls: 'pausado' },
  expirado: { label: 'Expirado', cls: 'pausado' },
};

/* ── Utils ─────────────────────────────────────────────────── */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v) => new Date(v).toLocaleDateString('pt-BR');

const maskCPF = (v) => {
  const n = (v || '').replace(/\D/g, '').slice(0, 11);
  if (n.length === 11) return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
  return v;
};
const maskPhone = (v) => {
  const n = (v || '').replace(/\D/g, '').slice(0, 11);
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return v;
};
const maskCEP = (v) => {
  const n = (v || '').replace(/\D/g, '').slice(0, 8);
  if (n.length === 8) return `${n.slice(0,5)}-${n.slice(5)}`;
  return v;
};

/* Componente reutilizável: avatar com foto ou inicial */
const Avatar = ({ usuario, size = 88 }) => {
  const inicial = usuario?.nome ? usuario.nome[0].toUpperCase() : '?';
  return (
    <div className="perfil-avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {usuario?.foto_perfil
        ? <img src={usuario.foto_perfil} alt={`Foto de ${usuario.nome}`} />
        : inicial}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ════════════════════════════════════════════════════════════ */
const Perfil = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [usuario, setUsuario] = useState(null);
  const [estatisticas, setEstatisticas] = useState(null);
  const [aba, setAba] = useState(searchParams.get('mp') ? 'pagamentos' : 'painel');
  const [carregando, setCarregando] = useState(true);

  // Carrega dados ao montar
  useEffect(() => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    fetch(`${API_URL}/api/usuario/perfil`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json().then((data) => ({ status: r.status, data })))
      .then(({ status, data }) => {
        if (data.usuario) {
          setUsuario(data.usuario);
          setEstatisticas(data.estatisticas);
        } else if (status === 401) {
          localStorage.removeItem('sd_token');
          localStorage.removeItem('sd_usuario');
          navigate('/login');
        } else {
          alert(data.erro || 'Erro ao carregar perfil. Tente novamente.');
        }
      })
      .catch(() => alert('Erro ao carregar perfil. O servidor está rodando?'))
      .finally(() => setCarregando(false));
  }, [navigate]);

  if (carregando) {
    return (
      <div className="perfil-wrapper">
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Carregando perfil...
        </div>
      </div>
    );
  }

  if (!usuario) return null;

  return (
    <div className="perfil-wrapper">

      <div className="announcement">
        🌱 Cuidando dos seus dados — Esta página está em conformidade com a LGPD
      </div>

      <SiteHeader>
        <NotificacoesSino />
        <NavBackButton to="/">Voltar para a home</NavBackButton>
      </SiteHeader>

      <div className="perfil-layout">

        {/* ════ SIDEBAR ════ */}
        <aside className="perfil-sidebar">
          <div className="perfil-user-card">
            <AvatarUpload usuario={usuario} setUsuario={setUsuario} />
            <h3>{usuario.nome} {usuario.sobrenome}</h3>
            <span className="user-meta">
              <IconPin />
              {usuario.bairro || 'Bairro não informado'}
            </span>
          </div>

          <nav className="perfil-tabs" role="tablist">
            <button className={`perfil-tab${aba === 'painel' ? ' active' : ''}`}
              onClick={() => setAba('painel')} role="tab">
              <I.layout /> Visão geral
            </button>
            <button className={`perfil-tab${aba === 'anuncios' ? ' active' : ''}`}
              onClick={() => setAba('anuncios')} role="tab">
              <IconTag /> Meus anúncios
            </button>
            <button className={`perfil-tab${aba === 'favoritos' ? ' active' : ''}`}
              onClick={() => setAba('favoritos')} role="tab">
              <IconHeart size={16} /> Favoritos
            </button>
            <button className={`perfil-tab${aba === 'compras' ? ' active' : ''}`}
              onClick={() => setAba('compras')} role="tab">
              <I.bag /> Compras realizadas
            </button>
            <button className={`perfil-tab${aba === 'vendas' ? ' active' : ''}`}
              onClick={() => setAba('vendas')} role="tab">
              <IconTag /> Vendas realizadas
            </button>
            <button className={`perfil-tab${aba === 'pagamentos' ? ' active' : ''}`}
              onClick={() => setAba('pagamentos')} role="tab">
              <I.wallet /> Recebimentos
            </button>
            <button className={`perfil-tab${aba === 'avaliacoes' ? ' active' : ''}`}
              onClick={() => setAba('avaliacoes')} role="tab">
              <I.star /> Avaliações
            </button>
            <button className={`perfil-tab${aba === 'denuncias' ? ' active' : ''}`}
              onClick={() => setAba('denuncias')} role="tab">
              <IconFlag /> Minhas denúncias
            </button>
            <button className={`perfil-tab${aba === 'dados' ? ' active' : ''}`}
              onClick={() => setAba('dados')} role="tab">
              <IconUser /> Dados pessoais
            </button>
            <button className={`perfil-tab${aba === 'endereco' ? ' active' : ''}`}
              onClick={() => setAba('endereco')} role="tab">
              <IconPin /> Endereço
            </button>
            <button className={`perfil-tab${aba === 'seguranca' ? ' active' : ''}`}
              onClick={() => setAba('seguranca')} role="tab">
              <IconShield /> Segurança
            </button>
            <button className={`perfil-tab danger${aba === 'lgpd' ? ' active' : ''}`}
              onClick={() => setAba('lgpd')} role="tab">
              <I.data /> Privacidade (LGPD)
            </button>
            {usuario.papel === 'administrador' && (
              <Link to="/admin" className="perfil-tab">
                <IconShield /> Painel administrativo
              </Link>
            )}
          </nav>
        </aside>

        {/* ════ CONTEÚDO ════ */}
        <main className="perfil-content">
          {aba === 'painel'     && <SecaoPainel     usuario={usuario} estatisticas={estatisticas} />}
          {aba === 'anuncios'   && <SecaoAnuncios   />}
          {aba === 'favoritos'  && <SecaoFavoritos  />}
          {aba === 'compras'    && <SecaoCompras    />}
          {aba === 'vendas'     && <SecaoVendas      />}
          {aba === 'pagamentos' && <SecaoPagamentos  usuario={usuario} setUsuario={setUsuario} mpParam={searchParams.get('mp')} limparMpParam={() => setSearchParams({})} />}
          {aba === 'avaliacoes' && <SecaoAvaliacoes />}
          {aba === 'denuncias'  && <SecaoMinhasDenuncias />}
          {aba === 'dados'     && <SecaoDados     usuario={usuario} setUsuario={setUsuario} />}
          {aba === 'endereco'  && <SecaoEndereco  usuario={usuario} setUsuario={setUsuario} />}
          {aba === 'seguranca' && <SecaoSeguranca />}
          {aba === 'lgpd'      && <SecaoLGPD      usuario={usuario} />}
        </main>
      </div>

      <footer className="site-footer">
        <span>© 2026 Santo Desapego</span>
      </footer>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   AVATAR + UPLOAD DE FOTO
   ════════════════════════════════════════════════════════════ */
const AvatarUpload = ({ usuario, setUsuario }) => {
  const inputRef = useRef();
  const [enviando, setEnviando] = useState(false);

  // Redimensiona a imagem antes de enviar (400×400, JPEG 0.85)
  const redimensionar = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const tamanho = 400;
        // Crop quadrado central
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, min, min, 0, 0, tamanho, tamanho);
        // Exporta em JPEG, qualidade 0.85 (boa relação tamanho/qualidade)
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Selecione uma imagem válida (JPEG, PNG ou WebP).');
      return;
    }
    // Limite original: 5MB (será reduzido depois)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem é muito grande. Limite: 5MB.');
      return;
    }

    setEnviando(true);
    try {
      const fotoBase64 = await redimensionar(file);

      const resposta = await fetch(`${API_URL}/api/usuario/foto`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({ foto_perfil: fotoBase64 }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        alert(dados.erro || 'Erro ao enviar foto.');
      } else {
        setUsuario({ ...usuario, foto_perfil: fotoBase64 });
        // Atualiza no localStorage também
        const stored = JSON.parse(localStorage.getItem('sd_usuario') || '{}');
        localStorage.setItem('sd_usuario', JSON.stringify({ ...stored, foto_perfil: fotoBase64 }));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao processar imagem.');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="perfil-avatar-wrap">
      <Avatar usuario={usuario} size={88} />
      <label className="perfil-avatar-edit" title="Trocar foto">
        {enviando ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
            </path>
          </svg>
        ) : <I.camera />}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={enviando} />
      </label>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO PAINEL — Visão geral [RF13 + RF05]
   ════════════════════════════════════════════════════════════ */
const SecaoPainel = ({ usuario, estatisticas }) => {
  const e = estatisticas || {};

  return (
    <>
      <div className="perfil-section-head">
        <h1>Visão <em>geral</em></h1>
        <p>Tudo o que está acontecendo com sua conta no Santo Desapego.</p>
      </div>

      {/* Estatísticas em cards */}
      <div className="painel-stats">
        <div className="painel-stat">
          <div className="painel-stat-icon terracotta"><IconTag /></div>
          <div className="painel-stat-num">{e.anuncios_ativos ?? 0}</div>
          <div className="painel-stat-label">Anúncios ativos</div>
        </div>
        <div className="painel-stat">
          <div className="painel-stat-icon forest"><I.bag /></div>
          <div className="painel-stat-num">{e.compras_realizadas ?? 0}</div>
          <div className="painel-stat-label">Compras realizadas</div>
        </div>
        <div className="painel-stat">
          <div className="painel-stat-icon mustard"><I.star /></div>
          {e.reputacao_media != null
            ? <div className="painel-stat-num">{e.reputacao_media.toFixed(1)} ★</div>
            : <div className="painel-stat-num empty">sem avaliações</div>}
          <div className="painel-stat-label">
            Reputação{e.total_avaliacoes ? ` (${e.total_avaliacoes})` : ''}
          </div>
        </div>
        <div className="painel-stat">
          <div className="painel-stat-icon ink"><I.message /></div>
          <div className="painel-stat-num">{e.mensagens_nao_lidas ?? 0}</div>
          <div className="painel-stat-label">Mensagens não lidas</div>
        </div>
      </div>

      {/* CTAs — vendedor e comprador */}
      <div className="painel-cta-grid">
        <div className="painel-cta sell">
          <div className="painel-cta-icon"><IconTag /></div>
          <h3>Quer anunciar algo?</h3>
          <p>Transforme o que você não usa em renda extra. Vizinhos do bairro estão à procura.</p>
          <Link to="/anunciar" className="painel-cta-btn">
            <IconPlus /> Criar anúncio
          </Link>
        </div>

        <div className="painel-cta buy">
          <div className="painel-cta-icon"><I.bag /></div>
          <h3>Procurando algo?</h3>
          <p>Descubra desapegos perto de você. Tudo a poucos minutos de casa.</p>
          <Link to="/" className="painel-cta-btn">
            <IconSearch size={16} /> Explorar desapegos
          </Link>
        </div>
      </div>

      {/* Lista vazia (futura: meus anúncios e últimas compras) */}
      <div className="painel-empty">
        <div className="painel-empty-icon">📦</div>
        <h4>Você ainda não tem atividade por aqui</h4>
        <p>Quando publicar um anúncio ou fazer uma compra, tudo aparece aqui.</p>
      </div>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO MEUS ANÚNCIOS
   ════════════════════════════════════════════════════════════ */
const SecaoAnuncios = () => {
  const [anuncios, setAnuncios] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(null); // id do anúncio em ação

  const carregar = () => {
    fetch(`${API_URL}/api/usuario/anuncios`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then((data) => setAnuncios(data.anuncios || []))
      .catch(() => setAnuncios([]))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, []);

  // [RF12] Pausar / reativar / renovar / excluir o próprio anúncio
  const executarAcao = async (e, anuncioId, acao) => {
    e.preventDefault();
    e.stopPropagation();

    if (acao === 'excluir' && !window.confirm('Excluir este anúncio? Essa ação não pode ser desfeita.')) {
      return;
    }

    setProcessando(anuncioId);
    try {
      const token = localStorage.getItem('sd_token');
      const resposta = acao === 'excluir'
        ? await fetch(`${API_URL}/api/anuncios/${anuncioId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch(`${API_URL}/api/anuncios/${anuncioId}/${acao}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
          });

      const dados = await resposta.json();
      if (!resposta.ok) {
        alert(dados.erro || 'Não foi possível concluir a ação.');
        return;
      }
      carregar();
    } catch {
      alert('Erro ao conectar com o servidor.');
    } finally {
      setProcessando(null);
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Meus <em>anúncios</em></h1>
        <p>Tudo o que você já publicou no Santo Desapego — ativo, vendido ou pausado.</p>
      </div>

      {carregando && <p className="perfil-loading">Carregando anúncios...</p>}

      {!carregando && anuncios?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon">🏷️</div>
          <h4>Você ainda não publicou nenhum anúncio</h4>
          <p>Que tal transformar o que você não usa mais em renda extra?</p>
          <Link to="/anunciar" className="painel-cta-btn painel-empty-btn">
            <IconPlus /> Criar anúncio
          </Link>
        </div>
      )}

      {!carregando && anuncios?.length > 0 && (
        <div className="lista-anuncios">
          {anuncios.map((a) => {
            const status = STATUS_ANUNCIO[a.status] || { label: a.status, cls: '' };
            const emAcao = processando === a.id;
            return (
              <Link to={`/anuncio/${a.id}`} key={a.id} className="anuncio-card-perfil">
                <div className="anuncio-card-perfil-img">
                  {a.imagem_principal
                    ? <img src={a.imagem_principal} alt={a.titulo} />
                    : <span>📦</span>}
                </div>
                <div className="anuncio-card-perfil-info">
                  <h3>{a.titulo}</h3>
                  <p>{a.categoria_nome} · publicado em {dataBR(a.data_criacao)}</p>
                  {a.status !== 'vendido' && (
                    <div className="anuncio-card-perfil-acoes">
                      <Link to={`/anunciar/${a.id}`} className="btn-anuncio-mini" onClick={(e) => e.stopPropagation()}>
                        Editar
                      </Link>
                      {a.status === 'ativo' && (
                        <button type="button" className="btn-anuncio-mini" disabled={emAcao}
                          onClick={(e) => executarAcao(e, a.id, 'pausar')}>
                          Pausar
                        </button>
                      )}
                      {a.status === 'pausado' && (
                        <button type="button" className="btn-anuncio-mini" disabled={emAcao}
                          onClick={(e) => executarAcao(e, a.id, 'reativar')}>
                          Reativar
                        </button>
                      )}
                      {a.status === 'expirado' && (
                        <button type="button" className="btn-anuncio-mini" disabled={emAcao}
                          onClick={(e) => executarAcao(e, a.id, 'renovar')}>
                          Renovar
                        </button>
                      )}
                      <button type="button" className="btn-anuncio-mini danger" disabled={emAcao}
                        onClick={(e) => executarAcao(e, a.id, 'excluir')}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
                <div className="anuncio-card-perfil-meta">
                  <span className={`status-badge ${status.cls}`}>{status.label}</span>
                  <strong>{brl(a.preco)}</strong>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   FAVORITOS — itens salvos pelo comprador [RF10]
   ════════════════════════════════════════════════════════════ */
const SecaoFavoritos = () => {
  const [favoritos, setFavoritos] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    fetch(`${API_URL}/api/favoritos`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then((data) => setFavoritos(data.favoritos || []))
      .catch(() => setFavoritos([]))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, []);

  const remover = async (e, anuncioId) => {
    e.preventDefault();
    e.stopPropagation();
    setFavoritos((prev) => prev.filter((f) => f.id !== anuncioId));
    try {
      await fetch(`${API_URL}/api/favoritos/${anuncioId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
      });
    } catch {
      carregar(); // Se a chamada falhar, recarrega pra não ficar com estado inconsistente
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Meus <em>favoritos</em></h1>
        <p>Anúncios que você salvou pra ver com calma depois.</p>
      </div>

      {carregando && <p className="perfil-loading">Carregando favoritos...</p>}

      {!carregando && favoritos?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon"><IconHeart size={40} /></div>
          <h4>Você ainda não salvou nenhum anúncio</h4>
          <p>Toque no coração de um anúncio no Explorar pra guardar aqui.</p>
          <Link to="/explorar" className="painel-cta-btn painel-empty-btn">
            <IconSearch /> Explorar desapegos
          </Link>
        </div>
      )}

      {!carregando && favoritos?.length > 0 && (
        <div className="lista-anuncios">
          {favoritos.map((f) => (
            <Link to={`/anuncio/${f.id}`} key={f.id} className="anuncio-card-perfil">
              <div className="anuncio-card-perfil-img">
                {f.imagem_principal
                  ? <img src={f.imagem_principal} alt={f.titulo} />
                  : <span>📦</span>}
              </div>
              <div className="anuncio-card-perfil-info">
                <h3>{f.titulo}</h3>
                <p>{f.categoria_nome} · {f.bairro}</p>
              </div>
              <div className="anuncio-card-perfil-meta">
                <strong>{brl(f.preco)}</strong>
                <button
                  type="button"
                  className="btn-favorito-remover"
                  onClick={(e) => remover(e, f.id)}
                  aria-label="Remover dos favoritos"
                >
                  <IconHeart size={16} filled />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   ESTRELAS — exibição e input reutilizáveis
   ════════════════════════════════════════════════════════════ */
const Estrelas = ({ nota }) => (
  <div className="estrelas-display">
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={n <= Math.round(nota) ? 'cheia' : ''}><I.star /></span>
    ))}
  </div>
);

const EstrelasInput = ({ valor, onChange }) => (
  <div className="estrelas-input">
    {[1, 2, 3, 4, 5].map((n) => (
      <button type="button" key={n}
        className={`estrela-btn${n <= valor ? ' cheia' : ''}`}
        onClick={() => onChange(n)}
        aria-label={`${n} estrela${n > 1 ? 's' : ''}`}>
        <I.star />
      </button>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════════════
   FORMULÁRIO — avaliar o vendedor de uma compra
   ════════════════════════════════════════════════════════════ */
const FormAvaliar = ({ compra, aoEnviar, aoCancelar }) => {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async () => {
    if (!nota) { setErro('Escolha uma nota de 1 a 5 estrelas.'); return; }
    setEnviando(true);
    setErro('');
    try {
      const resposta = await fetch(`${API_URL}/api/avaliacoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({ compra_id: compra.id, nota, comentario: comentario.trim() || null }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Erro ao enviar avaliação.');
        return;
      }
      aoEnviar();
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="avaliar-form">
      <p className="avaliar-form-label">Como foi negociar com {compra.vendedor_nome}?</p>
      <EstrelasInput valor={nota} onChange={setNota} />
      <textarea
        className="avaliar-textarea"
        placeholder="Conte como foi a negociação (opcional)"
        value={comentario}
        maxLength={500}
        onChange={(e) => setComentario(e.target.value)}
      />
      {erro && <span className="avaliar-erro"><IconAlert /> {erro}</span>}
      <div className="avaliar-form-acoes">
        <button type="button" className="btn-perfil-primary" onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar avaliação'}
        </button>
        <button type="button" className="btn-perfil-secondary" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO COMPRAS REALIZADAS
   ════════════════════════════════════════════════════════════ */
// [RF17] Baixa o comprovante em PDF de uma transação (compra ou venda)
const baixarComprovante = async (compraId) => {
  try {
    const resposta = await fetch(`${API_URL}/api/compras/${compraId}/comprovante`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    });
    if (!resposta.ok) { alert('Erro ao gerar comprovante.'); return; }
    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprovante-santo-desapego-${compraId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('Erro ao conectar com o servidor.');
  }
};

// [RF17] Filtro de período/status reutilizado em Compras e Vendas
const FiltroHistorico = ({ status, setStatus, dataInicio, setDataInicio, dataFim, setDataFim }) => (
  <div className="filtro-historico">
    <div className="filtro-historico-campo">
      <label>Status</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todos</option>
        <option value="approved">Aprovado</option>
        <option value="pending">Pendente</option>
        <option value="rejected">Recusado</option>
      </select>
    </div>
    <div className="filtro-historico-campo">
      <label>De</label>
      <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
    </div>
    <div className="filtro-historico-campo">
      <label>Até</label>
      <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
    </div>
    {(status || dataInicio || dataFim) && (
      <button type="button" className="btn-perfil-secondary filtro-historico-limpar"
        onClick={() => { setStatus(''); setDataInicio(''); setDataFim(''); }}>
        Limpar filtros
      </button>
    )}
  </div>
);

const SecaoCompras = () => {
  const [compras, setCompras] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abrirAvaliar, setAbrirAvaliar] = useState(null);
  const [status, setStatus] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const carregar = () => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (dataInicio) params.append('data_inicio', dataInicio);
    if (dataFim) params.append('data_fim', dataFim);

    fetch(`${API_URL}/api/usuario/compras?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then((data) => setCompras(data.compras || []))
      .catch(() => setCompras([]))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, [status, dataInicio, dataFim]);

  return (
    <>
      <div className="perfil-section-head">
        <h1>Compras <em>realizadas</em></h1>
        <p>Histórico do que você já garimpou no Santo Desapego.</p>
      </div>

      <FiltroHistorico {...{ status, setStatus, dataInicio, setDataInicio, dataFim, setDataFim }} />

      {carregando && <p className="perfil-loading">Carregando compras...</p>}

      {!carregando && compras?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon">🛍️</div>
          <h4>{status || dataInicio || dataFim ? 'Nenhuma compra encontrada com esses filtros' : 'Você ainda não fez nenhuma compra'}</h4>
          <p>Quando você comprar algo, o histórico aparece aqui.</p>
          <Link to="/explorar" className="painel-cta-btn painel-empty-btn">
            <IconSearch size={16} /> Explorar desapegos
          </Link>
        </div>
      )}

      {!carregando && compras?.length > 0 && (
        <div className="lista-compras">
          {compras.map((c) => (
            <div className="compra-card-perfil" key={c.id}>
              <Link to={`/anuncio/${c.anuncio_id}`} className="compra-card-perfil-img">
                {c.anuncio_imagem
                  ? <img src={c.anuncio_imagem} alt={c.anuncio_titulo} />
                  : <span>📦</span>}
              </Link>
              <div className="compra-card-perfil-info">
                <Link to={`/anuncio/${c.anuncio_id}`}><h3>{c.anuncio_titulo}</h3></Link>
                <p>Vendido por {c.vendedor_nome} {c.vendedor_sobrenome} · {dataBR(c.criada_em)} · {c.status}</p>
                <strong>{brl(c.preco)}</strong>

                <div className="compra-card-perfil-acoes">
                  <button type="button" className="btn-perfil-secondary avaliar-btn" onClick={() => baixarComprovante(c.id)}>
                    <I.download /> Comprovante (PDF)
                  </button>
                  {c.ja_avaliei ? (
                    <span className="avaliei-badge"><IconCheck /> Você avaliou esta compra</span>
                  ) : abrirAvaliar === c.id ? null : (
                    <button type="button" className="btn-perfil-secondary avaliar-btn"
                      onClick={() => setAbrirAvaliar(c.id)}>
                      <I.star /> Avaliar vendedor
                    </button>
                  )}
                </div>

                {!c.ja_avaliei && abrirAvaliar === c.id && (
                  <FormAvaliar
                    compra={c}
                    aoEnviar={() => { setAbrirAvaliar(null); carregar(); }}
                    aoCancelar={() => setAbrirAvaliar(null)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO MINHAS VENDAS [RF17]
   ════════════════════════════════════════════════════════════ */
const SecaoVendas = () => {
  const [vendas, setVendas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (dataInicio) params.append('data_inicio', dataInicio);
    if (dataFim) params.append('data_fim', dataFim);

    fetch(`${API_URL}/api/usuario/vendas?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then((data) => setVendas(data.vendas || []))
      .catch(() => setVendas([]))
      .finally(() => setCarregando(false));
  }, [status, dataInicio, dataFim]);

  return (
    <>
      <div className="perfil-section-head">
        <h1>Vendas <em>realizadas</em></h1>
        <p>Histórico do que você já vendeu no Santo Desapego.</p>
      </div>

      <FiltroHistorico {...{ status, setStatus, dataInicio, setDataInicio, dataFim, setDataFim }} />

      {carregando && <p className="perfil-loading">Carregando vendas...</p>}

      {!carregando && vendas?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon">💰</div>
          <h4>{status || dataInicio || dataFim ? 'Nenhuma venda encontrada com esses filtros' : 'Você ainda não vendeu nada'}</h4>
          <p>Quando alguém comprar um dos seus anúncios, o histórico aparece aqui.</p>
        </div>
      )}

      {!carregando && vendas?.length > 0 && (
        <div className="lista-compras">
          {vendas.map((v) => (
            <div className="compra-card-perfil" key={v.id}>
              <Link to={`/anuncio/${v.anuncio_id}`} className="compra-card-perfil-img">
                {v.anuncio_imagem
                  ? <img src={v.anuncio_imagem} alt={v.anuncio_titulo} />
                  : <span>📦</span>}
              </Link>
              <div className="compra-card-perfil-info">
                <Link to={`/anuncio/${v.anuncio_id}`}><h3>{v.anuncio_titulo}</h3></Link>
                <p>Comprado por {v.comprador_nome} {v.comprador_sobrenome} · {dataBR(v.criada_em)} · {v.status}</p>
                <strong>{brl(v.preco)}</strong>
                <div className="compra-card-perfil-acoes">
                  <button type="button" className="btn-perfil-secondary avaliar-btn" onClick={() => baixarComprovante(v.id)}>
                    <I.download /> Comprovante (PDF)
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO MINHAS DENÚNCIAS — acompanhamento do retorno dos admins
   ════════════════════════════════════════════════════════════ */
const MOTIVO_DENUNCIA_LABEL = {
  conteudo_inadequado: 'Conteúdo inadequado',
  fraude: 'Fraude',
  violacao_termos: 'Violação dos termos',
  outro: 'Outro',
};

const STATUS_DENUNCIA_LABEL = {
  pendente: 'Pendente',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  arquivada: 'Arquivada',
};

const SecaoMinhasDenuncias = () => {
  const [denuncias, setDenuncias] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/denuncias`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then((data) => setDenuncias(data.denuncias || []))
      .catch(() => setDenuncias([]))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <>
      <div className="perfil-section-head">
        <h1>Minhas <em>denúncias</em></h1>
        <p>Acompanhe o retorno da nossa equipe sobre as denúncias que você enviou.</p>
      </div>

      {carregando && <p className="perfil-loading">Carregando denúncias...</p>}

      {!carregando && denuncias?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon">🚩</div>
          <h4>Você ainda não fez nenhuma denúncia</h4>
          <p>Se algo parecer errado com um anúncio ou usuário, use o botão de denúncia na página dele.</p>
        </div>
      )}

      {!carregando && denuncias?.length > 0 && (
        <div className="lista-denuncias">
          {denuncias.map((d) => (
            <div className="denuncia-card-perfil" key={d.id}>
              <div className="denuncia-card-perfil-topo">
                <h3>
                  {d.anuncio_titulo
                    ? <>Anúncio: {d.anuncio_id ? <Link to={`/anuncio/${d.anuncio_id}`}>{d.anuncio_titulo}</Link> : d.anuncio_titulo}</>
                    : `Perfil: ${d.denunciado_nome || 'usuário removido'}`}
                </h3>
                <span className={`status-badge ${d.status}`}>{STATUS_DENUNCIA_LABEL[d.status] || d.status}</span>
              </div>
              <p>Motivo: {MOTIVO_DENUNCIA_LABEL[d.motivo] || d.motivo} · Enviada em {dataBR(d.criada_em)}</p>
              {d.descricao && <p className="denuncia-descricao">"{d.descricao}"</p>}

              {d.resolucao ? (
                <div className="denuncia-resposta-admin">
                  <strong>Retorno da equipe:</strong> {d.resolucao}
                </div>
              ) : (
                <div className="denuncia-resposta-admin">Ainda sem retorno da nossa equipe — assim que analisarmos, você verá a resposta aqui.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO RECEBIMENTOS — conexão da conta Mercado Pago do vendedor
   [Marketplace] Sem isso conectado, o vendedor não recebe as
   vendas dele (nem consegue vender — os anúncios ficam bloqueados
   pra compra até a conta ser conectada).
   ════════════════════════════════════════════════════════════ */
const SecaoPagamentos = ({ usuario, setUsuario, mpParam, limparMpParam }) => {
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState('');
  const [feedback] = useState(
    mpParam === 'conectado'
      ? { tipo: 'success', msg: 'Conta do Mercado Pago conectada com sucesso! Agora suas vendas caem direto na sua conta.' }
      : mpParam === 'erro'
      ? { tipo: 'error', msg: 'Não foi possível conectar sua conta do Mercado Pago. Tente novamente.' }
      : null
  );

  // Ao voltar do Mercado Pago, atualiza o status na tela e limpa o
  // ?mp=... da URL pra não reaparecer se a página for recarregada.
  useEffect(() => {
    if (!mpParam) return;
    if (mpParam === 'conectado') {
      setUsuario((prev) => ({ ...prev, mp_conectado: true }));
    }
    limparMpParam();
  }, [mpParam]);

  const conectar = async () => {
    setConectando(true);
    setErro('');
    try {
      const resposta = await fetch(`${API_URL}/api/mp/connect`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok || !dados.url) {
        setErro(dados.erro || 'Não foi possível iniciar a conexão com o Mercado Pago.');
        setConectando(false);
        return;
      }
      window.location.href = dados.url;
    } catch {
      setErro('Erro ao conectar com o servidor.');
      setConectando(false);
    }
  };

  const conectado = usuario?.mp_conectado === true;

  return (
    <>
      <div className="perfil-section-head">
        <h1>Recebimentos <em>Mercado Pago</em></h1>
        <p>Conecte sua conta pra receber o valor das suas vendas direto, sem intermediário.</p>
      </div>

      {feedback && (
        <div className={`perfil-alert ${feedback.tipo}`}>
          {feedback.tipo === 'success' ? <IconCheck /> : <IconAlert />}
          {feedback.msg}
        </div>
      )}
      {erro && (
        <div className="perfil-alert error">
          <IconAlert /> {erro}
        </div>
      )}

      <div className={`painel-cta ${conectado ? 'sell' : 'buy'}`} style={{ maxWidth: 520 }}>
        <div className="painel-cta-icon"><I.wallet /></div>
        {conectado ? (
          <>
            <h3>Conta conectada ✓</h3>
            <p>
              Suas vendas são pagas direto na sua conta do Mercado Pago.
              A plataforma retém apenas a comissão de intermediação sobre cada venda.
            </p>
          </>
        ) : (
          <>
            <h3>Você ainda não pode vender</h3>
            <p>
              Pra receber pagamentos, conecte sua conta do Mercado Pago. Sem isso,
              seus anúncios ficam visíveis mas ninguém consegue comprar deles.
            </p>
            <button
              type="button"
              className="painel-cta-btn"
              onClick={conectar}
              disabled={conectando}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <I.wallet /> {conectando ? 'Abrindo Mercado Pago...' : 'Conectar minha conta Mercado Pago'}
            </button>
          </>
        )}
      </div>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO AVALIAÇÕES RECEBIDAS
   ════════════════════════════════════════════════════════════ */
const SecaoAvaliacoes = () => {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/usuario/avaliacoes`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
    })
      .then((r) => r.json())
      .then(setDados)
      .catch(() => setDados({ avaliacoes: [], media: null, total: 0 }))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <>
      <div className="perfil-section-head">
        <h1>Minhas <em>avaliações</em></h1>
        <p>O que quem comprou de você achou da negociação.</p>
      </div>

      {carregando && <p className="perfil-loading">Carregando avaliações...</p>}

      {!carregando && dados?.total > 0 && (
        <div className="avaliacoes-resumo">
          <div className="avaliacoes-media-num">{dados.media.toFixed(1)}</div>
          <div className="avaliacoes-media-info">
            <Estrelas nota={dados.media} />
            <span>{dados.total} avaliaç{dados.total > 1 ? 'ões' : 'ão'}</span>
          </div>
        </div>
      )}

      {!carregando && dados?.avaliacoes?.length === 0 && (
        <div className="painel-empty">
          <div className="painel-empty-icon">⭐</div>
          <h4>Você ainda não recebeu avaliações</h4>
          <p>Quando alguém comprar de você e avaliar a negociação, aparece aqui.</p>
        </div>
      )}

      {!carregando && dados?.avaliacoes?.length > 0 && (
        <div className="lista-avaliacoes">
          {dados.avaliacoes.map((av) => (
            <div className="avaliacao-card" key={av.id}>
              <div className="avaliacao-card-topo">
                <div className="avaliacao-avaliador">
                  <div className="avaliacao-avatar">
                    {av.avaliador_foto
                      ? <img src={av.avaliador_foto} alt={av.avaliador_nome} />
                      : av.avaliador_nome[0].toUpperCase()}
                  </div>
                  <div>
                    <strong>{av.avaliador_nome}</strong>
                    <span>{av.anuncio_titulo} · {dataBR(av.criada_em)}</span>
                  </div>
                </div>
                <Estrelas nota={av.nota} />
              </div>
              {av.comentario && <p className="avaliacao-comentario">"{av.comentario}"</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO DADOS PESSOAIS
   ════════════════════════════════════════════════════════════ */
const SecaoDados = ({ usuario, setUsuario }) => {
  const [form, setForm] = useState({
    nome: usuario.nome || '',
    sobrenome: usuario.sobrenome || '',
    telefone: maskPhone(usuario.telefone),
    recebe_newsletter: usuario.recebe_newsletter || false,
  });
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const formatPhone = (value) => {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    setForm({ ...form, telefone: v });
  };

  const salvar = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setSalvando(true);

    try {
      const resposta = await fetch(`${API_URL}/api/usuario/perfil`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({
          nome: form.nome.trim(),
          sobrenome: form.sobrenome.trim(),
          telefone: form.telefone.replace(/\D/g, '') || null,
          cep: usuario.cep, logradouro: usuario.logradouro,
          numero: usuario.numero, complemento: usuario.complemento,
          bairro: usuario.bairro,
          recebe_newsletter: form.recebe_newsletter,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setFeedback({ tipo: 'error', msg: dados.erro || 'Erro ao salvar.' });
      } else {
        const novo = { ...usuario,
          nome: form.nome.trim(),
          sobrenome: form.sobrenome.trim(),
          telefone: form.telefone.replace(/\D/g, ''),
          recebe_newsletter: form.recebe_newsletter,
        };
        setUsuario(novo);
        const stored = JSON.parse(localStorage.getItem('sd_usuario') || '{}');
        localStorage.setItem('sd_usuario', JSON.stringify({
          ...stored, nome: novo.nome, sobrenome: novo.sobrenome
        }));
        setFeedback({ tipo: 'success', msg: 'Perfil atualizado com sucesso!' });
      }
    } catch {
      setFeedback({ tipo: 'error', msg: 'Erro ao conectar com o servidor.' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Dados <em>pessoais</em></h1>
        <p>Atualize suas informações de contato. Mantenha tudo atualizado pra negociações fluírem melhor.</p>
      </div>

      {feedback && (
        <div className={`perfil-alert ${feedback.tipo}`}>
          {feedback.tipo === 'success' ? <IconCheck /> : <IconAlert />}
          {feedback.msg}
        </div>
      )}

      <form onSubmit={salvar} className="perfil-form">
        <div className="perfil-form-row">
          <div className="perfil-field">
            <label className="perfil-field-label">Nome <span className="required">*</span></label>
            <div className="perfil-input-wrap">
              <IconUser />
              <input className="perfil-input" type="text" value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
          </div>
          <div className="perfil-field">
            <label className="perfil-field-label">Sobrenome <span className="required">*</span></label>
            <div className="perfil-input-wrap">
              <IconUser />
              <input className="perfil-input" type="text" value={form.sobrenome}
                onChange={(e) => setForm({ ...form, sobrenome: e.target.value })} required />
            </div>
          </div>
        </div>

        <div className="perfil-form-row">
          <div className="perfil-field">
            <label className="perfil-field-label">
              CPF <span className="lock-badge"><IconLock /> não editável</span>
            </label>
            <div className="perfil-input-wrap">
              <IconID />
              <input className="perfil-input locked" type="text"
                value={maskCPF(usuario.cpf)} disabled readOnly />
            </div>
            <span className="perfil-field-hint">
              CPF é seu identificador único na plataforma e não pode ser alterado (RN02).
            </span>
          </div>

          <div className="perfil-field">
            <label className="perfil-field-label">Telefone / WhatsApp</label>
            <div className="perfil-input-wrap">
              <IconPhone />
              <input className="perfil-input" type="tel" placeholder="(11) 99999-9999"
                value={form.telefone}
                onChange={(e) => formatPhone(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="perfil-field">
          <label className="perfil-field-label">
            E-mail <span className="lock-badge"><IconLock /> não editável</span>
          </label>
          <div className="perfil-input-wrap">
            <IconMail />
            <input className="perfil-input locked" type="email"
              value={usuario.email} disabled readOnly />
          </div>
          <span className="perfil-field-hint">
            O e-mail está vinculado à autenticação da conta (incluindo login com Google).
          </span>
        </div>

        <label className="perfil-checkbox" onClick={() => setForm({ ...form, recebe_newsletter: !form.recebe_newsletter })}>
          <div className={`checkbox-custom${form.recebe_newsletter ? ' checked' : ''}`} />
          <div className="perfil-checkbox-label">
            <strong>Receber novidades e alertas por e-mail</strong>
            Avisos sobre novos desapegos perto de você, dicas e atualizações da plataforma.
          </div>
        </label>

        <div className="perfil-actions">
          <button type="submit" className="btn-perfil-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : (<>Salvar alterações <IconCheck /></>)}
          </button>
        </div>
      </form>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO ENDEREÇO
   ════════════════════════════════════════════════════════════ */
const SecaoEndereco = ({ usuario, setUsuario }) => {
  const [form, setForm] = useState({
    cep: maskCEP(usuario.cep),
    logradouro: usuario.logradouro || '',
    numero: usuario.numero || '',
    complemento: usuario.complemento || '',
    bairro: usuario.bairro || '',
  });
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const formatCEP = (value) => {
    let v = value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
    setForm({ ...form, cep: v });
  };

  const salvar = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setSalvando(true);

    try {
      const resposta = await fetch(`${API_URL}/api/usuario/perfil`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({
          nome: usuario.nome, sobrenome: usuario.sobrenome,
          telefone: usuario.telefone,
          recebe_newsletter: usuario.recebe_newsletter,
          cep: form.cep.replace(/\D/g, '') || null,
          logradouro: form.logradouro.trim() || null,
          numero: form.numero.trim() || null,
          complemento: form.complemento.trim() || null,
          bairro: form.bairro || null,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setFeedback({ tipo: 'error', msg: dados.erro || 'Erro ao salvar.' });
      } else {
        setUsuario({ ...usuario,
          cep: form.cep.replace(/\D/g, ''),
          logradouro: form.logradouro.trim(),
          numero: form.numero.trim(),
          complemento: form.complemento.trim(),
          bairro: form.bairro,
        });
        setFeedback({ tipo: 'success', msg: 'Endereço atualizado com sucesso!' });
      }
    } catch {
      setFeedback({ tipo: 'error', msg: 'Erro ao conectar com o servidor.' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Seu <em>endereço</em></h1>
        <p>Usado para calcular a distância até os anúncios e priorizar negócios próximos. Apenas vizinhos veem seu bairro — número e complemento ficam privados.</p>
      </div>

      {feedback && (
        <div className={`perfil-alert ${feedback.tipo}`}>
          {feedback.tipo === 'success' ? <IconCheck /> : <IconAlert />}
          {feedback.msg}
        </div>
      )}

      <form onSubmit={salvar} className="perfil-form">
        <div className="perfil-form-row">
          <div className="perfil-field">
            <label className="perfil-field-label">CEP</label>
            <div className="perfil-input-wrap">
              <IconPin />
              <input className="perfil-input" type="text" placeholder="00000-000"
                value={form.cep} onChange={(e) => formatCEP(e.target.value)} maxLength={9} />
            </div>
          </div>
          <div className="perfil-field">
            <label className="perfil-field-label">Bairro</label>
            <div className="perfil-input-wrap">
              <IconPin />
              <select className="perfil-select" value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}>
                <option value="">Selecione...</option>
                {BAIRROS.map((b) => <option key={b}>{b}</option>)}
              </select>
              <span className="perfil-select-arrow"><IconChevron /></span>
            </div>
          </div>
        </div>

        <div className="perfil-field">
          <label className="perfil-field-label">Logradouro</label>
          <div className="perfil-input-wrap">
            <IconHome />
            <input className="perfil-input" type="text" placeholder="Rua, Av., Travessa..."
              value={form.logradouro}
              onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
          </div>
        </div>

        <div className="perfil-form-row">
          <div className="perfil-field">
            <label className="perfil-field-label">Número</label>
            <div className="perfil-input-wrap">
              <IconHome />
              <input className="perfil-input" type="text" placeholder="Ex: 123"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
          </div>
          <div className="perfil-field">
            <label className="perfil-field-label">Complemento</label>
            <div className="perfil-input-wrap">
              <IconHome />
              <input className="perfil-input" type="text" placeholder="Apto, Bloco..."
                value={form.complemento}
                onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="perfil-actions">
          <button type="submit" className="btn-perfil-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : (<>Salvar endereço <IconCheck /></>)}
          </button>
        </div>
      </form>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO SEGURANÇA — RN03
   ════════════════════════════════════════════════════════════ */
const SecaoSeguranca = () => {
  const [form, setForm] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' });
  const [show, setShow] = useState({ atual: false, nova: false, confirm: false });
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [strength, setStrength] = useState({ score: 0, label: '', cls: '' });

  const checkStrength = (val) => {
    if (!val) { setStrength({ score: 0, label: '', cls: '' }); return; }
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = ['weak', 'weak', 'medium', 'strong'];
    const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte'];
    setStrength({ score, cls: levels[score - 1] || 'weak', label: `Força: ${labels[score - 1] || 'Muito fraca'}` });
  };

  const salvar = async (e) => {
    e.preventDefault();
    setFeedback(null);
    if (form.novaSenha !== form.confirmar) {
      setFeedback({ tipo: 'error', msg: 'A nova senha e a confirmação não coincidem.' });
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch(`${API_URL}/api/usuario/senha`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({ senhaAtual: form.senhaAtual, novaSenha: form.novaSenha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setFeedback({ tipo: 'error', msg: dados.erro || 'Erro ao trocar senha.' });
      } else {
        setFeedback({ tipo: 'success', msg: 'Senha alterada com sucesso!' });
        setForm({ senhaAtual: '', novaSenha: '', confirmar: '' });
        setStrength({ score: 0, label: '', cls: '' });
      }
    } catch {
      setFeedback({ tipo: 'error', msg: 'Erro ao conectar com o servidor.' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Trocar <em>senha</em></h1>
        <p>Sua senha precisa ter no mínimo 8 caracteres com letras maiúsculas, minúsculas, números e um caractere especial (RN03 — Política de Senhas Robustas).</p>
      </div>

      {feedback && (
        <div className={`perfil-alert ${feedback.tipo}`}>
          {feedback.tipo === 'success' ? <IconCheck /> : <IconAlert />}
          {feedback.msg}
        </div>
      )}

      <form onSubmit={salvar} className="perfil-form">
        <div className="perfil-field">
          <label className="perfil-field-label">Senha atual <span className="required">*</span></label>
          <div className="perfil-input-wrap">
            <IconLock />
            <input className="perfil-input"
              type={show.atual ? 'text' : 'password'}
              value={form.senhaAtual}
              onChange={(e) => setForm({ ...form, senhaAtual: e.target.value })}
              autoComplete="current-password" required />
            <button type="button" className="password-toggle"
              onClick={() => setShow({ ...show, atual: !show.atual })}>
              {IconEye(show.atual)}
            </button>
          </div>
        </div>

        <div className="perfil-field">
          <label className="perfil-field-label">Nova senha <span className="required">*</span></label>
          <div className="perfil-input-wrap">
            <IconLock />
            <input className="perfil-input"
              type={show.nova ? 'text' : 'password'}
              value={form.novaSenha}
              placeholder="Mínimo 8 caracteres com maiúscula, número e símbolo"
              onChange={(e) => { setForm({ ...form, novaSenha: e.target.value }); checkStrength(e.target.value); }}
              autoComplete="new-password" required minLength={8} />
            <button type="button" className="password-toggle"
              onClick={() => setShow({ ...show, nova: !show.nova })}>
              {IconEye(show.nova)}
            </button>
          </div>
          {form.novaSenha && (
            <div className="password-strength">
              <div className="strength-bar">
                {[0,1,2,3].map((i) => (
                  <div key={i} className={`strength-seg${i < strength.score ? ' ' + strength.cls : ''}`} />
                ))}
              </div>
              <span className={`strength-label ${strength.cls}`}>{strength.label}</span>
            </div>
          )}
        </div>

        <div className="perfil-field">
          <label className="perfil-field-label">Confirmar nova senha <span className="required">*</span></label>
          <div className="perfil-input-wrap">
            <IconLock />
            <input className="perfil-input"
              type={show.confirm ? 'text' : 'password'}
              value={form.confirmar}
              onChange={(e) => setForm({ ...form, confirmar: e.target.value })}
              autoComplete="new-password" required />
            <button type="button" className="password-toggle"
              onClick={() => setShow({ ...show, confirm: !show.confirm })}>
              {IconEye(show.confirm)}
            </button>
          </div>
          {form.confirmar && form.confirmar !== form.novaSenha && (
            <span style={{ fontSize: '0.76rem', color: 'var(--terracotta)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <IconAlert /> As senhas não coincidem.
            </span>
          )}
        </div>

        <div className="perfil-actions">
          <button type="submit" className="btn-perfil-primary" disabled={salvando}>
            {salvando ? 'Atualizando...' : (<>Alterar senha <IconShield /></>)}
          </button>
        </div>
      </form>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   SEÇÃO LGPD
   ════════════════════════════════════════════════════════════ */
const SecaoLGPD = ({ usuario }) => {
  const navigate = useNavigate();
  const [exportando, setExportando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [senhaExcluir, setSenhaExcluir] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState('');

  // [RF03] Aceite de termos — versão + data/hora do aceite
  const [termos, setTermos] = useState({
    versao: usuario.termos_versao,
    aceitosEm: usuario.termos_aceitos_em,
    atualizados: usuario.termos_atualizados,
  });
  const [aceitando, setAceitando] = useState(false);

  const reaceitarTermos = async () => {
    setAceitando(true);
    try {
      const resposta = await fetch(`${API_URL}/api/usuario/aceitar-termos`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
      });
      const dados = await resposta.json();
      if (resposta.ok) {
        setTermos({ versao: dados.termos_versao, aceitosEm: dados.termos_aceitos_em, atualizados: false });
      } else {
        alert(dados.erro || 'Erro ao registrar aceite dos termos.');
      }
    } catch {
      alert('Erro ao conectar com o servidor.');
    } finally {
      setAceitando(false);
    }
  };

  const exportarDados = async (formato) => {
    setExportando(formato);
    try {
      const resposta = await fetch(`${API_URL}/api/usuario/exportar?formato=${formato}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
      });
      const conteudo = formato === 'csv'
        ? await resposta.text()
        : JSON.stringify(await resposta.json(), null, 2);
      const blob = new Blob([conteudo], { type: formato === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `santo-desapego-meus-dados-${Date.now()}.${formato}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao exportar dados.');
    } finally {
      setExportando(false);
    }
  };

  const excluirConta = async () => {
    if (!senhaExcluir) {
      setErroExcluir('Digite sua senha para confirmar.');
      return;
    }
    setExcluindo(true);
    setErroExcluir('');

    try {
      const resposta = await fetch(`${API_URL}/api/usuario/conta`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({ senhaConfirmacao: senhaExcluir }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErroExcluir(dados.erro || 'Erro ao excluir conta.');
        setExcluindo(false);
        return;
      }
      localStorage.removeItem('sd_token');
      localStorage.removeItem('sd_usuario');
      alert(dados.mensagem || 'Sua conta foi excluída. Sentiremos sua falta!');
      navigate('/');
    } catch {
      setErroExcluir('Erro ao conectar com o servidor.');
      setExcluindo(false);
    }
  };

  return (
    <>
      <div className="perfil-section-head">
        <h1>Privacidade <em>e dados</em></h1>
        <p>De acordo com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), você tem direito de acessar, exportar e solicitar a exclusão dos seus dados a qualquer momento.</p>
      </div>

      <div className="lgpd-card info">
        <div className="lgpd-card-icon"><I.download /></div>
        <div className="lgpd-card-body">
          <h3>Baixar uma cópia dos seus dados</h3>
          <p>
            Faça o download de todos os dados pessoais que mantemos sobre você em formato JSON.
            Direito garantido pelo art. 18, II da LGPD.
          </p>
          <div className="lgpd-export-btns">
            <button className="btn-perfil-secondary" onClick={() => exportarDados('json')} disabled={!!exportando}>
              {exportando === 'json' ? 'Gerando arquivo...' : 'Baixar meus dados (.json)'}
            </button>
            <button className="btn-perfil-secondary" onClick={() => exportarDados('csv')} disabled={!!exportando}>
              {exportando === 'csv' ? 'Gerando arquivo...' : 'Baixar meus dados (.csv)'}
            </button>
          </div>
          <small>Os dados incluem nome, e-mail, CPF, telefone, endereço e preferências.</small>
        </div>
      </div>

      <div className={`lgpd-card${termos.atualizados ? ' danger' : ' info'}`}>
        <div className="lgpd-card-icon"><IconCheck /></div>
        <div className="lgpd-card-body">
          <h3>Termos de Uso e Política de Privacidade</h3>
          {termos.aceitosEm ? (
            <p>
              Você aceitou a versão <strong>{termos.versao}</strong> em{' '}
              <strong>{new Date(termos.aceitosEm).toLocaleString('pt-BR')}</strong>.
            </p>
          ) : (
            <p>Ainda não encontramos o registro do seu aceite.</p>
          )}
          {termos.atualizados && (
            <>
              <p>
                Atualizamos os Termos de Uso / Política de Privacidade desde o seu último aceite.
                Para continuar usando a plataforma normalmente, reaceite a versão vigente.
              </p>
              <button className="btn-perfil-secondary" onClick={reaceitarTermos} disabled={aceitando}>
                {aceitando ? 'Registrando...' : 'Reaceitar termos vigentes'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="lgpd-card danger">
        <div className="lgpd-card-icon"><I.trash /></div>
        <div className="lgpd-card-body">
          <h3>Excluir minha conta</h3>
          <p>
            Esta ação é <strong>permanente e irreversível</strong>. Todos os seus dados pessoais serão removidos
            do nosso sistema. Caso possua transações concluídas, os registros financeiros serão anonimizados
            por 5 anos para cumprimento de obrigações legais (RN10).
          </p>
          <button className="btn-perfil-danger" onClick={() => setModalExcluir(true)}>
            Excluir minha conta
          </button>
        </div>
      </div>

      {modalExcluir && (
        <div className="modal-overlay" onClick={() => !excluindo && setModalExcluir(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Tem certeza?</h2>
            <p>
              <strong>{usuario.nome}</strong>, esta ação <strong>não pode ser desfeita</strong>.
              Todos os seus dados pessoais serão permanentemente removidos.
              Pra confirmar, digite sua senha:
            </p>
            {erroExcluir && (
              <div className="perfil-alert error">
                <IconAlert /> {erroExcluir}
              </div>
            )}
            <div className="perfil-field">
              <label className="perfil-field-label">Senha <span className="required">*</span></label>
              <div className="perfil-input-wrap">
                <IconLock />
                <input className="perfil-input" type="password"
                  placeholder="Digite sua senha pra confirmar"
                  value={senhaExcluir}
                  onChange={(e) => setSenhaExcluir(e.target.value)}
                  autoComplete="current-password" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-perfil-secondary"
                onClick={() => { setModalExcluir(false); setSenhaExcluir(''); setErroExcluir(''); }}
                disabled={excluindo}>
                Cancelar
              </button>
              <button className="btn-perfil-danger" onClick={excluirConta} disabled={excluindo}>
                {excluindo ? 'Excluindo...' : 'Sim, excluir conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Perfil;