import { useState, useRef, useEffect } from 'react';
import './AgenteAnuncioChat.css';
import { API_URL } from '../config';
import { redimensionarImagem } from '../utils/imagem';

/* ── Chat do Agente de Anúncio (IA) ──────────────────────────────
   O vendedor descreve o produto conversando; o agente pergunta o
   que falta, consulta preço de comparáveis e monta o rascunho.
   Estado da conversa fica autoritativo no backend — aqui só se
   guarda o conversa_id e o histórico pra exibir. ────────────────── */
const AgenteAnuncioChat = ({ onPublicado }) => {
  const [conversa, setConversa] = useState([
    { papel: 'agente', texto: 'Oi! Me conta o que você quer anunciar — pode escrever livremente, eu vou perguntando o que faltar.' },
  ]);
  const [conversaId, setConversaId] = useState(null);
  const [imagens, setImagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [statusFinal, setStatusFinal] = useState(null);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);
  const fileRef = useRef(null);
  const token = localStorage.getItem('sd_token');

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversa]);

  const enviar = async (e) => {
    e.preventDefault();
    const msg = texto.trim();
    if (!msg || enviando) return;

    setConversa((c) => [...c, { papel: 'vendedor', texto: msg }]);
    setTexto('');
    setEnviando(true);
    setErro('');

    try {
      const resp = await fetch(`${API_URL}/api/ia/agente-anuncio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversa_id: conversaId, mensagem: msg, imagens }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        setErro(dados.erro || 'Erro ao falar com o assistente.');
        return;
      }

      setConversaId(dados.conversa_id);
      setConversa(dados.conversa);

      if (dados.status === 'publicado') {
        onPublicado(dados.anuncio);
      } else if (dados.status !== 'aguardando_vendedor') {
        setStatusFinal(dados.status);
      }
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (imagens.length >= 6) break;
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) continue;
      const base64 = await redimensionarImagem(file);
      setImagens((prev) => [...prev, base64]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removerImagem = (i) => {
    setImagens((prev) => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="ia-chat-wrap">
      <div className="ia-chat-balloes">
        {conversa.map((m, i) => (
          <div key={i} className={`ia-chat-balao ${m.papel === 'vendedor' ? 'minha' : 'dele'}`}>
            <p>{m.texto}</p>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <div className="ia-chat-imagens">
        {imagens.map((img, i) => (
          <div key={i} className="ia-chat-imagem-item">
            <img src={img} alt={`Foto ${i + 1}`} />
            <button type="button" onClick={() => removerImagem(i)} aria-label="Remover foto">×</button>
          </div>
        ))}
        {imagens.length < 6 && (
          <label className="ia-chat-imagem-add">
            📷
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} />
          </label>
        )}
      </div>

      {erro && <p className="ia-chat-erro">⚠️ {erro}</p>}

      {statusFinal === 'indicio_registrado' && (
        <div className="ia-chat-aviso">
          Encontramos um possível problema não declarado no anúncio. Ele foi encaminhado
          para revisão da nossa equipe e não foi publicado automaticamente. Você será
          avisado assim que for avaliado.
        </div>
      )}

      {(statusFinal === 'erro_orcamento' || statusFinal === 'abortado_laco') && (
        <div className="ia-chat-aviso">
          Não consegui concluir o anúncio automaticamente dessa vez. Prefira preencher
          manualmente a partir daqui.
        </div>
      )}

      {!statusFinal && (
        <form className="ia-chat-form" onSubmit={enviar}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite sua resposta..."
            maxLength={1000}
            disabled={enviando}
          />
          <button type="submit" disabled={enviando || !texto.trim()}>
            {enviando ? '...' : 'Enviar'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AgenteAnuncioChat;
