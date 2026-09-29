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
  // Adicionados depois (validados via OpenStreetMap Nominatim) — mesmo
  // conjunto usado no front em santo-desapego/src/componentes/Mapa.jsx e
  // SeletorBairro.jsx; mantenha as três listas em sincronia ao editar.
  'Alto da Boa Vista':     { lat: -23.6413, lng: -46.6992 },
  'Campo Grande':          { lat: -23.6620, lng: -46.6870 },
  'Chácara Flora':         { lat: -23.6468, lng: -46.6854 },
  'Chácara Monte Alegre':  { lat: -23.6444, lng: -46.6770 },
  'Chácara Santo Antônio': { lat: -23.6298, lng: -46.7039 },
  'Interlagos':            { lat: -23.6532, lng: -46.6799 },
  'Jardim Cordeiro':       { lat: -23.6366, lng: -46.6776 },
  'Jardim Petrópolis':     { lat: -23.6317, lng: -46.6839 },
  'Jardim Santo Amaro':    { lat: -23.6522, lng: -46.6960 },
  'Socorro':               { lat: -23.6633, lng: -46.7110 },
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
