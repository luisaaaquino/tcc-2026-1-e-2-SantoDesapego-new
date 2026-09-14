import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import './Anuncio.css';
import NotificacoesSino from '../componentes/NotificacoesSino';

const API_URL = 'http://localhost:8080';

const ESTADO_LABEL = {
  'novo':        { emoji: '✨', name: 'Novo / Na caixa' },
  'seminovo':    { emoji: '👌', name: 'Seminovo' },
  'usado':       { emoji: '👍', name: 'Usado' },
  'para-reparo': { emoji: '🔧', name: 'Para reparo' },
};

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MOTIVOS_DENUNCIA = [
  { valor: 'conteudo_inadequado', label: 'Conteúdo inadequado' },
  { valor: 'fraude', label: 'Suspeita de fraude' },
  { valor: 'violacao_termos', label: 'Violação dos Termos de Uso' },
  { valor: 'outro', label: 'Outro motivo' },
];

/* ── Modal de denúncia [RF19] ─────────────────────────────── */
const ModalDenunciar = ({ anuncio, aoFechar }) => {
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState('conteudo_inadequado');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    setEnviando(true);
    setErro('');
    try {
      const resposta = await fetch(`${API_URL}/api/denuncias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ anuncio_id: anuncio.id, motivo, descricao: descricao.trim() || null }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) { setErro(dados.erro || 'Erro ao enviar denúncia.'); return; }
      setEnviado(true);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="denuncia-modal-overlay" onClick={() => !enviando && aoFechar()}>
      <div className="denuncia-modal" onClick={(e) => e.stopPropagation()}>
        {enviado ? (
          <div className="denuncia-sucesso">
            <span className="emoji">✅</span>
            <h2>Denúncia enviada</h2>
            <p>Nossa equipe vai analisar em breve. Obrigado por ajudar a manter a comunidade segura.</p>
            <div className="denuncia-modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn-anuncio-comprar" onClick={aoFechar}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <h2>Denunciar anúncio</h2>
            <p>Conte pra gente o que há de errado com "{anuncio.titulo}".</p>
            {erro && <p className="anuncio-erro-pagamento">{erro}</p>}

            <label>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_DENUNCIA.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
            </select>

            <label>Descreva o problema (opcional)</label>
            <textarea rows={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />

            <div className="denuncia-modal-actions">
              <button type="button" className="btn-anuncio-proposta" onClick={aoFechar} disabled={enviando}>Cancelar</button>
              <button type="button" className="btn-anuncio-comprar" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar denúncia'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Anuncio = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [anuncio, setAnuncio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [foto, setFoto] = useState(0);

  useEffect(() => {
    setCarregando(true);
    setErro('');

    fetch(`${API_URL}/api/anuncios/${id}`)
      .then(async (res) => {
        const texto = await res.text();

        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? `O servidor respondeu 404 em /api/anuncios/${id} — essa rota provavelmente não existe no back-end ainda.`
              : `O servidor respondeu ${res.status}.`
          );
        }

        try {
          return JSON.parse(texto);
        } catch {
          throw new Error('O servidor respondeu, mas não em JSON. Confira a rota /api/anuncios/:id.');
        }
      })
      .then((dados) => {
        const item = dados.anuncio || (dados.id ? dados : null);
        if (item) setAnuncio(item);
        else setErro(dados.erro || 'Anúncio não encontrado.');
      })
      .catch((e) => {
        console.error('[Anuncio]', e);
        setErro(
          e.message === 'Failed to fetch'
            ? 'Não consegui falar com o servidor. Ele está rodando em localhost:8080?'
            : e.message
        );
      })
      .finally(() => setCarregando(false));
  }, [id]);

  const [abrindoChat, setAbrindoChat] = useState(false);
  const [erroAcao, setErroAcao] = useState('');
  const [denunciando, setDenunciando] = useState(false);

  const comprar = () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }
    navigate(`/checkout/${anuncio.id}`);
  };

  // Abre (ou reaproveita) a conversa com o anunciante e vai para o chat
  const conversar = async () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    setAbrindoChat(true);
    setErroAcao('');

    try {
      const resposta = await fetch(`${API_URL}/api/conversas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anuncio_id: anuncio.id }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErroAcao(dados.erro || 'Não foi possível abrir a conversa.');
        setAbrindoChat(false);
        return;
      }

      navigate(`/mensagens?conversa=${dados.conversa.id}`);
    } catch (e) {
      console.error('[chat]', e);
      setErroAcao('Erro ao conectar com o servidor.');
      setAbrindoChat(false);
    }
  };

  const Header = () => (
    <header className="site-header">
      <div className="nav-top">
        <Link to="/" className="logo">
          <span className="logo-mark">SD</span>
          Santo <em>Desapego</em>
        </Link>
        <nav className="nav-actions">
          <NotificacoesSino />
          <Link to="/explorar" className="nav-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Voltar para o Explorar
          </Link>
        </nav>
      </div>
    </header>
  );

  if (carregando) {
    return (
      <div className="anuncio-wrapper">
        <Header />
        <div className="anuncio-estado">Carregando anúncio...</div>
      </div>
    );
  }

  if (erro || !anuncio) {
    return (
      <div className="anuncio-wrapper">
        <Header />
        <div className="anuncio-estado">
          <h2>Este anúncio não está disponível</h2>
          <p>{erro || 'Ele pode ter sido vendido ou removido pelo vendedor.'}</p>
          <Link to="/explorar" className="btn-anuncio-comprar">Ver outros desapegos →</Link>
        </div>
      </div>
    );
  }

  // Normaliza campos que podem variar de nome no retorno da API
  // as imagens podem vir como string base64 ou como objeto { imagem } / { url }
  const imagens = (anuncio.imagens?.length
    ? anuncio.imagens
    : [anuncio.imagem_principal || null]
  ).map((img) => (typeof img === 'string' || !img ? img : img.imagem || img.url || null));
  const estado   = ESTADO_LABEL[anuncio.estado_conservacao] || { emoji: '📦', name: anuncio.estado_conservacao || '—' };
  const vendedor = anuncio.usuario?.nome || anuncio.vendedor?.nome || anuncio.usuario_nome || 'Vendedor';
  const categoria = anuncio.categoria?.nome || anuncio.categoria_nome || '';

  return (
    <div className="anuncio-wrapper">
      <Header />

      <div className="anuncio-container">
        <nav className="anuncio-trilha" aria-label="Navegação">
          <Link to="/explorar">Explorar</Link>
          {categoria && <><span aria-hidden="true">/</span><span>{categoria}</span></>}
        </nav>

        <div className="anuncio-grid">

          {/* ── Galeria ─────────────────────────────── */}
          <section className="anuncio-galeria">
            <div className="galeria-principal">
              {imagens[foto]
                ? <img src={imagens[foto]} alt={anuncio.titulo} />
                : <div className="galeria-vazia">Sem foto</div>}
              {imagens.length > 1 && (
                <span className="galeria-contador">{foto + 1}/{imagens.length}</span>
              )}
            </div>

            {imagens.length > 1 && (
              <div className="galeria-miniaturas">
                {imagens.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`galeria-mini${i === foto ? ' ativa' : ''}`}
                    onClick={() => setFoto(i)}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    <img src={img} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Painel de compra ────────────────────── */}
          <aside className="anuncio-painel">
            {categoria && <p className="anuncio-categoria">{categoria}</p>}
            <h1 className="anuncio-titulo">{anuncio.titulo}</h1>
            <p className="anuncio-preco">{brl(anuncio.preco)}</p>

            <div className="anuncio-tags">
              <span className="anuncio-tag">{estado.emoji} {estado.name}</span>
              {anuncio.aceita_troca && <span className="anuncio-tag troca">🔄 Aceita troca</span>}
            </div>

            <p className="anuncio-local">
              📍 {anuncio.bairro}
              {anuncio.cep && <span>CEP {anuncio.cep}</span>}
            </p>

            <div className="anuncio-acoes">
              <button type="button" className="btn-anuncio-comprar" onClick={comprar}>
                Comprar agora
              </button>
              <button
                type="button"
                className="btn-anuncio-proposta"
                onClick={conversar}
                disabled={abrindoChat}
              >
                {abrindoChat ? 'Abrindo conversa...' : '💬 Conversar com o anunciante'}
              </button>
            </div>

            {erroAcao && <p className="anuncio-erro-pagamento">{erroAcao}</p>}

            <p className="anuncio-nota">
              Pagamento com cartão em até 12x, processado pelo Mercado Pago.
              Combine a retirada pelo chat e nunca pague fora da plataforma.
            </p>

            <div className="anuncio-vendedor">
              <span className="vendedor-avatar">{vendedor[0]?.toUpperCase()}</span>
              <div>
                <strong>{vendedor}</strong>
                <p>Anunciante em {anuncio.bairro}</p>
              </div>
            </div>

            <button type="button" className="anuncio-denunciar" onClick={() => setDenunciando(true)}>
              🚩 Denunciar este anúncio
            </button>
          </aside>
        </div>

        {/* ── Descrição ─────────────────────────────── */}
        <section className="anuncio-descricao">
          <h2>Sobre a peça</h2>
          <p>{anuncio.descricao}</p>

          <dl className="anuncio-ficha">
            <div><dt>Estado</dt><dd>{estado.name}</dd></div>
            <div><dt>Categoria</dt><dd>{categoria || '—'}</dd></div>
            <div><dt>Troca</dt><dd>{anuncio.aceita_troca ? 'Aceita' : 'Não aceita'}</dd></div>
            <div><dt>Retirada</dt><dd>{anuncio.bairro}</dd></div>
          </dl>
        </section>
      </div>

      {/* ── Barra fixa no celular ───────────────────── */}
      <div className="anuncio-barra">
        <div>
          <span>{anuncio.titulo}</span>
          <strong>{brl(anuncio.preco)}</strong>
        </div>
        <button type="button" className="btn-anuncio-comprar" onClick={comprar}>
          Comprar agora
        </button>
      </div>

      {denunciando && <ModalDenunciar anuncio={anuncio} aoFechar={() => setDenunciando(false)} />}
    </div>
  );
};

export default Anuncio;