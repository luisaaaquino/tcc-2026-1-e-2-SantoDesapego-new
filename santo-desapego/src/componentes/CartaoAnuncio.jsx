import { Link } from 'react-router-dom';
import { IconHeart } from './Icones';
import { formatarPreco, tempoRelativo } from '../utils/formato';
import './CartaoAnuncio.css';

// Cartão de anúncio usado na Home e no Explorar.
// A foto é o destaque; o resto fica quieto. O bairro aparece na
// "placa" (o detalhe próprio do site, no estilo das placas de rua).

const ESTADO_LABEL = {
  'novo': 'Novo',
  'seminovo': 'Seminovo',
  'usado': 'Usado',
  'para-reparo': 'Para reparo',
};

// Nome do bairro no formato de placa de rua
export const PlacaBairro = ({ bairro, className = '' }) => (
  <span className={`placa-bairro ${className}`.trim()}>{bairro || 'Santo Amaro'}</span>
);

// prioridade (opcional): fotos da primeira linha da grade carregam já,
// sem esperar o lazy-load, porque são as primeiras que aparecem na tela.
const CartaoAnuncio = ({ anuncio, onFavoritar, prioridade = false }) => {
  const estado = ESTADO_LABEL[anuncio.estado_conservacao] || anuncio.estado_conservacao;
  const distancia = typeof anuncio.distancia_km === 'number'
    ? (anuncio.distancia_km < 1 ? 'menos de 1 km' : `${anuncio.distancia_km.toFixed(1)} km`)
    : null;

  return (
    <Link to={`/anuncio/${anuncio.id}`} className="cartao-anuncio">
      <div className="cartao-anuncio-foto">
        {anuncio.imagem_principal
          ? <img src={anuncio.imagem_principal} alt={anuncio.titulo} loading={prioridade ? 'eager' : 'lazy'} />
          : <span className="cartao-anuncio-sem-foto">Sem foto</span>}
        {onFavoritar && (
          <button
            type="button"
            className={`cartao-anuncio-favorito${anuncio.favoritado ? ' ativo' : ''}`}
            onClick={(e) => onFavoritar(e, anuncio)}
            aria-label={anuncio.favoritado ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          >
            <IconHeart size={16} strokeWidth={1.8} filled={anuncio.favoritado} />
          </button>
        )}
      </div>

      <div className="cartao-anuncio-info">
        <p className="cartao-anuncio-preco">{formatarPreco(anuncio.preco)}</p>
        <h3 className="cartao-anuncio-titulo">{anuncio.titulo}</h3>
        <p className="cartao-anuncio-meta">
          {estado}{distancia && ` · ${distancia}`} · {tempoRelativo(anuncio.data_criacao)}
        </p>
        <div className="cartao-anuncio-rodape">
          <PlacaBairro bairro={anuncio.bairro} />
          {!anuncio.vendedor_recebe_pagamentos && (
            <span className="cartao-anuncio-aviso">Pagamento ainda não habilitado</span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default CartaoAnuncio;
