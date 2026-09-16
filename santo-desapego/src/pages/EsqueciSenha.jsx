import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Login.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

import { API_URL } from '../config';

const EsqueciSenha = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const resposta = await fetch(`${API_URL}/api/auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErrorMsg(dados.erro || 'Não foi possível processar sua solicitação.');
        setSubmitting(false);
        return;
      }

      setEnviado(true);
    } catch {
      setErrorMsg('Não foi possível conectar ao servidor. O back-end está rodando?');
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="announcement">
        🌱 Economia circular em Santo Amaro:{' '}
        <strong>já evitamos 2,4 toneladas</strong> de descarte neste mês.
      </div>

      <SiteHeader variant="auth-nav-top">
        <NavBackButton to="/">Voltar para a home</NavBackButton>
        <Link to="/cadastro" className="btn-sell">+ Criar conta</Link>
      </SiteHeader>

      <main className="auth-container">
        <aside className="auth-visual">
          <div className="auth-stamp" aria-hidden="true">
            Sua<br />conta<br />protegida
          </div>

          <div className="auth-visual-foot">
            <span className="badge">
              <span className="badge-dot" />
              Segurança da conta
            </span>
            <h2>Esqueceu a senha?<br /><em>Sem problema.</em></h2>
            <p className="auth-lede">
              Informe o e-mail cadastrado e enviaremos um link seguro para você
              criar uma nova senha. O link expira em 1 hora.
            </p>
          </div>
        </aside>

        <section className="auth-form-side">
          <div className="login-card">
            <div className="form-header">
              <Link to="/" className="logo auth-logo">
                <span className="logo-mark">SD</span>
                Santo <em>Desapego</em>
              </Link>
              <h1>Recuperar <em>senha</em></h1>
              <p className="form-sub">
                {enviado
                  ? 'Verifique sua caixa de entrada.'
                  : 'Digite o e-mail da sua conta para receber o link de redefinição.'}
              </p>
            </div>

            {enviado ? (
              <div style={{
                background: '#F0F8EF', border: '1.5px solid var(--forest)',
                color: 'var(--forest)', padding: '0.9rem 1rem',
                borderRadius: '10px', fontSize: '0.88rem', lineHeight: 1.5,
              }}>
                Se <strong>{email}</strong> estiver cadastrado, você vai receber um
                e-mail com o link para redefinir sua senha em instantes.
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="input-group">
                  <label htmlFor="email">E-mail</label>
                  <div className="input-with-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 5L2 7" />
                    </svg>
                    <input type="email" id="email" name="email" placeholder="seu@email.com"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email" required />
                  </div>
                </div>

                {errorMsg && (
                  <div style={{
                    background: '#FFF5F3', border: '1.5px solid var(--terracotta)',
                    color: 'var(--terracotta)', padding: '0.65rem 0.9rem',
                    borderRadius: '10px', fontSize: '0.85rem',
                    marginBottom: '0.5rem', display: 'flex',
                    alignItems: 'center', gap: '0.5rem',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errorMsg}
                  </div>
                )}

                <button type="submit" className="btn-login" disabled={submitting}>
                  {submitting ? 'Enviando...' : (
                    <>Enviar link de recuperação
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}

            <p className="auth-foot-link">
              Lembrou a senha? <Link to="/login">Voltar para o login</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="auth-mini-footer">
        © 2026 Santo Desapego
      </footer>
    </div>
  );
};

export default EsqueciSenha;
