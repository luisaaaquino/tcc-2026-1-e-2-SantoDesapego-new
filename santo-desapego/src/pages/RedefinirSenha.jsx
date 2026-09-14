import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Login.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

const API_URL = 'http://localhost:8080';

const IconEye = (open) => open
  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;

const RedefinirSenha = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [strength, setStrength] = useState({ score: 0, label: '', cls: '' });

  const checkStrength = (val) => {
    if (!val) { setStrength({ score: 0, label: '', cls: '' }); return; }
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = ['weak', 'weak', 'medium', 'strong'];
    const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte'];
    setStrength({ score, cls: levels[score - 1] || 'weak', label: `Força: ${labels[score - 1] || 'Muito fraca'}` });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!token) {
      setErrorMsg('Link inválido. Solicite a recuperação de senha novamente.');
      return;
    }
    if (novaSenha !== confirmar) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const resposta = await fetch(`${API_URL}/api/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErrorMsg(dados.erro || 'Não foi possível redefinir sua senha.');
        setSubmitting(false);
        return;
      }

      setSucesso(true);
      setTimeout(() => navigate('/login'), 2500);
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
      </SiteHeader>

      <main className="auth-container">
        <aside className="auth-visual">
          <div className="auth-stamp" aria-hidden="true">
            Nova<br />senha<br />segura
          </div>

          <div className="auth-visual-foot">
            <span className="badge">
              <span className="badge-dot" />
              Última etapa
            </span>
            <h2>Escolha uma<br /><em>nova senha.</em></h2>
            <p className="auth-lede">
              Use uma senha forte: mínimo de 8 caracteres, com maiúsculas,
              minúsculas, número e um caractere especial.
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
              <h1>Redefinir <em>senha</em></h1>
              <p className="form-sub">
                {sucesso ? 'Tudo pronto!' : 'Crie a nova senha da sua conta.'}
              </p>
            </div>

            {!token && !sucesso && (
              <div style={{
                background: '#FFF5F3', border: '1.5px solid var(--terracotta)',
                color: 'var(--terracotta)', padding: '0.75rem 1rem',
                borderRadius: '10px', fontSize: '0.85rem', marginBottom: '1rem',
              }}>
                Este link está incompleto ou inválido.{' '}
                <Link to="/esqueci-senha" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  Solicite um novo link.
                </Link>
              </div>
            )}

            {sucesso ? (
              <div style={{
                background: '#F0F8EF', border: '1.5px solid var(--forest)',
                color: 'var(--forest)', padding: '0.9rem 1rem',
                borderRadius: '10px', fontSize: '0.88rem', lineHeight: 1.5,
              }}>
                Senha redefinida com sucesso! Redirecionando para o login...
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="input-group">
                  <label htmlFor="novaSenha">Nova senha</label>
                  <div className="input-with-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input type={showNova ? 'text' : 'password'} id="novaSenha" name="novaSenha"
                      placeholder="Mínimo 8 caracteres com maiúscula, número e símbolo"
                      value={novaSenha}
                      onChange={(e) => { setNovaSenha(e.target.value); checkStrength(e.target.value); }}
                      autoComplete="new-password" required minLength={8} disabled={!token} />
                    <button type="button" className="toggle-pw"
                      onClick={() => setShowNova((s) => !s)}
                      aria-label={showNova ? 'Esconder senha' : 'Mostrar senha'}>
                      {IconEye(showNova)}
                    </button>
                  </div>
                  {novaSenha && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className={`strength-seg${i < strength.score ? ' ' + strength.cls : ''}`} />
                        ))}
                      </div>
                      <span className={`strength-label ${strength.cls}`}>{strength.label}</span>
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label htmlFor="confirmar">Confirmar nova senha</label>
                  <div className="input-with-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input type={showConfirmar ? 'text' : 'password'} id="confirmar" name="confirmar"
                      placeholder="Repita a nova senha"
                      value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
                      autoComplete="new-password" required disabled={!token} />
                    <button type="button" className="toggle-pw"
                      onClick={() => setShowConfirmar((s) => !s)}
                      aria-label={showConfirmar ? 'Esconder senha' : 'Mostrar senha'}>
                      {IconEye(showConfirmar)}
                    </button>
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

                <button type="submit" className="btn-login" disabled={submitting || !token}>
                  {submitting ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            )}

            <p className="auth-foot-link">
              <Link to="/login">Voltar para o login</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="auth-mini-footer">
        © 2026 Santo Desapego — Projeto acadêmico TCC · Centro Universitário Senac Santo Amaro
      </footer>
    </div>
  );
};

export default RedefinirSenha;
