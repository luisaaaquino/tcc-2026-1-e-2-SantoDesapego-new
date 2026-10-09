import { useState, useEffect } from 'react';
import './VerificacaoCodigo.css';
import './TransicaoPagina.css';
import { API_URL } from '../config';

/* ── Verificação em duas etapas ─────────────────────────────
   Tela do código de 6 dígitos enviado por e-mail, usada pelo
   Login (todo login com senha) e pelo Cadastro (confirmação do
   e-mail). `verificacao` vem da API: { desafio, email_mascarado,
   finalidade }. Ao acertar o código, a API devolve a sessão
   ({ token, usuario }) e a página decide o que fazer com ela. ── */
const INTERVALO_REENVIO = 60;

const VerificacaoCodigo = ({ verificacao, aoVerificar, aoVoltar }) => {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(INTERVALO_REENVIO);
  const [expirada, setExpirada] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const verificar = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) { setErro('Digite os 6 dígitos do código.'); return; }
    setEnviando(true);
    setErro('');
    setAviso('');
    try {
      const resposta = await fetch(`${API_URL}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desafio: verificacao.desafio, codigo }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Não foi possível verificar o código.');
        if (dados.reiniciar) setExpirada(true);
        setCodigo('');
        setEnviando(false);
        return;
      }
      aoVerificar(dados);
    } catch {
      setErro('Erro ao conectar com o servidor.');
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    setErro('');
    setAviso('');
    try {
      const resposta = await fetch(`${API_URL}/api/auth/reenviar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desafio: verificacao.desafio }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Não foi possível reenviar o código.');
        if (dados.reiniciar) setExpirada(true);
        return;
      }
      setAviso(dados.mensagem);
      setCodigo('');
      setEspera(INTERVALO_REENVIO);
    } catch {
      setErro('Erro ao conectar com o servidor.');
    }
  };

  const cadastro = verificacao.finalidade === 'cadastro';

  return (
    // Mesma entrada suave das trocas de página (TransicaoPagina.css):
    // a tela do código substitui o formulário sem mudar de rota.
    <div className="verificacao transicao-pagina">
      <div className="verificacao-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 5L2 7" />
        </svg>
      </div>
      <h2>{cadastro ? <>Confirme seu <em>e-mail</em></> : <>Verifique que <em>é você</em></>}</h2>
      <p>
        Enviamos um código de 6 dígitos para <strong>{verificacao.email_mascarado}</strong>.
        Ele vale 10 minutos. Confira também a caixa de spam.
      </p>

      {expirada ? (
        <button type="button" className="verificacao-btn" onClick={aoVoltar}>
          {cadastro ? 'Ir para o login' : 'Fazer login de novo'}
        </button>
      ) : (
        <form onSubmit={verificar} noValidate>
          <label htmlFor="codigo-verificacao" className="verificacao-label">Código</label>
          <input
            id="codigo-verificacao"
            className="verificacao-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button type="submit" className="verificacao-btn" disabled={enviando || codigo.length !== 6}>
            {enviando ? 'Verificando...' : cadastro ? 'Confirmar e entrar' : 'Entrar'}
          </button>
        </form>
      )}

      {erro && <p className="verificacao-erro" role="alert">{erro}</p>}
      {aviso && <p className="verificacao-aviso" role="status">{aviso}</p>}

      {!expirada && (
        <div className="verificacao-acoes">
          <button type="button" className="verificacao-link" onClick={reenviar} disabled={espera > 0}>
            {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
          </button>
          <button type="button" className="verificacao-link" onClick={aoVoltar}>
            {cadastro ? 'Fazer isso depois' : 'Voltar'}
          </button>
        </div>
      )}
    </div>
  );
};

export default VerificacaoCodigo;
