import { useState } from 'react';
import { Link } from 'react-router-dom';
import './AssistenteCompraFlutuante.css';
import { API_URL } from '../config';

/**
 * Botão flutuante global — "Agente A" (Consultor de Compra) do case
 * acadêmico. Infere a intenção de compra a partir dos cliques recentes do
 * comprador em anúncios (ver Anuncio.jsx, que registra cada visualização) e
 * sugere itens reais. Só aparece pra quem está logado — precisa de CEP/
 * bairro do perfil e histórico de cliques, que visitante anônimo não tem.
 */
const AssistenteCompraFlutuante = () => {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sugestao, setSugestao] = useState(null);
  const [erro, setErro] = useState('');

  const token = localStorage.getItem('sd_token');

  const buscarSugestao = () => {
    setCarregando(true);
    setErro('');
    fetch(`${API_URL}/api/ia/sugestao-compra`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((dados) => {
        if (dados.erro) setErro(dados.erro);
        else setSugestao(dados);
      })
      .catch(() => setErro('Não consegui buscar sugestões agora.'))
      .finally(() => setCarregando(false));
  };

  // Busca de novo a cada abertura (não só na primeira vez) — o histórico
  // de cliques muda conforme a pessoa navega, então uma sugestão cacheada
  // da primeira abertura ficaria desatualizada nas próximas.
  const alternar = () => {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (vaiAbrir) buscarSugestao();
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
            <button type="button" className="compra-ia-fechar" onClick={() => setAberto(false)} aria-label="Fechar">×</button>
          </div>

          <div className="compra-ia-painel-corpo">
            {carregando && <p className="compra-ia-msg">Vendo o que pode combinar com você...</p>}

            {!carregando && erro && <p className="compra-ia-msg erro">{erro}</p>}

            {!carregando && !erro && sugestao && (
              <>
                <p className="compra-ia-justificativa">
                  {sugestao.justificativa || 'Dá uma olhada nessas opções:'}
                </p>

                {sugestao.itens.length === 0 && (
                  <p className="compra-ia-msg">
                    Ainda não tenho anúncios pra sugerir. Explore o catálogo e eu vou aprendendo com o que você vê.
                  </p>
                )}

                <div className="compra-ia-itens">
                  {sugestao.itens.map((item) => (
                    <Link key={item.id} to={`/anuncio/${item.id}`} className="compra-ia-item" onClick={() => setAberto(false)}>
                      {item.imagem
                        ? <img src={item.imagem} alt={item.titulo} />
                        : <div className="compra-ia-item-sem-foto">📦</div>}
                      <div className="compra-ia-item-info">
                        <span className="compra-ia-item-titulo">{item.titulo}</span>
                        <span className="compra-ia-item-preco">
                          R$ {Number(item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>

                <Link to="/explorar" className="compra-ia-ver-mais" onClick={() => setAberto(false)}>
                  Ver mais no catálogo →
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className="compra-ia-botao"
        onClick={alternar}
        aria-label="Assistente de compra"
      >
        {aberto ? '×' : '💬'}
      </button>
    </div>
  );
};

export default AssistenteCompraFlutuante;
