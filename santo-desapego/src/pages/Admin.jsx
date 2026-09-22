import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Admin.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';
import { IconUser, IconShield, IconTag, IconFlag, IconPlus, IconAlert, IconChevron } from '../componentes/Icones';

import { API_URL } from '../config';

/* ── Ícones SVG ───────────────────────────────────────────── */
const I = {
  dashboard: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  users:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  layers:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  clock:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  help:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

// Rótulo de cada aba — usado no botão que abre/fecha o menu no mobile
const ABA_LABEL_ADMIN = {
  dashboard: 'Visão geral',
  usuarios: 'Usuários',
  anuncios: 'Anúncios',
  categorias: 'Categorias',
  denuncias: 'Denúncias',
  suporte: 'Central de ajuda',
  logs: 'Logs de auditoria',
};

const dataBR = (v) => v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const dataHoraBR = (v) => v ? new Date(v).toLocaleString('pt-BR') : '—';
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
});

/* Helper genérico de fetch autenticado */
const apiFetch = async (path, options = {}) => {
  const resposta = await fetch(`${API_URL}${path}`, { ...options, headers: authHeaders() });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Erro ao processar a solicitação.');
  return dados;
};

/* ════════════════════════════════════════════════════════════
   MODAL DE CONFIRMAÇÃO — usado nas ações destrutivas/sensíveis
   ════════════════════════════════════════════════════════════ */
