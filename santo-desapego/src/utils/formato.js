// Formatação de preço e de data usada nos cartões de anúncio

export const formatarPreco = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

// "Hoje", "Ontem", "há 3 dias"...
export const tempoRelativo = (dataISO) => {
  const dias = Math.floor((Date.now() - new Date(dataISO).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} sem.`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return new Date(dataISO).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};
