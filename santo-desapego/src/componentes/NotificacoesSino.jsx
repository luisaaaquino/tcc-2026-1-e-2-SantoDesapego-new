import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './NotificacoesSino.css';

import { API_URL } from '../config';
const INTERVALO = 20000; // 20s

const ICONE_TIPO = {
  nova_mensagem: '💬',
  intencao_compra: '🛒',
  pagamento_confirmado: '🎉',
  avaliacao_pendente: '⭐',
  anuncio_expirando: '⏳',
};

const tempoRelativo = (dataStr) => {
  const diffMs = Date.now() - new Date(dataStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
};

const NotificacoesSino = () => {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [logado, setLogado] = useState(!!localStorage.getItem('sd_token'));
  const wrapRef = useRef(null);

  const carregar = useCallback(() => {
    const token = localStorage.getItem('sd_token');
    if (!token) { setLogado(false); return; }

    fetch(`${API_URL}/api/notificacoes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { setLogado(false); return null; }
        return r.json();
      })
      .then((dados) => {
        if (!dados) return;
        setNotificacoes(dados.notificacoes || []);
        setTotalNaoLidas(dados.total_nao_lidas || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!logado) return;
    carregar();
    const timer = setInterval(carregar, INTERVALO);
    return () => clearInterval(timer);
  }, [logado, carregar]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const aoClicarFora = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  if (!logado) return null;

  const marcarTodasLidas = async (e) => {
    e.stopPropagation();
    const token = localStorage.getItem('sd_token');
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    setTotalNaoLidas(0);
    try {
      await fetch(`${API_URL}/api/notificacoes/lidas-todas`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignora — próxima sincronização corrige */ }
  };

  const clicarNotificacao = async (n) => {
    setAberto(false);
    if (!n.lida) {
      const token = localStorage.getItem('sd_token');
      setNotificacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      setTotalNaoLidas((t) => Math.max(0, t - 1));
      fetch(`${API_URL}/api/notificacoes/${n.id}/lida`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="sino-wrap" ref={wrapRef}>
      <button
        type="button"
        className="sino-btn"
        onClick={() => setAberto((s) => !s)}
        aria-label={`Notificações${totalNaoLidas > 0 ? ` (${totalNaoLidas} não lidas)` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {totalNaoLidas > 0 && <span className="sino-badge">{totalNaoLidas > 9 ? '9+' : totalNaoLidas}</span>}
      </button>

      {aberto && (
        <div className="sino-painel">
          <div className="sino-painel-head">
            <strong>Notificações</strong>
            {totalNaoLidas > 0 && (
              <button type="button" className="sino-marcar-lidas" onClick={marcarTodasLidas}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="sino-lista">
            {notificacoes.length === 0 && (
              <div className="sino-vazio">Você não tem notificações ainda.</div>
            )}
            {notificacoes.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`sino-item${n.lida ? '' : ' nao-lida'}`}
                onClick={() => clicarNotificacao(n)}
              >
                <span className="sino-item-icone">{ICONE_TIPO[n.tipo] || '🔔'}</span>
                <span className="sino-item-corpo">
                  <span className="sino-item-titulo">{n.titulo}</span>
                  <span className="sino-item-msg">{n.mensagem}</span>
                  <span className="sino-item-tempo">{tempoRelativo(n.criada_em)}</span>
                </span>
                {!n.lida && <span className="sino-item-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificacoesSino;
