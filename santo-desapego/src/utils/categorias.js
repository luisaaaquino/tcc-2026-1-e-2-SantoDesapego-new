import {
  IconSofa, IconLaptop, IconShirt, IconBook, IconHome, IconBike, IconBaby, IconMore,
} from '../componentes/Icones';

// Ícone de cada categoria principal, pelo id do banco (tabela categorias).
// Os nomes vêm sempre da API (/api/categorias) — aqui só o desenho.
const ICONES = {
  1: IconSofa,   // Móveis
  2: IconLaptop, // Eletrônicos
  3: IconShirt,  // Roupas e Acessórios
  4: IconBook,   // Livros
  5: IconHome,   // Utensílios de Casa
  6: IconBike,   // Esporte e Lazer
  7: IconBaby,   // Infantil
  8: IconMore,   // Outros
};

export const iconeDaCategoria = (id) => ICONES[id] || IconMore;
