import { useState, useRef, useEffect } from 'react';
import './AgenteAnuncioChat.css';
import { API_URL } from '../config';
import { redimensionarImagem } from '../utils/imagem';

const formatPreco = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADOS = [
  { valor: 'novo', rotulo: 'Novo' },
  { valor: 'seminovo', rotulo: 'Seminovo' },
  { valor: 'usado', rotulo: 'Usado' },
  { valor: 'para-reparo', rotulo: 'Para reparo' },
];

// Desfechos em que a conversa termina sem publicar
const AVISOS_FINAIS = {
  indicio_registrado: 'Encontramos um possível problema não declarado no anúncio. Ele foi encaminhado '
    + 'para revisão da nossa equipe e não foi publicado automaticamente.',
  orcamento: 'Não consegui concluir o anúncio automaticamente dessa vez. Prefira preencher manualmente a partir daqui.',
  laco: 'Não consegui concluir o anúncio automaticamente dessa vez. Prefira preencher manualmente a partir daqui.',
  avaliador_reprovou: 'O rascunho não passou na checagem automática. Prefira preencher manualmente a partir daqui.',
  rejeitado: 'Tudo bem, nada foi publicado. Se mudar de ideia, recarregue a página para começar de novo.',
};

/* ── Chat do Agente de Anúncio (IA) ──────────────────────────────
   O vendedor descreve o produto conversando; o agente pergunta o
   que falta, consulta preço de comparáveis e monta o rascunho. O
   agente não publica: com o rascunho aprovado pelo avaliador, aparece
   o cartão de confirmação e quem decide é o vendedor (publicar,
   editar campos ou desistir). Estado da conversa fica autoritativo
   no backend — aqui só se guarda o conversa_id e o que é exibido. ── */
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
  const [observacaoPreco, setObservacaoPreco] = useState(null);
  const [pendencia, setPendencia] = useState(null);
  const [campos, setCampos] = useState(null);
  const fimRef = useRef(null);
  const fileRef = useRef(null);
  const token = localStorage.getItem('sd_token');

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversa, pendencia]);

  // Aplica a resposta do backend (mesmo formato nas duas rotas)
  const aplicarResposta = (dados) => {
    setConversaId(dados.conversa_id);
    if (dados.conversa) setConversa(dados.conversa);
    if (dados.observacao_preco && !dados.observacao_preco.erro) setObservacaoPreco(dados.observacao_preco);

    if (dados.status === 'aguardando_aprovacao' && dados.pendencia) {
      // Só preenche os campos quando chega um rascunho novo (não apaga edições)
      if (!pendencia) {
        const r = dados.pendencia.argumentos;
        setCampos({ titulo: r.titulo, descricao: r.descricao, preco: r.preco, estado_conservacao: r.estado_conservacao });
      }
      setPendencia(dados.pendencia);
    } else {
      setPendencia(null);
    }

    if (dados.status === 'publicado') onPublicado(dados.anuncio);
    else if (AVISOS_FINAIS[dados.status]) setStatusFinal(dados.status);
  };

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
        body: JSON.stringify({ conversa_id: conversaId, mensagem: msg }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro || 'Erro ao falar com o assistente.');
        return;
      }
      aplicarResposta(dados);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const decidir = async (acao) => {
    if (enviando) return;
    setEnviando(true);
    setErro('');

    // Só manda os campos que a pessoa mudou — sem mudança, é "aprovar"
    const original = pendencia.argumentos;
    const editados = {};
    for (const [k, v] of Object.entries(campos)) {
      if (String(v ?? '') !== String(original[k] ?? '')) editados[k] = v;
    }
    const acaoFinal = acao === 'rejeitar' ? 'rejeitar' : (Object.keys(editados).length ? 'editar' : 'aprovar');

    try {
      const resp = await fetch(`${API_URL}/api/ia/agente-anuncio/decisao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversa_id: conversaId, acao: acaoFinal, campos: editados, imagens }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        // Ex.: sem foto — o cartão continua aberto pra corrigir
        setErro(dados.erro || 'Não consegui registrar sua decisão.');
        return;
      }
      aplicarResposta(dados);
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

  const mudarCampo = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

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

      {observacaoPreco?.comparaveis?.length > 0 && (
        <div className="ia-chat-comparaveis">
          <p className="ia-chat-comparaveis-titulo">
            Anúncios parecidos já publicados (faixa: R$ {formatPreco(observacaoPreco.faixa_min)} – R$ {formatPreco(observacaoPreco.faixa_max)}):
          </p>
          <div className="ia-chat-comparaveis-lista">
            {observacaoPreco.comparaveis.map((c) => (
              <a
                key={c.id}
                href={`/anuncio/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ia-chat-comparavel-card"
              >
                <span className="ia-chat-comparavel-titulo">{c.titulo}</span>
                <span className="ia-chat-comparavel-preco">R$ {formatPreco(c.preco)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Ponto de parada: o vendedor confere e decide antes de publicar */}
      {pendencia && campos && (
        <div className="ia-chat-aprovacao">
          <p className="ia-chat-aprovacao-titulo">Confira o anúncio antes de publicar</p>
          <label>
            Título
            <input value={campos.titulo} onChange={mudarCampo('titulo')} maxLength={120} disabled={enviando} />
          </label>
          <label>
            Descrição
            <textarea value={campos.descricao} onChange={mudarCampo('descricao')} rows={3} disabled={enviando} />
          </label>
          <div className="ia-chat-aprovacao-linha">
            <label>
              Preço (R$)
              <input type="number" min="0" step="0.01" value={campos.preco} onChange={mudarCampo('preco')} disabled={enviando} />
            </label>
            <label>
              Estado
              <select value={campos.estado_conservacao} onChange={mudarCampo('estado_conservacao')} disabled={enviando}>
                {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.rotulo}</option>)}
              </select>
            </label>
          </div>
          <p className="ia-chat-aprovacao-consequencia">{pendencia.consequencia}</p>
          {imagens.length === 0 && (
            <p className="ia-chat-aprovacao-foto">Anexe pelo menos 1 foto do produto (abaixo) para publicar.</p>
          )}
          <div className="ia-chat-aprovacao-botoes">
            <button type="button" className="secundario" onClick={() => decidir('rejeitar')} disabled={enviando}>
              Desistir
            </button>
            <button type="button" onClick={() => decidir('aprovar')} disabled={enviando || imagens.length === 0}>
              {enviando ? 'Publicando...' : 'Publicar anúncio'}
            </button>
          </div>
        </div>
      )}

      <div className="ia-chat-imagens">
        {imagens.map((img, i) => (
          <div key={i} className="ia-chat-imagem-item">
            <img src={img} alt={`Foto ${i + 1}`} />
            <button type="button" onClick={() => removerImagem(i)} aria-label="Remover foto">×</button>
          </div>
        ))}
        {imagens.length < 6 && !statusFinal && (
          <label className="ia-chat-imagem-add">
            📷
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} />
          </label>
        )}
      </div>

      {erro && <p className="ia-chat-erro">⚠️ {erro}</p>}

      {statusFinal && <div className="ia-chat-aviso">{AVISOS_FINAIS[statusFinal]}</div>}

      {!statusFinal && !pendencia && (
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
