import { useState } from 'react';
import './AnuncioRapidoIA.css';
import { API_URL } from '../config';

/**
 * "Anúncio rápido" (IA) — modo de tiro único: o vendedor escreve uma
 * descrição + anexa fotos, clica em "Gerar com IA" e recebe um rascunho
 * pronto pra revisar. Diferente do chat (AgenteAnuncioChat), não há
 * ida-e-volta de perguntas — o rascunho bruto sobe pro componente pai
 * (Anunciar.jsx), que já sabe mapear categoria_id pra
 * categoria_principal/categoria_id e preencher o formulário manual, que é
 * quem efetivamente publica (mesmo botão, mesma validação de sempre).
 */
const AnuncioRapidoIA = ({ imagens, handleFiles, removerImagem, fileInputRef, maxImagens, onRascunhoGerado }) => {
  const [mensagem, setMensagem] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const gerar = async (e) => {
    e.preventDefault();
    if (!mensagem.trim() || gerando) return;

    setGerando(true);
    setErro('');

    try {
      const resp = await fetch(`${API_URL}/api/ia/anuncio-rapido`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({ mensagem: mensagem.trim() }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        setErro(dados.erro || 'Erro ao gerar o rascunho.');
        return;
      }

      onRascunhoGerado(dados);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="rapido-ia-wrap">
      <p className="rapido-ia-intro">
        Descreva o produto numa frase e anexe as fotos — a IA já monta um
        rascunho do anúncio (título, categoria, descrição, preço sugerido)
        pra você revisar e publicar com um clique.
      </p>

      <form onSubmit={gerar} className="rapido-ia-form">
        <textarea
          className="rapido-ia-textarea"
          placeholder="Ex: geladeira consul duplex, uso de 5 anos, funciona bem, uns 350 reais"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value.slice(0, 500))}
          maxLength={500}
          disabled={gerando}
        />

        <div className="rapido-ia-imagens">
          {imagens.map((img, i) => (
            <div key={i} className="rapido-ia-imagem-item">
              <img src={img} alt={`Foto ${i + 1}`} />
              <button type="button" onClick={() => removerImagem(i)} aria-label="Remover foto">×</button>
            </div>
          ))}
          {imagens.length < maxImagens && (
            <label className="rapido-ia-imagem-add">
              📷
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} />
            </label>
          )}
        </div>

        {erro && <p className="rapido-ia-erro">⚠️ {erro}</p>}

        <button type="submit" className="rapido-ia-botao" disabled={gerando || !mensagem.trim()}>
          {gerando ? 'Gerando...' : 'Gerar anúncio com IA ✨'}
        </button>
      </form>
    </div>
  );
};

export default AnuncioRapidoIA;