const ModalConfirmar = ({ titulo, descricao, pedirMotivo, textoConfirmar = 'Confirmar', positivo, aoConfirmar, aoCancelar }) => {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const confirmar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await aoConfirmar(motivo);
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !enviando && aoCancelar()}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        <p>{descricao}</p>
        {erro && <div className="admin-alert error">{erro}</div>}
        {pedirMotivo && (
          <>
            <label>Motivo (opcional)</label>
            <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
          </>
        )}
        <div className="admin-modal-actions">
          <button className="btn-modal-cancel" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button className={`btn-modal-confirm${positivo ? ' positivo' : ''}`} onClick={confirmar} disabled={enviando}>
            {enviando ? 'Aguarde...' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   GRÁFICOS — SVG puro, sem dependências externas
   ════════════════════════════════════════════════════════════ */
const CORES_STATUS = { ativo: '#0ca30c', pausado: '#fab219', vendido: '#8a8778' };
const COR_RANKING = '#eb6834';
const COR_SERIE = '#2a78d6';

/* Barras verticais — distribuição de anúncios por status */
const GraficoStatus = ({ dados }) => {
  const largura = 420, altura = 200, margemInferior = 28, margemSuperior = 16;
  const areaAltura = altura - margemInferior - margemSuperior;
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const larguraBarra = 64;
  const espaco = (largura - larguraBarra * dados.length) / (dados.length + 1);

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" role="img" aria-label="Anúncios por status">
      <line x1="0" y1={altura - margemInferior} x2={largura} y2={altura - margemInferior} stroke="var(--border)" strokeWidth="1" />
      {dados.map((d, i) => {
        const h = (d.valor / max) * areaAltura;
        const x = espaco + i * (larguraBarra + espaco);
        const y = altura - margemInferior - h;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${d.valor}`}</title>
            <rect x={x} y={y} width={larguraBarra} height={Math.max(h, 2)} rx="4" fill={d.cor} />
            <text x={x + larguraBarra / 2} y={y - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
              {d.valor}
            </text>
            <text x={x + larguraBarra / 2} y={altura - 8} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* Barras horizontais — ranking (magnitude, hue único) */
const GraficoRanking = ({ dados }) => {
  if (dados.length === 0) return null;
  const largura = 420, alturaLinha = 34;
  const altura = alturaLinha * dados.length;
  const max = Math.max(1, ...dados.map((d) => d.total));
  const larguraLabel = 130;
  const areaBarra = largura - larguraLabel - 40;

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" role="img" aria-label="Categorias mais anunciadas">
      {dados.map((d, i) => {
        const w = (d.total / max) * areaBarra;
        const y = i * alturaLinha + 6;
        return (
          <g key={d.nome}>
            <title>{`${d.nome}: ${d.total}`}</title>
            <text x="0" y={y + 14} fontSize="12" fill="var(--ink-soft)">{d.nome}</text>
            <rect x={larguraLabel} y={y} width={Math.max(w, 3)} height="20" rx="4" fill={COR_RANKING} />
            <text x={larguraLabel + w + 8} y={y + 14} fontSize="12" fontWeight="700" fill="var(--ink)">{d.total}</text>
          </g>
        );
      })}
    </svg>
  );
};

/* Linha + área — cadastros nos últimos 30 dias, com hover simples */
const GraficoSerie = ({ dados }) => {
  const [hover, setHover] = useState(null);
  const largura = 760, altura = 200, margem = 24;
  const max = Math.max(1, ...dados.map((d) => d.total));
  const passo = (largura - margem * 2) / (dados.length - 1);

  const pontos = dados.map((d, i) => ({
    x: margem + i * passo,
    y: altura - margem - (d.total / max) * (altura - margem * 2),
    ...d,
  }));

  const linha = pontos.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${margem},${altura - margem} ${linha} ${largura - margem},${altura - margem}`;

  const aoMover = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * largura;
    const i = Math.round((x - margem) / passo);
    if (i >= 0 && i < pontos.length) setHover(pontos[i]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" role="img" aria-label="Novos cadastros nos últimos 30 dias"
        onMouseMove={aoMover} onMouseLeave={() => setHover(null)}>
        <line x1={margem} y1={altura - margem} x2={largura - margem} y2={altura - margem} stroke="var(--border)" strokeWidth="1" />
        <polygon points={area} fill={COR_SERIE} opacity="0.1" />
        <polyline points={linha} fill="none" stroke={COR_SERIE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <text x={margem} y={altura - 6} fontSize="11" fill="var(--ink-muted)">
          {new Date(dados[0].dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </text>
        <text x={largura - margem} y={altura - 6} fontSize="11" fill="var(--ink-muted)" textAnchor="end">
          {new Date(dados[dados.length - 1].dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </text>
        {hover && (
          <>
            <line x1={hover.x} y1={margem} x2={hover.x} y2={altura - margem} stroke="var(--border)" strokeWidth="1" />
            <circle cx={hover.x} cy={hover.y} r="5" fill={COR_SERIE} stroke="var(--paper)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          left: `${(hover.x / largura) * 100}%`, top: 0,
          transform: hover.x > largura * 0.7 ? 'translateX(-100%)' : 'none',
          background: 'var(--ink)', color: 'var(--cream)',
          fontSize: '0.76rem', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)',
          whiteSpace: 'nowrap',
        }}>
          {new Date(hover.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {hover.total} cadastro(s)
        </div>
      )}
    </div>
  );
};

const Paginacao = ({ paginacao, pagina, setPagina }) => {
  if (!paginacao || paginacao.total_paginas <= 1) return null;
  return (
    <div className="admin-paginacao">
      <button className="btn-admin-mini" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>← Anterior</button>
      <span>Página {paginacao.pagina_atual} de {paginacao.total_paginas} · {paginacao.total_itens} itens</span>
      <button className="btn-admin-mini" disabled={pagina >= paginacao.total_paginas} onClick={() => setPagina(pagina + 1)}>Próxima →</button>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ════════════════════════════════════════════════════════════ */
const Admin = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [negado, setNegado] = useState(false);
  const [aba, setAba] = useState('dashboard');

  // No mobile, as 7 abas empilhadas empurram o conteúdo pra longe do
  // topo — viram um menu que abre/fecha, mesmo padrão do Perfil.
  const [abaMenuAberto, setAbaMenuAberto] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('sd_token');
    const armazenado = localStorage.getItem('sd_usuario');
    if (!token || !armazenado) { navigate('/login'); return; }

    const u = JSON.parse(armazenado);
    if (u.papel !== 'administrador') { setNegado(true); setCarregando(false); return; }

    setUsuario(u);
    setCarregando(false);
  }, [navigate]);

  if (carregando) {
    return <div className="admin-wrapper"><div className="admin-loading">Carregando painel...</div></div>;
  }

  if (negado) {
    return (
      <div className="admin-wrapper">
        <div className="admin-negado">
          <span className="emoji">🔒</span>
          <h2>Acesso restrito</h2>
          <p>Esta área é exclusiva para administradores da plataforma.</p>
          <Link to="/" className="btn-admin-add">Voltar para a home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrapper">
      <div className="announcement">🛡️ Painel Administrativo — Santo Desapego</div>

      <SiteHeader>
        <Link to="/perfil" className="nav-btn">
          <IconUser size={15} strokeWidth={2.3} />
          Meu perfil
        </Link>
        <NavBackButton to="/">Sair do painel</NavBackButton>
      </SiteHeader>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-head">
            <div className="badge-admin"><IconShield size={20} /></div>
            <div>
              <h3>{usuario.nome}</h3>
              <span>Administrador(a)</span>
            </div>
          </div>

          {/* Botão só-mobile: mostra a aba atual e abre/fecha a lista */}
          <button
            type="button"
            className={`admin-abas-toggle${abaMenuAberto ? ' aberto' : ''}`}
            onClick={() => setAbaMenuAberto((v) => !v)}
            aria-expanded={abaMenuAberto}
          >
            <span>{ABA_LABEL_ADMIN[aba] || 'Menu'}</span>
            <IconChevron />
          </button>

          <nav
            className={`admin-tabs${abaMenuAberto ? ' mobile-aberto' : ''}`}
            onClick={(e) => { if (e.target.closest('.admin-tab')) setAbaMenuAberto(false); }}
          >
            <button className={`admin-tab${aba === 'dashboard' ? ' active' : ''}`} onClick={() => setAba('dashboard')}>
              <I.dashboard /> Visão geral
            </button>
            <button className={`admin-tab${aba === 'usuarios' ? ' active' : ''}`} onClick={() => setAba('usuarios')}>
              <I.users /> Usuários
            </button>
            <button className={`admin-tab${aba === 'anuncios' ? ' active' : ''}`} onClick={() => setAba('anuncios')}>
              <IconTag size={16} /> Anúncios
            </button>
            <button className={`admin-tab${aba === 'categorias' ? ' active' : ''}`} onClick={() => setAba('categorias')}>
              <I.layers /> Categorias
            </button>
            <button className={`admin-tab${aba === 'denuncias' ? ' active' : ''}`} onClick={() => setAba('denuncias')}>
              <IconFlag size={16} /> Denúncias
            </button>
            <button className={`admin-tab${aba === 'suporte' ? ' active' : ''}`} onClick={() => setAba('suporte')}>
              <I.help /> Central de ajuda
            </button>
            <button className={`admin-tab${aba === 'logs' ? ' active' : ''}`} onClick={() => setAba('logs')}>
              <I.clock /> Logs de auditoria
            </button>
          </nav>
        </aside>

        <main className="admin-content">
          {aba === 'dashboard'  && <SecaoDashboard />}
          {aba === 'usuarios'   && <SecaoUsuarios usuarioLogado={usuario} />}
          {aba === 'anuncios'   && <SecaoAnuncios />}
          {aba === 'categorias' && <SecaoCategorias />}
          {aba === 'denuncias'  && <SecaoDenuncias />}
          {aba === 'suporte'    && <SecaoSuporte />}
          {aba === 'logs'       && <SecaoLogs />}
        </main>
      </div>

      <footer className="site-footer">
        <span>© 2026 Santo Desapego</span>
      </footer>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   VISÃO GERAL
   ════════════════════════════════════════════════════════════ */
const SecaoDashboard = () => {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/dashboard').then(setDados).catch((e) => setErro(e.message));
  }, []);

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Visão <em>geral</em></h1>
          <p>Resumo da atividade da plataforma Santo Desapego.</p>
        </div>
      </div>

      {erro && <div className="admin-alert error">{erro}</div>}
      {!dados && !erro && <div className="admin-loading">Carregando...</div>}

      {dados && (
        <>
          <div className="admin-stats">
            <div className="admin-stat">
              <div className="admin-stat-icon forest"><I.users /></div>
              <div className="admin-stat-label">Usuários cadastrados</div>
              <div className="admin-stat-num">{dados.usuarios.total}</div>
              <div className="admin-stat-sub">{dados.usuarios.suspensos} suspenso(s)</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-icon terracotta"><IconTag size={16} /></div>
              <div className="admin-stat-label">Anúncios</div>
              <div className="admin-stat-num">{dados.anuncios.total}</div>
              <div className="admin-stat-sub">{dados.anuncios.ativos} ativos · {dados.anuncios.vendidos} vendidos</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-icon mustard"><I.dashboard /></div>
              <div className="admin-stat-label">Volume transacionado</div>
              <div className="admin-stat-num">{brl(dados.compras.volume)}</div>
              <div className="admin-stat-sub">{dados.compras.total} compra(s) aprovada(s)</div>
            </div>
            <div className={`admin-stat${dados.denuncias.pendentes > 0 ? ' alerta' : ''}`}>
              <div className="admin-stat-icon ink"><IconFlag size={16} /></div>
              <div className="admin-stat-label">Denúncias pendentes</div>
              <div className="admin-stat-num">{dados.denuncias.pendentes}</div>
              <div className="admin-stat-sub">{dados.denuncias.total} no total</div>
            </div>
            <div className={`admin-stat${dados.suporte.pendentes > 0 ? ' alerta' : ''}`}>
              <div className="admin-stat-icon terracotta"><I.help /></div>
              <div className="admin-stat-label">Central de ajuda pendente</div>
              <div className="admin-stat-num">{dados.suporte.pendentes}</div>
              <div className="admin-stat-sub">{dados.suporte.total} solicitação(ões) no total</div>
            </div>
          </div>

          <div className="admin-charts-grid">
            <div className="admin-chart-card">
              <h3>Anúncios por status</h3>
              <GraficoStatus dados={[
                { label: 'Ativo', valor: dados.anuncios.ativos, cor: CORES_STATUS.ativo },
                { label: 'Pausado', valor: dados.anuncios.pausados, cor: CORES_STATUS.pausado },
                { label: 'Vendido', valor: dados.anuncios.vendidos, cor: CORES_STATUS.vendido },
              ]} />
            </div>

            <div className="admin-chart-card">
              <h3>Categorias mais anunciadas</h3>
              {dados.top_categorias.length > 0
                ? <GraficoRanking dados={dados.top_categorias} />
                : <p className="admin-chart-vazio">Ainda não há anúncios suficientes para um ranking.</p>}
            </div>

            <div className="admin-chart-card full">
              <h3>Novos cadastros <span>últimos 30 dias · {dados.cadastros_30_dias.reduce((s, d) => s + d.total, 0)} no período</span></h3>
              <GraficoSerie dados={dados.cadastros_30_dias} />
            </div>
          </div>
        </>
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   USUÁRIOS — Suspender / Reativar / Excluir (LGPD)
   ════════════════════════════════════════════════════════════ */
const SecaoUsuarios = ({ usuarioLogado }) => {
  const [usuarios, setUsuarios] = useState(null);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [acaoModal, setAcaoModal] = useState(null); // { tipo, usuario }

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ pagina, limite: 10 });
    if (busca) params.set('busca', busca);
    apiFetch(`/api/admin/usuarios?${params}`)
      .then((d) => { setUsuarios(d.usuarios); setPaginacao(d.paginacao); })
      .catch((e) => setFeedback({ tipo: 'error', msg: e.message }));
  }, [pagina, busca]);

  useEffect(() => { carregar(); }, [carregar]);

  const executarAcao = async (motivo) => {
    const { tipo, usuario } = acaoModal;
    if (tipo === 'suspender') {
      await apiFetch(`/api/admin/usuarios/${usuario.id}/suspender`, { method: 'PUT', body: JSON.stringify({ motivo }) });
      setFeedback({ tipo: 'success', msg: `Conta de ${usuario.nome} suspensa.` });
    } else if (tipo === 'reativar') {
      await apiFetch(`/api/admin/usuarios/${usuario.id}/reativar`, { method: 'PUT' });
      setFeedback({ tipo: 'success', msg: `Conta de ${usuario.nome} reativada.` });
    } else if (tipo === 'excluir') {
      const resultado = await apiFetch(`/api/admin/usuarios/${usuario.id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) });
      setFeedback({ tipo: 'success', msg: resultado.mensagem || `Conta de ${usuario.nome} excluída (LGPD).` });
    }
    setAcaoModal(null);
    carregar();
  };

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Gerenciar <em>usuários</em></h1>
          <p>Suspenda, reative ou exclua contas conforme os Termos de Uso.</p>
        </div>
      </div>

      {feedback && <div className={`admin-alert ${feedback.tipo}`}>{feedback.msg}</div>}

      <div className="admin-filtros">
        <input type="text" placeholder="Buscar por nome ou e-mail..." value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
      </div>

      {!usuarios && <div className="admin-loading">Carregando usuários...</div>}

      {usuarios && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Bairro</th><th>Papel</th><th>Status</th><th>Cadastro</th><th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.nome} {u.sobrenome}
                    {u.termos_atualizados && (
                      <span
                        className="admin-termos-alerta"
                        title={
                          u.termos_aceitos_em
                            ? `Termos desatualizados — aceitou a versão ${u.termos_versao} em ${dataHoraBR(u.termos_aceitos_em)}`
                            : 'Nunca registrou o aceite dos Termos de Uso'
                        }
                      >
                        <IconAlert size={13} />
                      </span>
                    )}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.bairro || '—'}</td>
                  <td><span className={`badge-status ${u.papel}`}>{u.papel === 'administrador' ? 'Admin' : 'Usuário'}</span></td>
                  <td><span className={`badge-status ${u.status_conta}`}>{u.status_conta === 'ativa' ? 'Ativa' : 'Suspensa'}</span></td>
                  <td>{dataBR(u.data_cadastro)}</td>
                  <td className="col-acoes">
                    {u.papel === 'administrador' || u.id === usuarioLogado.id ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>—</span>
                    ) : u.status_conta === 'ativa' ? (
                      <button className="btn-admin-mini" onClick={() => setAcaoModal({ tipo: 'suspender', usuario: u })}>Suspender</button>
                    ) : (
                      <button className="btn-admin-mini primary" onClick={() => setAcaoModal({ tipo: 'reativar', usuario: u })}>Reativar</button>
                    )}
                    {u.papel !== 'administrador' && u.id !== usuarioLogado.id && (
                      <button className="btn-admin-mini danger" onClick={() => setAcaoModal({ tipo: 'excluir', usuario: u })}>Excluir</button>
                    )}
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr><td colSpan={7} className="admin-vazio">Nenhum usuário encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao paginacao={paginacao} pagina={pagina} setPagina={setPagina} />

      {acaoModal?.tipo === 'suspender' && (
        <ModalConfirmar
          titulo="Suspender conta"
          descricao={`${acaoModal.usuario.nome} não conseguirá mais acessar a plataforma até ser reativado(a).`}
          pedirMotivo
          textoConfirmar="Suspender"
          aoConfirmar={executarAcao}
          aoCancelar={() => setAcaoModal(null)}
        />
      )}
      {acaoModal?.tipo === 'reativar' && (
        <ModalConfirmar
          titulo="Reativar conta"
          descricao={`${acaoModal.usuario.nome} voltará a ter acesso normal à plataforma.`}
          textoConfirmar="Reativar"
          positivo
          aoConfirmar={executarAcao}
          aoCancelar={() => setAcaoModal(null)}
        />
      )}
      {acaoModal?.tipo === 'excluir' && (
        <ModalConfirmar
          titulo="Excluir conta (LGPD)"
          descricao={`Esta ação é permanente. Todos os dados de ${acaoModal.usuario.nome} serão removidos do sistema.`}
          pedirMotivo
          textoConfirmar="Excluir permanentemente"
          aoConfirmar={executarAcao}
          aoCancelar={() => setAcaoModal(null)}
        />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   ANÚNCIOS — Moderar / Remover
   ════════════════════════════════════════════════════════════ */
const SecaoAnuncios = () => {
  const [anuncios, setAnuncios] = useState(null);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [acaoModal, setAcaoModal] = useState(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ pagina, limite: 10 });
    if (busca) params.set('busca', busca);
    if (statusFiltro) params.set('status', statusFiltro);
    apiFetch(`/api/admin/anuncios?${params}`)
      .then((d) => { setAnuncios(d.anuncios); setPaginacao(d.paginacao); })
      .catch((e) => setFeedback({ tipo: 'error', msg: e.message }));
  }, [pagina, busca, statusFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const executarAcao = async (motivo) => {
    const { tipo, anuncio } = acaoModal;
    try {
      if (tipo === 'pausar' || tipo === 'reativar') {
        await apiFetch(`/api/admin/anuncios/${anuncio.id}/moderar`, {
          method: 'PUT', body: JSON.stringify({ acao: tipo, motivo }),
        });
        setFeedback({ tipo: 'success', msg: `Anúncio "${anuncio.titulo}" ${tipo === 'pausar' ? 'pausado' : 'reativado'}.` });
      } else if (tipo === 'remover') {
        await apiFetch(`/api/admin/anuncios/${anuncio.id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) });
        setFeedback({ tipo: 'success', msg: `Anúncio "${anuncio.titulo}" removido.` });
      }
      setAcaoModal(null);
      carregar();
    } catch (e) {
      throw e;
    }
  };

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Moderar <em>anúncios</em></h1>
          <p>Pause anúncios em análise ou remova definitivamente os que violam os termos.</p>
        </div>
      </div>

      {feedback && <div className={`admin-alert ${feedback.tipo}`}>{feedback.msg}</div>}

      <div className="admin-filtros">
        <input type="text" placeholder="Buscar por título..." value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
        <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1); }}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="pausado">Pausado</option>
          <option value="vendido">Vendido</option>
        </select>
      </div>

      {!anuncios && <div className="admin-loading">Carregando anúncios...</div>}

      {anuncios && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Título</th><th>Vendedor</th><th>Categoria</th><th>Preço</th><th>Status</th><th>Denúncias</th><th></th></tr>
            </thead>
            <tbody>
              {anuncios.map((a) => (
                <tr key={a.id}>
                  <td>{a.titulo}</td>
                  <td>{a.vendedor_nome}</td>
                  <td>{a.categoria_nome}</td>
                  <td>{brl(a.preco)}</td>
                  <td><span className={`badge-status ${a.status}`}>{a.status}</span></td>
                  <td>{a.total_denuncias > 0
                    ? <span className="badge-status pendente">{a.total_denuncias}</span>
                    : <span style={{ color: 'var(--ink-muted)' }}>0</span>}</td>
                  <td className="col-acoes">
                    {a.status !== 'vendido' && (
                      a.status === 'ativo' ? (
                        <button className="btn-admin-mini" onClick={() => setAcaoModal({ tipo: 'pausar', anuncio: a })}>Pausar</button>
                      ) : (
                        <button className="btn-admin-mini primary" onClick={() => setAcaoModal({ tipo: 'reativar', anuncio: a })}>Reativar</button>
                      )
                    )}
                    <button className="btn-admin-mini danger" onClick={() => setAcaoModal({ tipo: 'remover', anuncio: a })}>Remover</button>
                  </td>
                </tr>
              ))}
              {anuncios.length === 0 && (
                <tr><td colSpan={7} className="admin-vazio">Nenhum anúncio encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao paginacao={paginacao} pagina={pagina} setPagina={setPagina} />

      {acaoModal?.tipo === 'pausar' && (
        <ModalConfirmar titulo="Pausar anúncio" pedirMotivo textoConfirmar="Pausar"
          descricao={`"${acaoModal.anuncio.titulo}" sairá de circulação até ser reativado.`}
          aoConfirmar={executarAcao} aoCancelar={() => setAcaoModal(null)} />
      )}
      {acaoModal?.tipo === 'reativar' && (
        <ModalConfirmar titulo="Reativar anúncio" positivo textoConfirmar="Reativar"
          descricao={`"${acaoModal.anuncio.titulo}" voltará a aparecer no Explorar.`}
          aoConfirmar={executarAcao} aoCancelar={() => setAcaoModal(null)} />
      )}
      {acaoModal?.tipo === 'remover' && (
        <ModalConfirmar titulo="Remover anúncio" pedirMotivo textoConfirmar="Remover definitivamente"
          descricao={`"${acaoModal.anuncio.titulo}" será excluído permanentemente. Anúncios com compras registradas não podem ser removidos — use "Pausar" nesse caso.`}
          aoConfirmar={executarAcao} aoCancelar={() => setAcaoModal(null)} />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   CATEGORIAS — CRUD
   ════════════════════════════════════════════════════════════ */
const FormCategoria = ({ inicial, categorias, aoSalvar, aoCancelar }) => {
  const [form, setForm] = useState(inicial || { nome: '', slug: '', icone: '', categoria_pai: '', ordem: 0 });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    if (!form.nome.trim() || !form.slug.trim()) { setErro('Nome e slug são obrigatórios.'); return; }
    setEnviando(true);
    setErro('');
    try {
      await aoSalvar({ ...form, categoria_pai: form.categoria_pai || null });
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !enviando && aoCancelar()}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? 'Editar categoria' : 'Nova categoria'}</h2>
        {erro && <div className="admin-alert error">{erro}</div>}

        <label>Nome</label>
        <input type="text" value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })} />

        <label>Slug (identificador único)</label>
        <input type="text" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })} />

        <label>Ícone (emoji, opcional)</label>
        <input type="text" value={form.icone || ''} maxLength={4}
          onChange={(e) => setForm({ ...form, icone: e.target.value })} />

        <label>Categoria pai (opcional)</label>
        <select value={form.categoria_pai || ''} onChange={(e) => setForm({ ...form, categoria_pai: e.target.value })}>
          <option value="">Nenhuma (categoria principal)</option>
          {categorias.filter((c) => !c.categoria_pai && c.id !== inicial?.id).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <label>Ordem de exibição</label>
        <input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })} />

        <div className="admin-modal-actions">
          <button className="btn-modal-cancel" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button className="btn-modal-confirm positivo" onClick={salvar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SecaoCategorias = () => {
  const [categorias, setCategorias] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [editando, setEditando] = useState(null); // categoria ou {} pra nova
  const [excluindo, setExcluindo] = useState(null);

  const carregar = useCallback(() => {
    apiFetch('/api/admin/categorias')
      .then((d) => setCategorias(d.categorias))
      .catch((e) => setFeedback({ tipo: 'error', msg: e.message }));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    if (editando.id) {
      await apiFetch(`/api/admin/categorias/${editando.id}`, { method: 'PUT', body: JSON.stringify(form) });
      setFeedback({ tipo: 'success', msg: 'Categoria atualizada!' });
    } else {
      await apiFetch('/api/admin/categorias', { method: 'POST', body: JSON.stringify(form) });
      setFeedback({ tipo: 'success', msg: 'Categoria criada!' });
    }
    setEditando(null);
    carregar();
  };

  const excluir = async () => {
    try {
      await apiFetch(`/api/admin/categorias/${excluindo.id}`, { method: 'DELETE' });
      setFeedback({ tipo: 'success', msg: `Categoria "${excluindo.nome}" removida.` });
      setExcluindo(null);
      carregar();
    } catch (e) {
      throw e;
    }
  };

  const nomePai = (id) => categorias?.find((c) => c.id === id)?.nome || '—';

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Gerenciar <em>categorias</em></h1>
          <p>Organize categorias e subcategorias usadas pelos anúncios.</p>
        </div>
        <button className="btn-admin-add" onClick={() => setEditando({})}><IconPlus size={14} /> Nova categoria</button>
      </div>

      {feedback && <div className={`admin-alert ${feedback.tipo}`}>{feedback.msg}</div>}

      {!categorias && <div className="admin-loading">Carregando categorias...</div>}

      {categorias && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Nome</th><th>Slug</th><th>Categoria pai</th><th>Ordem</th><th>Anúncios</th><th></th></tr></thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id}>
                  <td>{c.icone ? `${c.icone} ` : ''}{c.nome}</td>
                  <td>{c.slug}</td>
                  <td>{c.categoria_pai ? nomePai(c.categoria_pai) : '—'}</td>
                  <td>{c.ordem}</td>
                  <td>{c.total_anuncios}</td>
                  <td className="col-acoes">
                    <button className="btn-admin-mini" onClick={() => setEditando(c)}>Editar</button>
                    <button className="btn-admin-mini danger" onClick={() => setExcluindo(c)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormCategoria inicial={editando.id ? editando : null} categorias={categorias || []}
          aoSalvar={salvar} aoCancelar={() => setEditando(null)} />
      )}

      {excluindo && (
        <ModalConfirmar
          titulo="Excluir categoria" textoConfirmar="Excluir"
          descricao={`Tem certeza que deseja remover "${excluindo.nome}"? Categorias com anúncios ou subcategorias vinculadas não podem ser removidas.`}
          aoConfirmar={excluir} aoCancelar={() => setExcluindo(null)}
        />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   DENÚNCIAS — fila de moderação
   ════════════════════════════════════════════════════════════ */
const MOTIVO_LABEL = {
  conteudo_inadequado: 'Conteúdo inadequado',
  fraude: 'Fraude',
  violacao_termos: 'Violação dos termos',
  outro: 'Outro',
};

const FormResolverDenuncia = ({ denuncia, aoSalvar, aoCancelar }) => {
  const [status, setStatus] = useState(denuncia.status === 'pendente' ? 'em_analise' : denuncia.status);
  const [resolucao, setResolucao] = useState(denuncia.resolucao || '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await aoSalvar(status, resolucao);
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !enviando && aoCancelar()}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Denúncia #{denuncia.id}</h2>
        <p>
          <strong>{denuncia.denunciante_nome}</strong> denunciou {denuncia.anuncio_titulo ? `o anúncio "${denuncia.anuncio_titulo}"` : `o usuário ${denuncia.denunciado_nome}`}
          {' '}por <strong>{MOTIVO_LABEL[denuncia.motivo]}</strong>.
        </p>
        {denuncia.descricao && <p style={{ fontStyle: 'italic' }}>"{denuncia.descricao}"</p>}
        {erro && <div className="admin-alert error">{erro}</div>}

        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pendente">Pendente</option>
          <option value="em_analise">Em análise</option>
          <option value="resolvida">Resolvida</option>
          <option value="arquivada">Arquivada</option>
        </select>

        <label>Resolução / observações</label>
        <textarea rows={3} value={resolucao} onChange={(e) => setResolucao(e.target.value)} maxLength={1000} />

        <div className="admin-modal-actions">
          <button className="btn-modal-cancel" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button className="btn-modal-confirm positivo" onClick={salvar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SecaoDenuncias = () => {
  const [denuncias, setDenuncias] = useState(null);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [statusFiltro, setStatusFiltro] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [selecionada, setSelecionada] = useState(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ pagina, limite: 10 });
    if (statusFiltro) params.set('status', statusFiltro);
    apiFetch(`/api/admin/denuncias?${params}`)
      .then((d) => { setDenuncias(d.denuncias); setPaginacao(d.paginacao); })
      .catch((e) => setFeedback({ tipo: 'error', msg: e.message }));
  }, [pagina, statusFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (status, resolucao) => {
    await apiFetch(`/api/admin/denuncias/${selecionada.id}`, {
      method: 'PUT', body: JSON.stringify({ status, resolucao }),
    });
    setFeedback({ tipo: 'success', msg: `Denúncia #${selecionada.id} atualizada.` });
    setSelecionada(null);
    carregar();
  };

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Fila de <em>denúncias</em></h1>
          <p>Analise denúncias de anúncios ou perfis e registre a resolução.</p>
        </div>
      </div>

      {feedback && <div className={`admin-alert ${feedback.tipo}`}>{feedback.msg}</div>}

      <div className="admin-filtros">
        <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1); }}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="em_analise">Em análise</option>
          <option value="resolvida">Resolvida</option>
          <option value="arquivada">Arquivada</option>
        </select>
      </div>

      {!denuncias && <div className="admin-loading">Carregando denúncias...</div>}

      {denuncias && denuncias.length === 0 && (
        <div className="admin-vazio"><span className="emoji">🚩</span>Nenhuma denúncia encontrada.</div>
      )}

      {denuncias && denuncias.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Alvo</th><th>Motivo</th><th>Denunciante</th><th>Status</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {denuncias.map((d) => (
                <tr key={d.id}>
                  <td>{d.anuncio_titulo || `Perfil: ${d.denunciado_nome}`}</td>
                  <td>{MOTIVO_LABEL[d.motivo] || d.motivo}</td>
                  <td>{d.denunciante_nome}</td>
                  <td><span className={`badge-status ${d.status}`}>{d.status.replace('_', ' ')}</span></td>
                  <td>{dataBR(d.criada_em)}</td>
                  <td className="col-acoes">
                    <button className="btn-admin-mini" onClick={() => setSelecionada(d)}>Analisar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao paginacao={paginacao} pagina={pagina} setPagina={setPagina} />

      {selecionada && (
        <FormResolverDenuncia denuncia={selecionada} aoSalvar={salvar} aoCancelar={() => setSelecionada(null)} />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   CENTRAL DE AJUDA — fila de suporte dos usuários
   ════════════════════════════════════════════════════════════ */
const ASSUNTO_LABEL = {
  duvida_conta: 'Dúvidas sobre a conta',
  anuncio: 'Problemas com anúncio',
  pagamento: 'Pagamentos',
  denuncia_seguranca: 'Segurança / denúncia',
  outro: 'Outro',
};

const FormResponderSuporte = ({ solicitacao, aoSalvar, aoCancelar }) => {
  const [status, setStatus] = useState(solicitacao.status === 'aberto' ? 'em_atendimento' : solicitacao.status);
  const [resposta, setResposta] = useState(solicitacao.resposta || '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await aoSalvar(status, resposta);
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !enviando && aoCancelar()}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Solicitação #{solicitacao.id}</h2>
        <p>
          <strong>{solicitacao.usuario_nome}</strong> ({solicitacao.usuario_email}) sobre{' '}
          <strong>{ASSUNTO_LABEL[solicitacao.assunto] || solicitacao.assunto}</strong>.
        </p>
        <p style={{ fontStyle: 'italic' }}>"{solicitacao.mensagem}"</p>
        {erro && <div className="admin-alert error">{erro}</div>}

        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="aberto">Aberto</option>
          <option value="em_atendimento">Em atendimento</option>
          <option value="respondido">Respondido</option>
          <option value="encerrado">Encerrado</option>
        </select>

        <label>Resposta ao usuário</label>
        <textarea rows={4} value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={2000} />

        <div className="admin-modal-actions">
          <button className="btn-modal-cancel" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button className="btn-modal-confirm positivo" onClick={salvar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SecaoSuporte = () => {
  const [solicitacoes, setSolicitacoes] = useState(null);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [statusFiltro, setStatusFiltro] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [selecionada, setSelecionada] = useState(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ pagina, limite: 10 });
    if (statusFiltro) params.set('status', statusFiltro);
    apiFetch(`/api/admin/suporte?${params}`)
      .then((d) => { setSolicitacoes(d.solicitacoes); setPaginacao(d.paginacao); })
      .catch((e) => setFeedback({ tipo: 'error', msg: e.message }));
  }, [pagina, statusFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (status, resposta) => {
    await apiFetch(`/api/admin/suporte/${selecionada.id}`, {
      method: 'PUT', body: JSON.stringify({ status, resposta }),
    });
    setFeedback({ tipo: 'success', msg: `Solicitação #${selecionada.id} atualizada.` });
    setSelecionada(null);
    carregar();
  };

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Central de <em>ajuda</em></h1>
          <p>Responda as mensagens de suporte enviadas pelos usuários da plataforma.</p>
        </div>
      </div>

      {feedback && <div className={`admin-alert ${feedback.tipo}`}>{feedback.msg}</div>}

      <div className="admin-filtros">
        <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1); }}>
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option>
          <option value="em_atendimento">Em atendimento</option>
          <option value="respondido">Respondido</option>
          <option value="encerrado">Encerrado</option>
        </select>
      </div>

      {!solicitacoes && <div className="admin-loading">Carregando solicitações...</div>}

      {solicitacoes && solicitacoes.length === 0 && (
        <div className="admin-vazio"><span className="emoji">💬</span>Nenhuma solicitação de suporte encontrada.</div>
      )}

      {solicitacoes && solicitacoes.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Usuário</th><th>Assunto</th><th>Mensagem</th><th>Status</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {solicitacoes.map((s) => (
                <tr key={s.id}>
                  <td>{s.usuario_nome}</td>
                  <td>{ASSUNTO_LABEL[s.assunto] || s.assunto}</td>
                  <td className="col-desc">{s.mensagem}</td>
                  <td><span className={`badge-status ${s.status}`}>{s.status.replace('_', ' ')}</span></td>
                  <td>{dataBR(s.criada_em)}</td>
                  <td className="col-acoes">
                    <button className="btn-admin-mini" onClick={() => setSelecionada(s)}>Responder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao paginacao={paginacao} pagina={pagina} setPagina={setPagina} />

      {selecionada && (
        <FormResponderSuporte solicitacao={selecionada} aoSalvar={salvar} aoCancelar={() => setSelecionada(null)} />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════
   LOGS DE AUDITORIA
   ════════════════════════════════════════════════════════════ */
const ACAO_LABEL = {
  suspender_usuario: 'Suspendeu usuário',
  reativar_usuario: 'Reativou usuário',
  excluir_usuario: 'Excluiu usuário',
  moderar_anuncio: 'Moderou anúncio',
  remover_anuncio: 'Removeu anúncio',
  criar_categoria: 'Criou categoria',
  editar_categoria: 'Editou categoria',
  excluir_categoria: 'Excluiu categoria',
  resolver_denuncia: 'Atualizou denúncia',
  responder_suporte: 'Respondeu solicitação de suporte',
};

const SecaoLogs = () => {
  const [logs, setLogs] = useState(null);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ pagina, limite: 20 });
    apiFetch(`/api/admin/logs?${params}`)
      .then((d) => { setLogs(d.logs); setPaginacao(d.paginacao); })
      .catch((e) => setErro(e.message));
  }, [pagina]);

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h1>Logs de <em>auditoria</em></h1>
          <p>Histórico de todas as ações realizadas por administradores.</p>
        </div>
      </div>

      {erro && <div className="admin-alert error">{erro}</div>}
      {!logs && !erro && <div className="admin-loading">Carregando logs...</div>}

      {logs && logs.length === 0 && (
        <div className="admin-vazio"><span className="emoji">📋</span>Nenhuma ação registrada ainda.</div>
      )}

      {logs && logs.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Ação</th><th>Alvo</th><th>Administrador</th><th>Detalhes</th><th>Data</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{ACAO_LABEL[l.acao] || l.acao}</td>
                  <td>{l.alvo_tipo} #{l.alvo_id}</td>
                  <td>{l.admin_nome || 'conta removida'}</td>
                  <td className="col-desc">
                    {l.detalhes?.motivo && <>Motivo: {l.detalhes.motivo}<br/></>}
                    {l.detalhes?.nome && <>{l.detalhes.nome} </>}
                    {l.detalhes?.email && <>({l.detalhes.email})</>}
                    {l.detalhes?.status && <>Novo status: {l.detalhes.status}</>}
                  </td>
                  <td>{dataHoraBR(l.criada_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao paginacao={paginacao} pagina={pagina} setPagina={setPagina} />
    </>
  );
};

export default Admin;
