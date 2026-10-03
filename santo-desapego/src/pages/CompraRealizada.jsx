import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import './CompraRealizada.css';

import { API_URL } from '../config';

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CompraRealizada() {
  const [searchParams] = useSearchParams();
  const { state } = useLocation();

  // Parâmetros que o Mercado Pago devolve na URL de retorno
  const paymentId  = searchParams.get('payment_id');
  const statusUrl  = searchParams.get('status');
  const anuncioId  = searchParams.get('external_reference');

  const [anuncio, setAnuncio]     = useState(state?.anuncio || null);
  const [pagamento, setPagamento] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(anuncioId || paymentId));
  // Token de entrega (seção 2.3 / RN05) — devolvido ao registrar a compra
  const [codigoEntrega, setCodigoEntrega] = useState(null);

  // Busca o anúncio comprado
  useEffect(() => {
    if (!anuncioId || anuncio) return;

    fetch(`${API_URL}/api/anuncios/${anuncioId}`)
      .then((r) => r.json())
      .then((dados) => { if (dados.anuncio) setAnuncio(dados.anuncio); })
      .catch((e) => console.error('[compra] anuncio', e));
  }, [anuncioId, anuncio]);

  // Confirma o status do pagamento direto no Mercado Pago
  // [Marketplace] Precisa do anuncio_id (external_reference) porque a
  // consulta usa o access_token do VENDEDOR dono daquele anúncio, não
  // o da plataforma — cada preference foi criada com a conta dele.
  useEffect(() => {
    if (!paymentId || !anuncioId) { setCarregando(false); return; }

    fetch(`${API_URL}/api/pagamentos/${paymentId}?anuncio_id=${anuncioId}`)
      .then((r) => r.json())
      .then((dados) => { if (dados.pagamento) setPagamento(dados.pagamento); })
      .catch((e) => console.error('[compra] pagamento', e))
      .finally(() => setCarregando(false));
  }, [paymentId, anuncioId]);

  // Grava a compra no banco assim que o pagamento é confirmado como aprovado
  useEffect(() => {
    if (!paymentId || !anuncioId || pagamento?.status !== 'approved') return;

    const token = localStorage.getItem('sd_token');
    if (!token) return;

    fetch(`${API_URL}/api/compras/confirmar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ payment_id: paymentId, anuncio_id: anuncioId }),
    })
      .then((r) => r.json())
      .then((dados) => {
        const compra = dados.compra;
        if (compra?.codigo_entrega && !compra.entrega_confirmada_em) {
          setCodigoEntrega(compra.codigo_entrega);
        }
      })
      .catch((e) => console.error('[compra] confirmar', e));
  }, [paymentId, anuncioId, pagamento]);

  const status = pagamento?.status || statusUrl || 'approved';
  const aprovado = status === 'approved';

  const etapas = [
    {
      n: '01',
      titulo: aprovado ? 'Pagamento aprovado' : 'Pagamento em análise',
      texto: aprovado
        ? 'O Mercado Pago confirmou a cobrança. O comprovante foi para o seu e-mail.'
        : 'O Mercado Pago ainda está processando. Assim que aprovar, avisamos o vendedor.',
    },
    {
      n: '02',
      titulo: 'Combinar a entrega',
      texto: 'Fale com o vendedor pelas mensagens para combinar como e quando você recebe a peça.',
    },
    {
      n: '03',
      titulo: 'Entrega',
      texto: 'Com a peça em mãos, passe seu código de entrega ao vendedor. Ele digita o código e a entrega fica confirmada.',
    },
    {
      n: '04',
      titulo: 'Avaliação',
      texto: 'Com a entrega confirmada, avalie o vendedor no seu perfil. A história da peça continua com você.',
    },
  ];

  if (carregando) {
    return (
      <main className="compra">
        <section className="compra-hero">
          <h1 className="compra-hero__titulo">Confirmando o pagamento...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="compra">
      <section className="compra-hero">
        <span className="compra-hero__marca" aria-hidden="true">ACHOU</span>

        {paymentId && <p className="compra-hero__selo">Pagamento {paymentId}</p>}

        <h1 className="compra-hero__titulo">
          {aprovado ? (
            <>Compra realizada.<br />A peça <em>achou</em> uma nova casa.</>
          ) : (
            <>Pagamento <em>em análise</em>.<br />Já já confirmamos.</>
          )}
        </h1>

        <p className="compra-hero__texto">
          {aprovado
            ? 'Guarde o número do pagamento: é ele que identifica a sua compra se precisar falar com o vendedor ou com o suporte.'
            : 'Alguns cartões levam alguns minutos para aprovar. Você recebe um e-mail assim que sair o resultado.'}
        </p>

        {aprovado && codigoEntrega && (
          <div className="compra-codigo">
            <span className="compra-codigo__label">Seu código de entrega</span>
            <strong className="compra-codigo__valor">
              {codigoEntrega.replace(/^(\d{3})(\d{3})$/, '$1 $2')}
            </strong>
            <p>
              Passe este código ao vendedor <b>só quando estiver com a peça em mãos</b>.
              Ele também fica salvo em "Compras realizadas", no seu perfil, e foi para o seu e-mail.
            </p>
          </div>
        )}

        <div className="compra-hero__acoes">
          <Link className="btn btn--solido" to="/explorar">Continuar garimpando</Link>
          <Link className="btn btn--vazado" to="/perfil?aba=compras">Ver minhas compras</Link>
        </div>
      </section>

      {anuncio && (
        <section className="compra-resumo">
          <h2 className="compra-titulo">O que você levou</h2>

          <ul className="resumo-lista">
            <li className="resumo-item">
              <div className="resumo-item__info">
                <h3>{anuncio.titulo}</h3>
                <p>{anuncio.vendedor_nome || 'Vendedor'} · peça única</p>
              </div>
              <span className="resumo-item__preco">{brl(anuncio.preco)}</span>
            </li>
          </ul>

          <dl className="resumo-conta">
            <div><dt>Subtotal</dt><dd>{brl(anuncio.preco)}</dd></div>
            <div className="resumo-conta__total">
              <dt>Total</dt>
              <dd>{brl(pagamento?.valor ?? anuncio.preco)}</dd>
            </div>
          </dl>

          <div className="resumo-meta">
            <p>
              <span>Pagamento</span>
              {pagamento
                ? `${pagamento.metodo} · ${pagamento.parcelas}x · ${aprovado ? 'aprovado' : status}`
                : 'Cartão via Mercado Pago'}
            </p>
            <p><span>Bairro</span>{anuncio.bairro}</p>
          </div>
        </section>
      )}

      <section className="compra-etapas">
        <h2 className="compra-titulo">O que acontece agora</h2>
        <ol className="etapas">
          {etapas.map((etapa, i) => (
            <li className={`etapa${i === 0 ? ' etapa--ativa' : ''}`} key={etapa.n}>
              <span className="etapa__n" aria-hidden="true">{etapa.n}</span>
              <h3 className="etapa__titulo">{etapa.titulo}</h3>
              <p className="etapa__texto">{etapa.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="compra-ajuda">
        <h2>Precisa mudar alguma coisa?</h2>
        <p>
          Fale direto com o vendedor pelas mensagens para ajustar a entrega.
          Se não resolver, nosso suporte ajuda.
        </p>
        <div className="compra-ajuda__acoes">
          <Link className="btn btn--creme" to="/mensagens">Ir para mensagens</Link>
          <Link className="btn btn--creme" to="/sobre">Falar com o suporte</Link>
        </div>
      </section>
    </main>
  );
}