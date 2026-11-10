import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config';
import './DuvidaRegrasIA.css';

/* ── Dúvidas sobre as regras (RAG) ───────────────────────────
   A pergunta vai pra /api/ia/duvida-regras, que busca nas regras
   do site e responde citando o trecho. Sem regra que sustente a
   resposta, o assistente recusa em vez de inventar. As fontes
   mostram de onde a resposta saiu (documento, seção e texto). ── */
const EXEMPLOS = [
  'A taxa de 5% é cobrada em cima do frete?',
  'Posso anunciar uma arma de brinquedo?',
  'Quando o vendedor recebe o dinheiro?',
  'O que acontece se eu errar o código de entrega?',
];

const DuvidaRegrasIA = ({ logado }) => {
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  const perguntar = async (texto) => {
    const p = (texto ?? pergunta).trim();
    if (!p || carregando) return;
    setPergunta(p);
    setCarregando(true);
    setErro('');
    setResultado(null);
    try {
      const resp = await fetch(`${API_URL}/api/ia/duvida-regras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('sd_token')}` },
        body: JSON.stringify({ pergunta: p }),
      });
      const dados = await resp.json();
      if (!resp.ok) setErro(dados.erro || 'Não consegui responder agora.');
      else setResultado(dados);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <section className="ajuda-bloco duvida-regras" id="duvidas">
      <h2>Tire sua dúvida sobre as regras</h2>
      <p className="duvida-regras-intro">
        O assistente responde com base nas regras do Santo Desapego e mostra de onde tirou a resposta.
        Se não houver regra sobre o assunto, ele avisa em vez de chutar.
      </p>

      {!logado ? (
        <div className="ajuda-login-cta">
          <p>Entre na sua conta para perguntar ao assistente.</p>
          <Link to="/login" className="btn-ajuda">Entrar na minha conta</Link>
        </div>
      ) : (
        <>
          <form className="duvida-regras-form" onSubmit={(e) => { e.preventDefault(); perguntar(); }}>
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder="Ex.: a taxa de 5% é cobrada em cima do frete?"
              maxLength={500}
              disabled={carregando}
              aria-label="Sua dúvida sobre as regras"
            />
            <button type="submit" disabled={carregando || !pergunta.trim()}>
              {carregando ? 'Consultando...' : 'Perguntar'}
            </button>
          </form>

          <div className="duvida-regras-exemplos" aria-label="Perguntas de exemplo">
            {EXEMPLOS.map((ex) => (
              <button key={ex} type="button" onClick={() => perguntar(ex)} disabled={carregando}>{ex}</button>
            ))}
          </div>

          {carregando && <p className="duvida-regras-status">Consultando as regras do site...</p>}
          {erro && <div className="ajuda-alerta erro">{erro}</div>}

          {resultado && (
            <div className={`duvida-regras-resposta ${resultado.tipo}`}>
              <p>{resultado.resposta}</p>
              {resultado.fontes.length > 0 && (
                <div className="duvida-regras-fontes">
                  <span>Fonte{resultado.fontes.length > 1 ? 's' : ''}:</span>
                  {resultado.fontes.map((f) => (
                    <details key={f.id}>
                      <summary>{f.doc} — {f.secao}</summary>
                      <p>{f.texto}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default DuvidaRegrasIA;
