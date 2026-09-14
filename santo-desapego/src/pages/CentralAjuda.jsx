import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './CentralAjuda.css';
import NotificacoesSino from '../componentes/NotificacoesSino';
import SiteHeader from '../componentes/SiteHeader';

import { API_URL } from '../config';

const ASSUNTO_LABEL = {
  duvida_conta: 'Dúvidas sobre minha conta',
  anuncio: 'Problemas com um anúncio',
  pagamento: 'Pagamentos e Mercado Pago',
  denuncia_seguranca: 'Segurança ou denúncia',
  outro: 'Outro assunto',
};

const STATUS_LABEL = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  respondido: 'Respondido',
  encerrado: 'Encerrado',
};

const FAQ = [
  {
    pergunta: 'Como funciona o pagamento de uma compra?',
    resposta: 'Todo pagamento é processado pelo Mercado Pago. Você escolhe a forma de pagamento disponível no ambiente seguro deles — o Santo Desapego nunca vê nem guarda os dados do seu pagamento.',
  },
  {
    pergunta: 'Como denuncio um anúncio ou usuário?',
    resposta: 'Na página do anúncio ou do perfil, use a opção de denúncia. Nossa equipe analisa cada denúncia e pode suspender contas ou remover anúncios que violem os Termos de Uso.',
  },
  {
    pergunta: 'Posso excluir minha conta e meus dados?',
    resposta: 'Sim. Em conformidade com a LGPD, você pode solicitar a exclusão da sua conta a qualquer momento pelo seu perfil. Registros financeiros são mantidos por até 5 anos por exigência legal.',
  },
  {
    pergunta: 'O que faço se o vendedor ou comprador não responder?',
    resposta: 'Envie uma mensagem por aqui contando o que houve, com o link do anúncio se possível. Um administrador vai analisar e entrar em contato.',
  },
];

const CentralAjuda = () => {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);

  const [assunto, setAssunto] = useState('duvida_conta');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [solicitacoes, setSolicitacoes] = useState(null);

  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('sd_usuario');
    if (usuarioSalvo) {
      try {
        setUsuario(JSON.parse(usuarioSalvo));
      } catch {
        localStorage.removeItem('sd_usuario');
        localStorage.removeItem('sd_token');
      }
    }
  }, []);

  const carregarSolicitacoes = useCallback(() => {
    const token = localStorage.getItem('sd_token');
    if (!token) return;

    fetch(`${API_URL}/api/suporte`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((dados) => setSolicitacoes(dados.solicitacoes || []))
      .catch(() => {});
  }, []);

  useEffect(() => { if (usuario) carregarSolicitacoes(); }, [usuario, carregarSolicitacoes]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!usuario) { navigate('/login'); return; }
    if (!mensagem.trim()) { setErro('Escreva sua mensagem antes de enviar.'); return; }

    setEnviando(true);
    setErro('');
    setSucesso('');

    try {
      const token = localStorage.getItem('sd_token');
      const res = await fetch(`${API_URL}/api/suporte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assunto, mensagem: mensagem.trim() }),
      });
      const dados = await res.json();

      if (!res.ok) {
        setErro(dados.erro || 'Não foi possível enviar sua mensagem.');
        return;
      }

      setSucesso(dados.mensagem_confirmacao || 'Mensagem enviada! Nossa equipe vai responder em breve.');
      setMensagem('');
      carregarSolicitacoes();
    } catch {
      setErro('Erro ao conectar com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ajuda-wrapper">
      <SiteHeader>
        <NotificacoesSino />
        <Link to="/explorar" className="nav-btn">Explorar</Link>
        <Link to="/sobre" className="nav-btn">Sobre nós</Link>
      </SiteHeader>

      <div className="ajuda-container">
        <h1 className="ajuda-titulo">Central de <em>ajuda</em></h1>
        <p className="ajuda-subtitulo">
          Encontre respostas rápidas abaixo ou fale diretamente com a nossa equipe de suporte.
          Toda mensagem enviada por aqui vai direto para os administradores da plataforma.
        </p>

        <div className="ajuda-grid">
          {/* ── FAQ ── */}
          <section className="ajuda-bloco">
            <h2>Perguntas frequentes</h2>
            <div className="ajuda-faq-lista">
              {FAQ.map((item) => (
                <details key={item.pergunta} className="ajuda-faq-item">
                  <summary>{item.pergunta}</summary>
                  <p>{item.resposta}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ── Fale com o suporte ── */}
          <aside className="ajuda-bloco ajuda-form-bloco">
            <h2>Fale com o suporte</h2>

            {!usuario ? (
              <div className="ajuda-login-cta">
                <p>Você precisa estar logado para enviar uma mensagem ao suporte.</p>
                <Link to="/login" className="btn-ajuda">Entrar na minha conta</Link>
              </div>
            ) : (
              <form onSubmit={enviar} className="ajuda-form">
                {erro && <div className="ajuda-alerta erro">{erro}</div>}
                {sucesso && <div className="ajuda-alerta sucesso">{sucesso}</div>}

                <label htmlFor="assunto">Assunto</label>
                <select id="assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)}>
                  {Object.entries(ASSUNTO_LABEL).map(([valor, label]) => (
                    <option key={valor} value={valor}>{label}</option>
                  ))}
                </select>

                <label htmlFor="mensagem">Sua mensagem</label>
                <textarea
                  id="mensagem"
                  rows={5}
                  maxLength={2000}
                  placeholder="Conte com detalhes o que está acontecendo..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />

                <button type="submit" className="btn-ajuda" disabled={enviando}>
                  {enviando ? 'Enviando...' : 'Enviar mensagem'}
                </button>
              </form>
            )}

            {usuario && solicitacoes && solicitacoes.length > 0 && (
              <div className="ajuda-historico">
                <h3>Suas solicitações</h3>
                <ul>
                  {solicitacoes.map((s) => (
                    <li key={s.id} className="ajuda-historico-item">
                      <div className="ajuda-historico-topo">
                        <strong>{ASSUNTO_LABEL[s.assunto] || s.assunto}</strong>
                        <span className={`ajuda-badge ${s.status}`}>{STATUS_LABEL[s.status] || s.status}</span>
                      </div>
                      <p className="ajuda-historico-msg">{s.mensagem}</p>
                      {s.resposta && (
                        <p className="ajuda-historico-resposta">
                          <strong>Resposta da equipe:</strong> {s.resposta}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>

      <footer className="site-footer">
        <span>© 2026 Santo Desapego — Projeto acadêmico TCC · SENAC Santo Amaro</span>
      </footer>
    </div>
  );
};

export default CentralAjuda;
