import { useState } from 'react';
import { Link } from 'react-router-dom';
import './AssistenteCompraFlutuante.css';
import { API_URL } from '../config';
import { IconChat, IconClose } from './Icones';

/**
 * Botão flutuante global — "Agente A" (Consultor de Compra) do repositório
 * agents-llm-senac-2026 (Parte 2). A pessoa escreve o que procura ("to
 * montando a cozinha, até 700") e o agente interpreta, busca no catálogo e
 * sugere itens reais, no máximo 1 por categoria e dentro do orçamento. Sem
 * texto, usa os anúncios que ela abriu recentemente (ver Anuncio.jsx, que
 * registra cada visualização). Só aparece pra quem está logado.
 */
const AssistenteCompraFlutuante = () => {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  // Falas do comprador neste painel — permitem refinar ("e até 500?")
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');

  const token = localStorage.getItem('sd_token');

  const buscar = (falas) => {
    setCarregando(true);
    setErro('');
    fetch(`${API_URL}/api/ia/sugestao-compra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensagens: falas }),
    })
      .then((r) => r.json())
      .then((dados) => {
        if (dados.erro) setErro(dados.erro);
        else setResultado(dados);
      })
      .catch(() => setErro('Não consegui buscar sugestões agora.'))
      .finally(() => setCarregando(false));
  };

  // Ao abrir, começa uma conversa nova: sem texto, o agente usa os cliques
  // recentes (que mudam conforme a pessoa navega) ou pergunta o que ela procura.
  const alternar = () => {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (vaiAbrir) {
      setMensagens([]);
      setResultado(null);
      buscar([]);
    }
  };

  const enviar = (e) => {
    e.preventDefault();
    const msg = texto.trim();
    if (!msg || carregando) return;
    const falas = [...mensagens, msg];
    setMensagens(falas);
    setTexto('');
    buscar(falas);
  };

  // Sem token (visitante ou logout) o componente nem chega a renderizar o
  // botão/painel — não precisa de efeito pra "fechar" nada.
  if (!token) return null;

  return (
    <div className="compra-ia-flutuante-wrap">
      {aberto && (
        <div className="compra-ia-painel">
          <div className="compra-ia-painel-topo">
            <strong>Como te ajudo a encontrar algo?</strong>
            <button type="button" className="compra-ia-fechar" onClick={() => setAberto(false)} aria-label="Fechar"><IconClose size={18} /></button>
          </div>

          <div className="compra-ia-painel-corpo">
            {mensagens.length > 0 && (
              <p className="compra-ia-pedido">Você: {mensagens.join(' · ')}</p>
            )}

            {carregando && <p className="compra-ia-msg">Procurando no catálogo...</p>}

            {!carregando && erro && <p className="compra-ia-msg erro">{erro}</p>}

            {!carregando && !erro && resultado && (
              <>
                <p className="compra-ia-justificativa">{resultado.texto}</p>
                {resultado.escolha_declarada && (
                  <p className="compra-ia-escolha">Obs.: {resultado.escolha_declarada}.</p>
                )}

                {resultado.itens.length > 0 && (
                  <div className="compra-ia-itens">
                    {resultado.itens.map((item) => (
                      <Link key={item.id} to={`/anuncio/${item.id}`} className="compra-ia-item" onClick={() => setAberto(false)}>
                        {item.imagem
                          ? <img src={item.imagem} alt={item.titulo} />
                          : <div className="compra-ia-item-sem-foto">📦</div>}
                        <div className="compra-ia-item-info">
                          <span className="compra-ia-item-titulo">{item.titulo}</span>
                          <span className="compra-ia-item-preco">
                            R$ {Number(item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="compra-ia-item-local">
                            {item.bairro}{item.dist_km != null && ` · ${item.dist_km.toLocaleString('pt-BR')} km`}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                <Link to="/explorar" className="compra-ia-ver-mais" onClick={() => setAberto(false)}>
                  Ver mais no catálogo →
                </Link>
              </>
            )}
          </div>

          <form className="compra-ia-form" onSubmit={enviar}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={mensagens.length ? 'Quer ajustar algo?' : 'O que você procura?'}
              maxLength={500}
              disabled={carregando}
              aria-label="O que você procura"
            />
            <button type="submit" disabled={carregando || !texto.trim()}>Buscar</button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="compra-ia-botao"
        onClick={alternar}
        aria-label="Assistente de compra"
        aria-expanded={aberto}
      >
        <IconChat />
      </button>
    </div>
  );
};

export default AssistenteCompraFlutuante;
