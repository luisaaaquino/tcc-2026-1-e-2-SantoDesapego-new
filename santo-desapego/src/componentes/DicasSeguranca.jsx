import { Link } from 'react-router-dom';
import { IconShield } from './Icones';
import './DicasSeguranca.css';

/* ── Dicas de segurança para comprar e vender ─────────────────
   O texto fica só aqui, pra não divergir entre as telas.
   - variante="compacta": quadrinho com as dicas de um momento
     específico (anúncio, checkout, chat...) + link pra lista toda.
   - variante="completa": a lista inteira, por público (Central de
     Ajuda, seção #seguranca).
   As dicas seguem o fluxo real do site: o pagamento fica retido no
   Mercado Pago até o comprador confirmar a entrega com o código. ── */
const DICAS = {
  comprador: {
    titulo: 'Para quem compra',
    itens: [
      { id: 'pague-no-site', texto: 'Pague sempre pelo site: o valor fica retido e só é liberado ao vendedor quando você confirma o recebimento.' },
      { id: 'codigo-entrega', texto: 'Só informe o código de entrega depois de receber e conferir o produto.' },
      { id: 'local-publico', texto: 'Combine a entrega num lugar público e movimentado, de preferência durante o dia.' },
      { id: 'confira', texto: 'Confira o produto (funcionamento e defeitos) antes de confirmar o recebimento.' },
      { id: 'preco-baixo', texto: 'Desconfie de preço muito abaixo do mercado e de pressa ("tem outro interessado, paga agora").' },
    ],
  },
  vendedor: {
    titulo: 'Para quem vende',
    itens: [
      { id: 'entregue-pago', texto: 'Só entregue o produto depois que a venda aparecer como paga no site.' },
      { id: 'sem-comprovante', texto: 'Nunca aceite comprovante de Pix ou depósito feito fora da plataforma.' },
      { id: 'declare-defeitos', texto: 'Declare os defeitos no anúncio: evita desacordo na hora da entrega.' },
    ],
  },
  todos: {
    titulo: 'Para todo mundo',
    itens: [
      { id: 'chat-do-site', texto: 'Converse pelo chat do site: a conversa fica registrada se você precisar do suporte.' },
      { id: 'links-externos', texto: 'Não clique em links de pagamento enviados por outra pessoa nem pague por fora.' },
      { id: 'senha-codigos', texto: 'Nunca compartilhe sua senha nem os códigos de verificação que chegam por e-mail.' },
    ],
  },
};

const todasAsDicas = Object.values(DICAS).flatMap((g) => g.itens);

const DicasSeguranca = ({ variante = 'compacta', dicas = [], titulo = 'Compra segura' }) => {
  if (variante === 'completa') {
    return (
      <div className="dicas-seg-completa">
        {Object.entries(DICAS).map(([chave, grupo]) => (
          <div key={chave} className="dicas-seg-grupo">
            <h3>{grupo.titulo}</h3>
            <ul>
              {grupo.itens.map((d) => <li key={d.id}>{d.texto}</li>)}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const itens = dicas.map((id) => todasAsDicas.find((d) => d.id === id)).filter(Boolean);
  return (
    <aside className="dicas-seg" aria-label={titulo}>
      <p className="dicas-seg-titulo">
        <IconShield size={16} />
        {titulo}
      </p>
      <ul>
        {itens.map((d) => <li key={d.id}>{d.texto}</li>)}
      </ul>
      <Link to="/central-ajuda#seguranca" className="dicas-seg-link">Ver todas as dicas de segurança</Link>
    </aside>
  );
};

export default DicasSeguranca;
