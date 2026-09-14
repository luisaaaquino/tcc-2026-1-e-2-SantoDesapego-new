import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Mapa.css';
import { API_URL as API_BASE } from '../config';

const API_URL = `${API_BASE}/api`;

const CENTER_SANTO_AMARO = { lat: -23.6562, lng: -46.7191 };
const CENTER = [CENTER_SANTO_AMARO.lat, CENTER_SANTO_AMARO.lng];
const ZOOM_INICIAL = 13;

/* ── Centro aproximado de cada bairro atendido (coordenadas reais,
   validadas via OpenStreetMap Nominatim) ───────────────────────
   Usamos o centro do bairro, não o endereço exato do vendedor —
   é o suficiente pra mostrar "o que tem perto de mim" sem expor
   a localização precisa de quem anuncia. */
const CENTRO_BAIRRO = {
  'Santo Amaro Centro': { lat: -23.6562, lng: -46.7191 },
  'Campo Belo':         { lat: -23.6299, lng: -46.6704 },
  'Brooklin':           { lat: -23.6268, lng: -46.6881 },
  'Granja Julieta':     { lat: -23.6275, lng: -46.7120 },
  'Jardim Marajoara':   { lat: -23.6554, lng: -46.6849 },
  'Vila Cruzeiro':      { lat: -23.6352, lng: -46.7117 },
  'Vila Mascote':       { lat: -23.6459, lng: -46.6676 },
  'Vila Sofia':         { lat: -23.6630, lng: -46.6850 },
};

/* ── Pin terracota customizado ───────────────────────────── */
const ICONE_PIN = L.divIcon({
  className: 'mapa-marker',
  html: '<span class="mapa-marker-pin"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -10],
});

/* ── Resolve coords para um anúncio — síncrono, sem API externa ──
   1) lat/lng próprios do anúncio, se um dia existirem no banco;
   2) centro do bairro cadastrado, com um leve espalhamento
      aleatório (~250m) pra vários anúncios no mesmo bairro não
      ficarem todos empilhados no mesmíssimo ponto;
   3) fallback: centro de Santo Amaro, mesmo espalhamento. */
const resolverCoords = (anuncio) => {
  const lat = parseFloat(anuncio.latitude);
  const lng = parseFloat(anuncio.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  const base = CENTRO_BAIRRO[anuncio.bairro] || CENTER_SANTO_AMARO;
  const jitter = () => (Math.random() - 0.5) * 0.0045; // ~ 250m
  return { lat: base.lat + jitter(), lng: base.lng + jitter() };
};

/* ── Força Leaflet a recalcular tamanho após mount ──────────
   Um único setTimeout não é suficiente: se o contêiner ainda não
   tinha suas dimensões finais nesse instante (fontes carregando,
   imagens acima mudando a altura da página, etc.), os tiles ficam
   em branco até a próxima interação. Um ResizeObserver cobre
   qualquer mudança de tamanho depois disso também. */
const InvalidarTamanho = () => {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 700);

    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
    };
  }, [map]);
  return null;
};

/* ── Enquadra automaticamente todos os pins na tela ────────── */
const EnquadrarMarcadores = ({ marcadores }) => {
  const map = useMap();
  useEffect(() => {
    if (marcadores.length === 0) return;
    const bounds = L.latLngBounds(marcadores.map((m) => [m.coords.lat, m.coords.lng]));
    map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 15, duration: 0.6 });
  }, [marcadores, map]);
  return null;
};

/* ── Referência do mapa exposta pro componente pai (voa até um bairro) ── */
const ExporMapa = ({ mapaRef }) => {
  const map = useMap();
  useEffect(() => { mapaRef.current = map; }, [map, mapaRef]);
  return null;
};

const formatarPreco = (valor) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(parseFloat(valor) || 0);

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Mapa = ({ bairroFoco }) => {
  const [marcadores, setMarcadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const mapaRef = useRef(null);

  useEffect(() => {
    let cancelado = false;

    fetch(`${API_URL}/anuncios?limite=50`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelado) return;
        const anuncios = data.anuncios || [];
        setMarcadores(anuncios.map((anuncio) => ({ anuncio, coords: resolverCoords(anuncio) })));
      })
      .catch((erro) => console.error('[Mapa] Erro ao carregar anúncios:', erro))
      .finally(() => { if (!cancelado) setCarregando(false); });

    return () => { cancelado = true; };
  }, []);

  // Voa até o bairro selecionado nos chips ao lado do mapa
  useEffect(() => {
    if (!bairroFoco || !mapaRef.current) return;
    const centro = CENTRO_BAIRRO[bairroFoco];
    if (centro) mapaRef.current.flyTo([centro.lat, centro.lng], 15, { duration: 0.6 });
  }, [bairroFoco]);

  return (
    <div className="leaflet-wrapper">
      <MapContainer
        center={CENTER}
        zoom={ZOOM_INICIAL}
        scrollWheelZoom={false}
        className="leaflet-map"
        attributionControl={false}
      >
        <InvalidarTamanho />
        <ExporMapa mapaRef={mapaRef} />
        {!bairroFoco && <EnquadrarMarcadores marcadores={marcadores} />}

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {marcadores.map(({ anuncio, coords }) => (
          <Marker
            key={anuncio.id}
            position={[coords.lat, coords.lng]}
            icon={ICONE_PIN}
          >
            {/* Rótulo sempre visível — não depende de hover/clique */}
            <Tooltip permanent direction="top" offset={[0, -10]} className="mapa-tooltip">
              {formatarPreco(anuncio.preco)}
            </Tooltip>

            <Popup>
              <div className="mapa-popup">
                {anuncio.imagem_principal && (
                  <img
                    src={anuncio.imagem_principal}
                    alt={anuncio.titulo}
                    loading="lazy"
                  />
                )}
                <div className="mapa-popup-body">
                  <strong>{anuncio.titulo}</strong>
                  <span className="popup-price">
                    {formatarPreco(anuncio.preco)}
                  </span>
                  <span className="popup-bairro">
                    📍 {anuncio.bairro || 'Santo Amaro'}
                  </span>
                  <Link to={`/anuncio/${anuncio.id}`}>Ver anúncio →</Link>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Badge: status / contagem */}
      <div className="mapa-info">
        {carregando ? (
          <>
            <span className="mapa-spinner" aria-hidden="true" />
            <span>Mapeando anúncios…</span>
          </>
        ) : (
          <>
            <strong>{marcadores.length}</strong>
            <span>
              {marcadores.length === 1 ? 'anúncio aqui perto' : 'anúncios aqui perto'}
            </span>
          </>
        )}
      </div>

      {/* Nota de transparência sobre a localização aproximada */}
      {!carregando && marcadores.length > 0 && (
        <div className="mapa-nota">Localização aproximada, por bairro</div>
      )}

      {/* Estado vazio */}
      {!carregando && marcadores.length === 0 && (
        <div className="mapa-empty">
          <span aria-hidden="true">📍</span>
          <p>Ainda não há anúncios<br />com localização mapeada.</p>
        </div>
      )}
    </div>
  );
};

export default Mapa;
