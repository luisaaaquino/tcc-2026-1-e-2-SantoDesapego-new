import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../config';
import {
  IconGrid, IconSofa, IconLaptop, IconShirt, IconBook, IconHome, IconBike, IconBaby, IconMore,
} from './Icones';
import './BarraCategorias.css';

// Barra de categorias do cabeçalho (Home, Explorar e Sobre), como nos
// marketplaces: uma linha com as categorias principais logo abaixo da busca.
// - Na Home e na Sobre, cada categoria leva ao Explorar já filtrado.
// - No Explorar, recebe `ativa`/`onEscolher` e filtra na hora, igual à lateral.

const ICONE_POR_SLUG = {
  'moveis': IconSofa,
  'eletronicos': IconLaptop,
  'roupas': IconShirt,
  'livros': IconBook,
  'utensilios-casa': IconHome,
  'esporte-lazer': IconBike,
  'infantil': IconBaby,
  'outros': IconMore,
};

// As categorias mudam pouco: busca uma vez por visita e reaproveita
let cache = null;

const BarraCategorias = ({ ativa = null, onEscolher }) => {
  const [categorias, setCategorias] = useState(cache || []);

  useEffect(() => {
    if (cache) return;
    fetch(`${API_URL}/api/categorias`)
      .then((r) => r.json())
      .then((d) => {
        cache = (d.categorias || []).filter((c) => !c.categoria_pai);
        setCategorias(cache);
      })
      .catch(() => {});
  }, []);

  if (categorias.length === 0) return null;

  const itens = [{ id: null, nome: 'Todas', Icone: IconGrid },
    ...categorias.map((c) => ({ id: c.id, nome: c.nome, Icone: ICONE_POR_SLUG[c.slug] || IconMore }))];

  return (
    <nav className="barra-categorias" aria-label="Categorias">
      <div className="barra-categorias-trilho">
        {itens.map(({ id, nome, Icone }) => {
          const atual = onEscolher ? ativa === id : false;
          const conteudo = <><Icone /><span>{nome}</span></>;
          return onEscolher ? (
            <button
              key={nome}
              type="button"
              className={`barra-categoria${atual ? ' ativa' : ''}`}
              aria-pressed={atual}
              onClick={() => onEscolher(id)}
            >
              {conteudo}
            </button>
          ) : (
            <Link key={nome} to={id ? `/explorar?categoria_id=${id}` : '/explorar'} className="barra-categoria">
              {conteudo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BarraCategorias;
