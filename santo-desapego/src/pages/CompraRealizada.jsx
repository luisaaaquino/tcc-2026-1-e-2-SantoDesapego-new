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

  // Busca o anúncio comprado
  useEffect(() => {
    if (!anuncioId || anuncio) return;

    fetch(`${API_URL}/api/anuncios/${anuncioId}`)
      .then((r) => r.json())
      .then((dados) => { if (dados.anuncio) setAnuncio(dados.anuncio); })
      .catch((e) => console.error('[compra] anuncio', e));
  }, [anuncioId, anuncio]);

  // Confirma o status do pagamento direto no Mercado Pago
  useEffect(() => {
    if (!paymentId) { setCarregando(false); return; }

    fetch(`${API_URL}/api/pagamentos/${paymentId}`)
      .then((r) => r.json())
      .then((dados) => { if (dados.pagamento) setPagamento(dados.pagamento); })
      .catch((e) => console.error('[compra] pagamento', e))
      .finally(() => setCarregando(false));
  }, [paymentId]);

  // Grava a compra no banco assim que o pagamento é confirmado como aprovado
  useEffect(() => {
    if (!paymentId || pagamento?.status !== 'approved') return;

    const token = localStorage.getItem('sd_token');
    if (!token) return;

    fetch(`${API_URL}/api/compras/confirmar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ payment_id: paymentId }),
    }).catch((e) => console.error('[compra] confirmar', e));
  }, [paymentId, pagamento]);

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
      titulo: 'Separação',
      texto: 'O vendedor confirma o horário de retirada em até 1 dia útil.',
    },
    {
      n: '03',
      titulo: 'Retirada',
      texto: 'Você recebe um aviso quando a peça estiver pronta no ponto combinado.',
    },
    {
      n: '04',
      titulo: 'Nova casa',
      texto: 'Conte pra gente como ficou. A história da peça continua com você.',
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
            ? 'Guarde o número do pagamento: é ele que identifica você na hora da retirada.'
            : 'Alguns cartões levam alguns minutos para aprovar. Você recebe um e-mail assim que sair o resultado.'}
        </p>

        <div className="compra-hero__acoes">
          <Link className="btn btn--solido" to="/explorar">Continuar garimpando</Link>
          <Link className="btn btn--vazado" to="/perfil">Ir para meu perfil</Link>
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
            <div><dt>Frete</dt><dd>Retirada gratuita</dd></div>
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
            <p><span>Retirada</span>{anuncio.bairro}</p>
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
          Dá para alterar o ponto de retirada enquanto o pedido estiver na etapa de separação.
          Depois disso, fale direto com o vendedor.
        </p>
        <Link className="btn btn--creme" to="/sobre">Falar com o suporte</Link>
      </section>
    </main>
  );
}