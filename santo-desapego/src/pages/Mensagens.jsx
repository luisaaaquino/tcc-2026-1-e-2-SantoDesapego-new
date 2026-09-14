import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import './Mensagens.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

const API_URL = 'http://localhost:8080';

// De quanto em quanto tempo a tela procura mensagens novas
const INTERVALO_MENSAGENS = 4000;   // 4s — conversa aberta
const INTERVALO_LISTA     = 15000;  // 15s — lista da esquerda

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const dia = (iso) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (d.toDateString() === hoje.toDateString())  return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const Mensagens = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversaId = searchParams.get('conversa');

  const [usuario, setUsuario]       = useState(null);
  const [conversas, setConversas]   = useState([]);
  const [mensagens, setMensagens]   = useState([]);
  const [conversaAtual, setConversaAtual] = useState(null);
  const [texto, setTexto]           = useState('');
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoChat, setCarregandoChat]   = useState(false);
  const [enviando, setEnviando]     = useState(false);
  const [erro, setErro]             = useState('');

  const fimDaLista = useRef(null);
  const token = localStorage.getItem('sd_token');

  // ── Usuário logado ────────────────────────────────────────
  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    const salvo = localStorage.getItem('sd_usuario');
    if (salvo) {
      try { setUsuario(JSON.parse(salvo)); } catch { /* ignora */ }
    }
  }, [token, navigate]);

  // ── Lista de conversas (com atualização periódica) ────────
  const buscarConversas = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (dados.conversas) setConversas(dados.conversas);
    } catch (e) {
      console.error('[conversas]', e);
    } finally {
      setCarregandoLista(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    buscarConversas();
    const timer = setInterval(buscarConversas, INTERVALO_LISTA);
    return () => clearInterval(timer);
  }, [token, buscarConversas]);

  // ── Abre uma conversa ─────────────────────────────────────
  useEffect(() => {
    if (!conversaId || !token) {
      setMensagens([]);
      setConversaAtual(null);
      return;
    }

    setCarregandoChat(true);
    setErro('');

    fetch(`${API_URL}/api/conversas/${conversaId}/mensagens`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((dados) => {
        if (dados.erro) { setErro(dados.erro); return; }
        setMensagens(dados.mensagens || []);
        setConversaAtual(dados.conversa || null);
      })
      .catch(() => setErro('Erro ao carregar a conversa.'))
      .finally(() => setCarregandoChat(false));
  }, [conversaId, token]);

  // ── Busca só o que chegou depois da última mensagem ───────
  useEffect(() => {
    if (!conversaId || !token || mensagens.length === 0) return;

    const timer = setInterval(async () => {
      const ultimoId = mensagens[mensagens.length - 1]?.id;
      if (!ultimoId) return;

      try {
        const res = await fetch(
          `${API_URL}/api/conversas/${conversaId}/mensagens?depois_de=${ultimoId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const dados = await res.json();

        if (dados.mensagens?.length) {
          setMensagens((antigas) => [...antigas, ...dados.mensagens]);
          buscarConversas();
        }
      } catch (e) {
        console.error('[novas mensagens]', e);
      }
    }, INTERVALO_MENSAGENS);

    return () => clearInterval(timer);
  }, [conversaId, token, mensagens, buscarConversas]);

  // ── Rola para a última mensagem ───────────────────────────
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // ── Enviar ────────────────────────────────────────────────
  const enviar = async (e) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    setEnviando(true);
    setErro('');

    try {
      const res = await fetch(`${API_URL}/api/conversas/${conversaId}/mensagens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conteudo }),
      });

      const dados = await res.json();

      if (!res.ok) { setErro(dados.erro || 'Não foi possível enviar.'); return; }

      setMensagens((antigas) => [...antigas, dados.mensagem]);
      setTexto('');
      buscarConversas();
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const meuId = usuario?.id;

  return (
    <div className="msg-wrapper">

      <SiteHeader>
        <NotificacoesSino />
        <NavBackButton to="/explorar">Voltar para o Explorar</NavBackButton>
      </SiteHeader>

      <div className="msg-container">

        {/* ── Lista de conversas ── */}
        <aside className={`msg-lista ${conversaId ? 'msg-lista--oculta-mobile' : ''}`}>
          <div className="msg-lista-topo">
            <h1>Mensagens</h1>
            <p>{conversas.length} {conversas.length === 1 ? 'conversa' : 'conversas'}</p>
          </div>

          {carregandoLista ? (
            <div className="msg-vazio">Carregando...</div>
          ) : conversas.length === 0 ? (
            <div className="msg-vazio">
              <p><strong>Nenhuma conversa ainda</strong></p>
              <p>Quando você falar com um anunciante, a conversa aparece aqui.</p>
              <Link to="/explorar" className="msg-btn-explorar">Explorar desapegos</Link>
            </div>
          ) : (
            <ul className="msg-conversas">
              {conversas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`msg-conversa${String(c.id) === conversaId ? ' ativa' : ''}`}
                    onClick={() => setSearchParams({ conversa: c.id })}
                  >
                    <span className="msg-conversa-foto">
                      {c.anuncio_imagem
                        ? <img src={c.anuncio_imagem} alt="" />
                        : <span className="msg-sem-foto">📦</span>}
                    </span>

                    <span className="msg-conversa-texto">
                      <span className="msg-conversa-linha1">
                        <strong>{c.outro_nome}</strong>
                        <em>{dia(c.ultima_mensagem_em)}</em>
                      </span>
                      <span className="msg-conversa-anuncio">{c.anuncio_titulo}</span>
                      <span className="msg-conversa-previa">
                        {c.ultima_mensagem
                          ? (c.ultima_remetente_id === meuId ? 'Você: ' : '') + c.ultima_mensagem
                          : 'Conversa aberta — diga oi!'}
                      </span>
                    </span>

                    {c.nao_lidas > 0 && (
                      <span className="msg-badge">{c.nao_lidas}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Conversa aberta ── */}
        <section className={`msg-chat ${!conversaId ? 'msg-chat--oculto-mobile' : ''}`}>
          {!conversaId ? (
            <div className="msg-chat-vazio">
              <span>💬</span>
              <p>Escolha uma conversa à esquerda</p>
            </div>
          ) : (
            <>
              {conversaAtual && (
                <div className="msg-chat-topo">
                  <button
                    type="button"
                    className="msg-voltar"
                    onClick={() => setSearchParams({})}
                    aria-label="Voltar para a lista"
                  >
                    ←
                  </button>

                  <Link to={`/anuncio/${conversaAtual.anuncio_id}`} className="msg-chat-anuncio">
                    {conversaAtual.anuncio_imagem
                      ? <img src={conversaAtual.anuncio_imagem} alt="" />
                      : <span className="msg-sem-foto">📦</span>}
                    <span>
                      <strong>{conversaAtual.anuncio_titulo}</strong>
                      <em>{brl(conversaAtual.anuncio_preco)}</em>
                    </span>
                  </Link>

                  <span className="msg-chat-papel">
                    {conversaAtual.meu_papel === 'vendedor' ? 'Você é o anunciante' : 'Você é o comprador'}
                  </span>
                </div>
              )}

              <div className="msg-balloes">
                {carregandoChat ? (
                  <div className="msg-vazio">Carregando conversa...</div>
                ) : mensagens.length === 0 ? (
                  <div className="msg-vazio">
                    <p><strong>Comece a conversa</strong></p>
                    <p>Pergunte sobre estado da peça, medidas ou combine a retirada.</p>
                  </div>
                ) : (
                  mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`msg-balao ${m.remetente_id === meuId ? 'minha' : 'dele'}`}
                    >
                      <p>{m.conteudo}</p>
                      <span>{hora(m.enviada_em)}</span>
                    </div>
                  ))
                )}
                <div ref={fimDaLista} />
              </div>

              {erro && <p className="msg-erro">{erro}</p>}

              <form className="msg-form" onSubmit={enviar}>
                <input
                  type="text"
                  placeholder="Escreva sua mensagem..."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={1000}
                />
                <button type="submit" disabled={enviando || !texto.trim()}>
                  {enviando ? '...' : 'Enviar'}
                </button>
              </form>

              <p className="msg-aviso">
                Combine sempre a retirada em local público. Não compartilhe senhas nem dados bancários.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default Mensagens;