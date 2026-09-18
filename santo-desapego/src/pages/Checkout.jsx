import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import './Checkout.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

import { API_URL } from '../config';

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ESTADO_LABEL = {
  'novo':        'Novo / Na caixa',
  'seminovo':    'Seminovo',
  'usado':       'Usado',
  'para-reparo': 'Para reparo',
};

const Checkout = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const falhou = searchParams.get('falhou');

  const [anuncio, setAnuncio]   = useState(null);
  const [usuario, setUsuario]   = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aceite, setAceite]     = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro]         = useState('');

  const token = localStorage.getItem('sd_token');

  // ── Carrega anúncio + dados do comprador ──────────────────
  useEffect(() => {
    if (!token) { navigate('/login'); return; }

    Promise.all([
      fetch(`${API_URL}/api/anuncios/${id}`).then((r) => r.json()),
      fetch(`${API_URL}/api/usuario/perfil`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([dadosAnuncio, dadosPerfil]) => {
        if (dadosAnuncio.anuncio) setAnuncio(dadosAnuncio.anuncio);
        else setErro(dadosAnuncio.erro || 'Anúncio não encontrado.');

        if (dadosPerfil.usuario) setUsuario(dadosPerfil.usuario);
      })
      .catch(() => setErro('Erro ao conectar com o servidor.'))
      .finally(() => setCarregando(false));
  }, [id, token, navigate]);

  // ── Vai para o Mercado Pago ───────────────────────────────
  const irParaPagamento = async () => {
    if (!aceite || enviando) return;

    setEnviando(true);
    setErro('');

    try {
      const res = await fetch(`${API_URL}/api/pagamentos/preferencia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anuncio_id: anuncio.id }),
      });

      const dados = await res.json();

      if (!res.ok || !dados.init_point) {
        setErro(dados.erro || 'Não foi possível iniciar o pagamento.');
        setEnviando(false);
        return;
      }

      // Sai do site e vai para o checkout seguro do Mercado Pago
      window.location.href = dados.init_point;
    } catch {
      setErro('Erro ao conectar com o servidor.');
      setEnviando(false);
    }
  };

  const Header = () => (
    <SiteHeader>
      <NotificacoesSino />
      <NavBackButton to={`/anuncio/${id}`}>Voltar para o anúncio</NavBackButton>
    </SiteHeader>
  );

  if (carregando) {
    return (
      <div className="checkout-wrapper">
        <Header />
        <div className="checkout-estado">Carregando seu pedido...</div>
      </div>
    );
  }

  if (!anuncio) {
    return (
      <div className="checkout-wrapper">
        <Header />
        <div className="checkout-estado">
          <h2>Não foi possível abrir este pedido</h2>
          <p>{erro}</p>
          <Link to="/explorar" className="btn-checkout">Ver outros desapegos →</Link>
        </div>
      </div>
    );
  }

  const indisponivel = anuncio.status !== 'ativo';
  const meuProprioAnuncio = usuario && anuncio.vendedor_id === usuario.id;
  const vendedorSemPagamentos = !anuncio.vendedor_recebe_pagamentos;
  const bloqueado = indisponivel || meuProprioAnuncio || vendedorSemPagamentos;

  return (
    <div className="checkout-wrapper">
      <Header />

      <div className="checkout-container">

        {/* ── Etapas ── */}
        <ol className="checkout-etapas">
          <li className="atual"><span>1</span> Revisão do pedido</li>
          <li><span>2</span> Pagamento</li>
          <li><span>3</span> Confirmação</li>
        </ol>

        <h1 className="checkout-titulo">Confira antes de pagar</h1>

        {falhou && (
          <div className="checkout-alerta erro">
            O pagamento anterior não foi concluído. Você pode tentar de novo.
          </div>
        )}
        {indisponivel && (
          <div className="checkout-alerta erro">
            Este anúncio não está mais disponível para compra.
          </div>
        )}
        {meuProprioAnuncio && (
          <div className="checkout-alerta erro">
            Este anúncio é seu — não dá para comprar de você mesmo.
          </div>
        )}
        {!indisponivel && !meuProprioAnuncio && vendedorSemPagamentos && (
          <div className="checkout-alerta erro">
            Este vendedor ainda não habilitou o recebimento de pagamentos pelo Mercado Pago.
            A compra fica indisponível até lá.
          </div>
        )}

        <div className="checkout-grid">

          {/* ── Coluna esquerda: revisão ── */}
          <div className="checkout-conteudo">

            {/* Item */}
            <section className="checkout-bloco">
              <h2>O que você está levando</h2>

              <div className="checkout-item">
                {anuncio.imagens?.[0]
                  ? <img src={anuncio.imagens[0]} alt={anuncio.titulo} />
                  : <span className="checkout-sem-foto">📦</span>}

                <div className="checkout-item-info">
                  <h3>{anuncio.titulo}</h3>
                  <p className="checkout-item-tags">
                    {ESTADO_LABEL[anuncio.estado_conservacao] || anuncio.estado_conservacao}
                    {anuncio.categoria_nome && ` · ${anuncio.categoria_nome}`}
                  </p>
                  <p className="checkout-item-vendedor">
                    Anunciado por {anuncio.vendedor_nome || 'vendedor'}
                  </p>
                </div>

                <span className="checkout-item-preco">{brl(anuncio.preco)}</span>
              </div>
            </section>

            {/* Retirada */}
            <section className="checkout-bloco">
              <h2>Como você recebe</h2>

              <div className="checkout-linha">
                <span className="checkout-rotulo">Retirada combinada</span>
                <span>{anuncio.bairro}</span>
              </div>
              <div className="checkout-linha">
                <span className="checkout-rotulo">Frete</span>
                <span className="checkout-gratis">Grátis</span>
              </div>

              <p className="checkout-nota">
                O Santo Desapego é hiperlocal: você combina o ponto de encontro com o
                anunciante pelo chat, dentro de Santo Amaro.
              </p>
            </section>

            {/* Comprador */}
            {usuario && (
              <section className="checkout-bloco">
                <h2>Seus dados</h2>

                <div className="checkout-linha">
                  <span className="checkout-rotulo">Nome</span>
                  <span>{usuario.nome} {usuario.sobrenome}</span>
                </div>
                <div className="checkout-linha">
                  <span className="checkout-rotulo">E-mail</span>
                  <span>{usuario.email}</span>
                </div>
                <div className="checkout-linha">
                  <span className="checkout-rotulo">Bairro</span>
                  <span>{usuario.bairro || '—'}</span>
                </div>

                <p className="checkout-nota">
                  Algo errado? <Link to="/perfil">Editar no meu perfil</Link>
                </p>
              </section>
            )}

            {/* Pagamento */}
            <section className="checkout-bloco">
              <h2>Pagamento</h2>

              <p className="checkout-nota">
                Ao continuar, você será redirecionado para o ambiente seguro do
                Mercado Pago, onde escolhe a forma de pagamento disponível e finaliza
                a compra. O Santo Desapego nunca vê nem guarda os dados do seu pagamento.
              </p>
            </section>
          </div>

          {/* ── Coluna direita: resumo ── */}
          <aside className="checkout-resumo">
            <h2>Resumo</h2>

            <div className="checkout-linha">
              <span>Subtotal</span>
              <span>{brl(anuncio.preco)}</span>
            </div>
            <div className="checkout-linha">
              <span>Frete</span>
              <span className="checkout-gratis">Grátis</span>
            </div>

            <div className="checkout-total">
              <span>Total</span>
              <strong>{brl(anuncio.preco)}</strong>
            </div>

            <label className="checkout-aceite">
              <input
                type="checkbox"
                checked={aceite}
                onChange={(e) => setAceite(e.target.checked)}
                disabled={bloqueado}
              />
              <span>
                Conferi os dados acima e concordo com os Termos de Uso do
                Santo Desapego.
              </span>
            </label>

            {erro && <p className="checkout-alerta erro">{erro}</p>}

            <button
              type="button"
              className="btn-checkout"
              onClick={irParaPagamento}
              disabled={!aceite || enviando || bloqueado}
            >
              {enviando ? 'Abrindo pagamento...' : 'Ir para o pagamento →'}
            </button>

            <Link to={`/anuncio/${id}`} className="checkout-cancelar">
              Cancelar
            </Link>

            <p className="checkout-selo">
              🔒 Pagamento processado pelo Mercado Pago
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;