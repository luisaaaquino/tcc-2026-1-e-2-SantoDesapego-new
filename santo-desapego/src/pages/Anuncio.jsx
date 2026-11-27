import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import './Anuncio.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import SiteHeader from '../componentes/SiteHeader';
import { IconHeart, IconArrowLeft } from '../componentes/Icones';
import CarrosselAnuncios from '../componentes/CarrosselAnuncios';
import DicasSeguranca from '../componentes/DicasSeguranca';

import { API_URL, EMAILS } from '../config';
import { PlacaBairro } from '../componentes/CartaoAnuncio';

const ESTADO_LABEL = {
  'novo':        { name: 'Novo / Na caixa' },
  'seminovo':    { name: 'Seminovo' },
  'usado':       { name: 'Usado' },
  'para-reparo': { name: 'Para reparo' },
};

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MOTIVOS_DENUNCIA = [
  { valor: 'conteudo_inadequado', label: 'Conteúdo inadequado' },
  { valor: 'fraude', label: 'Suspeita de fraude' },
  { valor: 'violacao_termos', label: 'Violação dos Termos de Uso' },
  { valor: 'outro', label: 'Outro motivo' },
];

/* ── Modal de denúncia [RF19] ─────────────────────────────── */
const ModalDenunciar = ({ anuncio, aoFechar }) => {
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState('conteudo_inadequado');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    setEnviando(true);
    setErro('');
    try {
      const resposta = await fetch(`${API_URL}/api/denuncias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ anuncio_id: anuncio.id, motivo, descricao: descricao.trim() || null }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) { setErro(dados.erro || 'Erro ao enviar denúncia.'); return; }
      setEnviado(true);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="denuncia-modal-overlay" onClick={() => !enviando && aoFechar()}>
      <div className="denuncia-modal" onClick={(e) => e.stopPropagation()}>
        {enviado ? (
          <div className="denuncia-sucesso">
                        <h2>Denúncia enviada</h2>
            <p>Nossa equipe vai analisar em breve. Obrigado por ajudar a manter a comunidade segura.</p>
            <div className="denuncia-modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn-anuncio-comprar" onClick={aoFechar}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <h2>Denunciar anúncio</h2>
            <p>Conte pra gente o que há de errado com "{anuncio.titulo}".</p>
            {erro && <p className="anuncio-erro-pagamento">{erro}</p>}

            <label>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_DENUNCIA.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
            </select>

            <label>Descreva o problema (opcional)</label>
            <textarea rows={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />

            <p className="denuncia-email">
              Caso urgente, como suspeita de golpe? Escreva também para{' '}
              <a href={`mailto:${EMAILS.denuncias}`}>{EMAILS.denuncias}</a>
            </p>

            <div className="denuncia-modal-actions">
              <button type="button" className="btn-anuncio-proposta" onClick={aoFechar} disabled={enviando}>Cancelar</button>
              <button type="button" className="btn-anuncio-comprar" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar denúncia'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Anuncio = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [anuncio, setAnuncio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [foto, setFoto] = useState(0);

  useEffect(() => {
    setCarregando(true);
    setErro('');
    setFoto(0); // ao abrir outro anúncio pelas sugestões, começa da 1ª foto

    const token = localStorage.getItem('sd_token');
    fetch(`${API_URL}/api/anuncios/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const texto = await res.text();

        // 404 = anúncio removido/inexistente: a tela usa o texto padrão
        // ("pode ter sido vendido ou removido"); outros erros, mensagem genérica.
        if (res.status === 404) throw new Error('');
        if (!res.ok) throw new Error('Não foi possível carregar o anúncio agora. Tente de novo em instantes.');

        try {
          return JSON.parse(texto);
        } catch {
          throw new Error('Não foi possível carregar o anúncio agora. Tente de novo em instantes.');
        }
      })
      .then((dados) => {
        const item = dados.anuncio || (dados.id ? dados : null);
        if (item) {
          setAnuncio(item);
          // Sinal pro Consultor de Compra (IA, Agente A) — cada visualização
          // vira um "clique" que ajuda a inferir intenção depois. Falha
          // silenciosa: não atrapalha a navegação se a IA estiver fora.
          if (token) {
            fetch(`${API_URL}/api/ia/registrar-clique`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ anuncio_id: item.id }),
            }).catch(() => {});
          }
        } else {
          setErro(dados.erro || 'Anúncio não encontrado.');
        }
      })
      .catch((e) => {
        console.error('[Anuncio]', e);
        setErro(
          e.message === 'Failed to fetch'
            ? 'Não consegui falar com o servidor. Ele está rodando em localhost:8080?'
            : e.message
        );
      })
      .finally(() => setCarregando(false));
  }, [id]);

  // ── Sugestões no fim da tela: até 20 anúncios, em grupos de 5.
  // Logado: primeiro o "Para você" (histórico de navegação). Depois
  // completa com a mesma subcategoria e, por fim, os mais recentes.
  // Nunca repete e nunca mostra o próprio anúncio aberto.
  const [sugestoes, setSugestoes] = useState({ anuncios: [], personalizadas: false });
  const anuncioId = anuncio?.id;
  const categoriaId = anuncio?.categoria_id;

  useEffect(() => {
    if (!anuncioId) return;
    let cancelado = false;
    const token = localStorage.getItem('sd_token');
    const json = (url, opcoes) => fetch(url, opcoes).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

    Promise.all([
      token
        ? json(`${API_URL}/api/recomendacoes?limite=20`, { headers: { Authorization: `Bearer ${token}` } })
        : Promise.resolve({}),
      categoriaId ? json(`${API_URL}/api/anuncios?categoria_id=${categoriaId}&limite=21`) : Promise.resolve({}),
      json(`${API_URL}/api/anuncios?ordenacao=recentes&limite=30`),
    ]).then(([paraVoce, mesmaCategoria, recentes]) => {
      if (cancelado) return;
      const vistos = new Set([anuncioId]);
      const lista = [];
      for (const a of [...(paraVoce.anuncios || []), ...(mesmaCategoria.anuncios || []), ...(recentes.anuncios || [])]) {
        if (lista.length === 20) break;
        if (vistos.has(a.id)) continue;
        vistos.add(a.id);
        lista.push(a);
      }
      setSugestoes({ anuncios: lista, personalizadas: (paraVoce.anuncios || []).some((a) => a.id !== anuncioId) });
    });
    return () => { cancelado = true; };
  }, [anuncioId, categoriaId]);

  // ── Galeria: setas, teclado (← →) e arrastar com o dedo no celular
  const toqueInicio = useRef(null);

  const [abrindoChat, setAbrindoChat] = useState(false);
  const [erroAcao, setErroAcao] = useState('');
  const [denunciando, setDenunciando] = useState(false);

  const comprar = () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }
    navigate(`/checkout/${anuncio.id}`);
  };

  // [RF10] Favorita/desfavorita o anúncio em exibição
  const alternarFavorito = async () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    const jaFavoritado = anuncio.favoritado;
    setAnuncio((prev) => ({ ...prev, favoritado: !jaFavoritado }));

    try {
      if (jaFavoritado) {
        await fetch(`${API_URL}/api/favoritos/${anuncio.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`${API_URL}/api/favoritos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ anuncio_id: anuncio.id }),
        });
      }
    } catch {
      setAnuncio((prev) => ({ ...prev, favoritado: jaFavoritado }));
    }
  };

  // Abre (ou reaproveita) a conversa com o anunciante e vai para o chat
  const conversar = async () => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    setAbrindoChat(true);
    setErroAcao('');

    try {
      const resposta = await fetch(`${API_URL}/api/conversas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anuncio_id: anuncio.id }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErroAcao(dados.erro || 'Não foi possível abrir a conversa.');
        setAbrindoChat(false);
        return;
      }

      navigate(`/mensagens?conversa=${dados.conversa.id}`);
    } catch (e) {
      console.error('[chat]', e);
      setErroAcao('Erro ao conectar com o servidor.');
      setAbrindoChat(false);
    }
  };

  const Header = () => (
    <SiteHeader>
      <NotificacoesSino />
    </SiteHeader>
  );

  if (carregando) {
    return (
      <div className="anuncio-wrapper">
        <Header />
        <div className="anuncio-estado">Carregando anúncio…</div>
      </div>
    );
  }

  if (erro || !anuncio) {
    return (
      <div className="anuncio-wrapper">
        <Header />
        <div className="anuncio-estado">
          <h2>Este anúncio não está disponível</h2>
          <p>{erro || 'Ele pode ter sido vendido ou removido pelo vendedor.'}</p>
          <Link to="/explorar" className="btn-anuncio-comprar">Ver outros desapegos</Link>
        </div>
      </div>
    );
  }

  // Normaliza campos que podem variar de nome no retorno da API
  // as imagens podem vir como string base64 ou como objeto { imagem } / { url }
  const imagens = (anuncio.imagens?.length
    ? anuncio.imagens
    : [anuncio.imagem_principal || null]
  ).map((img) => (typeof img === 'string' || !img ? img : img.imagem || img.url || null));
  const estado   = ESTADO_LABEL[anuncio.estado_conservacao] || { name: anuncio.estado_conservacao || '—' };
  // Passa para a foto anterior/próxima; da última volta para a primeira
  const trocarFoto = (passo) => {
    if (imagens.length < 2) return;
    setFoto((atual) => (atual + passo + imagens.length) % imagens.length);
  };
  const vendedor = anuncio.usuario?.nome || anuncio.vendedor?.nome || anuncio.usuario_nome || 'Vendedor';
  const categoria = anuncio.categoria?.nome || anuncio.categoria_nome || '';

  return (
    <div className="anuncio-wrapper">
      <Header />

      <div className="anuncio-container">
        {/* Voltar fica à esquerda, onde a pessoa procura primeiro */}
        <Link to="/explorar" className="anuncio-voltar">
          <IconArrowLeft />
          Voltar para o Explorar
        </Link>

        <div className="anuncio-grid">

          {/* ── Galeria (carrossel das até 6 fotos) ───── */}
          <section className="anuncio-galeria" aria-label="Fotos do anúncio">
            <div
              className="galeria-principal"
              tabIndex={imagens.length > 1 ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') trocarFoto(-1);
                if (e.key === 'ArrowRight') trocarFoto(1);
              }}
              onTouchStart={(e) => { toqueInicio.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (toqueInicio.current === null) return;
                const deslocamento = e.changedTouches[0].clientX - toqueInicio.current;
                toqueInicio.current = null;
                if (Math.abs(deslocamento) > 40) trocarFoto(deslocamento < 0 ? 1 : -1);
              }}
            >
              {imagens[foto]
                ? <img src={imagens[foto]} alt={`${anuncio.titulo}, foto ${foto + 1} de ${imagens.length}`} />
                : <div className="galeria-vazia">Sem foto</div>}
              {imagens.length > 1 && (
                <>
                  <button type="button" className="galeria-seta esquerda" onClick={() => trocarFoto(-1)} aria-label="Foto anterior">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" className="galeria-seta direita" onClick={() => trocarFoto(1)} aria-label="Próxima foto">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                  <span className="galeria-contador" aria-live="polite">{foto + 1}/{imagens.length}</span>
                </>
              )}
            </div>

            {imagens.length > 1 && (
              <div className="galeria-miniaturas">
                {imagens.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`galeria-mini${i === foto ? ' ativa' : ''}`}
                    onClick={() => setFoto(i)}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    <img src={img} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Descrição: logo abaixo das fotos, perto do produto ── */}
          <section className="anuncio-descricao">
            <h2>Sobre a peça</h2>
            <p>{anuncio.descricao}</p>

            <dl className="anuncio-ficha">
              <div><dt>Estado</dt><dd>{estado.name}</dd></div>
              <div><dt>Categoria</dt><dd>{categoria || '—'}</dd></div>
              <div><dt>Bairro</dt><dd>{anuncio.bairro}</dd></div>
            </dl>
          </section>

          {/* ── Painel de compra ────────────────────── */}
          <aside className="anuncio-painel">
            {categoria && <p className="anuncio-categoria">{categoria}</p>}
            <h1 className="anuncio-titulo">{anuncio.titulo}</h1>
            <p className="anuncio-preco">{brl(anuncio.preco)}</p>

            <div className="anuncio-tags">
              <span className="anuncio-tag">{estado.name}</span>
              {anuncio.vendedor_recebe_pagamentos && (
                <span className="anuncio-tag positiva">Vendedor recebe pagamentos</span>
              )}
            </div>

            <p className="anuncio-local">
              <PlacaBairro bairro={anuncio.bairro} />
              {anuncio.cep && <span>CEP {anuncio.cep}</span>}
            </p>

            <div className="anuncio-acoes">
              <button
                type="button"
                className="btn-anuncio-comprar"
                onClick={comprar}
                disabled={!anuncio.vendedor_recebe_pagamentos}
              >
                Comprar agora
              </button>
              <button
                type="button"
                className="btn-anuncio-proposta"
                onClick={conversar}
                disabled={abrindoChat}
              >
                {abrindoChat ? 'Abrindo conversa…' : 'Conversar com o anunciante'}
              </button>
              <button
                type="button"
                className={`btn-anuncio-favorito${anuncio.favoritado ? ' ativo' : ''}`}
                onClick={alternarFavorito}
              >
                <IconHeart size={18} filled={anuncio.favoritado} />
                {anuncio.favoritado ? 'Salvo nos favoritos' : 'Salvar nos favoritos'}
              </button>
            </div>

            {!anuncio.vendedor_recebe_pagamentos && (
              <p className="anuncio-erro-pagamento">
                Este vendedor ainda não habilitou o recebimento de pagamentos pelo Mercado Pago.
                Você pode conversar com ele, mas a compra fica indisponível até lá.
              </p>
            )}

            {erroAcao && <p className="anuncio-erro-pagamento">{erroAcao}</p>}

            <p className="anuncio-nota">
              Pagamento com cartão em até 12x, processado pelo Mercado Pago.
            </p>

            <DicasSeguranca dicas={['pague-no-site', 'codigo-entrega', 'local-publico']} />

            <Link to={`/usuario/${anuncio.vendedor_id}`} className="anuncio-vendedor card">
              <span className="vendedor-avatar">{vendedor[0]?.toUpperCase()}</span>
              <div>
                <strong>{vendedor}</strong>
                <p>Anunciante em {anuncio.bairro} · Ver perfil</p>
              </div>
            </Link>

            <button type="button" className="anuncio-denunciar" onClick={() => setDenunciando(true)}>
              Denunciar este anúncio
            </button>
          </aside>
        </div>

        {/* ── Sugestões: 20 anúncios, 5 por vez, voltando ao início no fim ── */}
        {sugestoes.anuncios.length > 0 && (
          <div className="anuncio-sugestoes">
            <CarrosselAnuncios
              id="sugestoes"
              titulo={sugestoes.personalizadas ? 'Para você' : 'Você também pode gostar'}
              subtitulo={sugestoes.personalizadas
                ? 'Com base nos anúncios que você viu por aqui.'
                : 'Outros desapegos de Santo Amaro.'}
              anuncios={sugestoes.anuncios}
            />
          </div>
        )}
      </div>

      {/* ── Barra fixa no celular ───────────────────── */}
      <div className="anuncio-barra">
        <div>
          <span>{anuncio.titulo}</span>
          <strong>{brl(anuncio.preco)}</strong>
        </div>
        <button
          type="button"
          className="btn-anuncio-comprar"
          onClick={comprar}
          disabled={!anuncio.vendedor_recebe_pagamentos}
        >
          Comprar agora
        </button>
      </div>

      {denunciando && <ModalDenunciar anuncio={anuncio} aoFechar={() => setDenunciando(false)} />}
    </div>
  );
};

export default Anuncio;