// ============================================================
//  [RF08] Busca geolocalizada por proximidade
//  A plataforma só opera nos bairros de Santo Amaro e região
//  limítrofe (mesma lista usada no cadastro/filtros — RN01/RN12),
//  então em vez de geocodificar cada anúncio individualmente,
//  usamos o centroide aproximado de cada bairro como referência
//  pra calcular distância real (fórmula de Haversine).
// ============================================================
const BAIRRO_COORDS = {
  'Santo Amaro Centro': { lat: -23.6574, lng: -46.7062 },
  'Campo Belo':          { lat: -23.6189, lng: -46.6823 },
  'Brooklin':             { lat: -23.6270, lng: -46.6883 },
  'Granja Julieta':        { lat: -23.6608, lng: -46.7120 },
  'Jardim Marajoara':       { lat: -23.6534, lng: -46.6816 },
  'Vila Cruzeiro':           { lat: -23.6480, lng: -46.7010 },
  'Vila Mascote':             { lat: -23.6472, lng: -46.6669 },
  'Vila Sofia':                { lat: -23.6580, lng: -46.6920 },
};

// Distância em km entre dois pontos (fórmula de Haversine)
const distanciaKm = (a, b) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Distância entre dois bairros da lista — null quando um deles é desconhecido
const distanciaEntreBairros = (bairroA, bairroB) => {
  const a = BAIRRO_COORDS[bairroA];
  const b = BAIRRO_COORDS[bairroB];
  if (!a || !b) return null;
  return distanciaKm(a, b);
};

module.exports = { BAIRRO_COORDS, distanciaEntreBairros };
