import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import './Login.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

const API_URL = 'http://localhost:8080';

const GOOGLE_CLIENT_ID = '113184048014-ramhhojnofdd511oh1nl3h2ibono7581.apps.googleusercontent.com';

// ============================================================
//  Componente interno (precisa ficar dentro do Provider)
// ============================================================
const LoginContent = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    remember: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errorMsg) setErrorMsg('');
  };

  // ============================================================
  //  LOGIN MANUAL (e-mail + senha)
  // ============================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const resposta = await fetch(`${API_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          senha: formData.password,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErrorMsg(dados.erro || 'Não foi possível fazer login.');
        setSubmitting(false);
        return;
      }

      localStorage.setItem('sd_token',   dados.token);
      localStorage.setItem('sd_usuario', JSON.stringify(dados.usuario));
      navigate('/');

    } catch (erro) {
      console.error('Erro ao conectar com o servidor:', erro);
      setErrorMsg('Não foi possível conectar ao servidor. O back-end está rodando?');
      setSubmitting(false);
    }
  };

  // ============================================================
  //  LOGIN COM GOOGLE
  // ============================================================
  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setSubmitting(true);
      setErrorMsg('');

      try {
        const resposta = await fetch(`${API_URL}/api/auth/google`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: tokenResponse.access_token }),
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
          if (dados.precisaCadastro) {
            if (window.confirm(`${dados.erro}\n\nQuer ir pra tela de cadastro agora?`)) {
              navigate('/cadastro');
              return;
            }
          }
          setErrorMsg(dados.erro || 'Não foi possível fazer login com Google.');
          setSubmitting(false);
          return;
        }

        localStorage.setItem('sd_token',   dados.token);
        localStorage.setItem('sd_usuario', JSON.stringify(dados.usuario));
        navigate('/');
      } catch (erro) {
        console.error('Erro Google:', erro);
        setErrorMsg('Erro ao validar conta Google.');
        setSubmitting(false);
      }
    },
    onError: () => setErrorMsg('Login com Google cancelado.'),
  });

  const polaroids = [
    {
      src: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80',
      title: 'Sofá retrô anos 70', price: 'R$ 950', hood: 'Jardim Marajoara',
    },
    {
      src: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400&q=80',
      title: 'Canon AE-1 analógica', price: 'R$ 380', hood: 'Campo Belo',
    },
    {
      src: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80',
      title: 'Cafeteira italiana', price: 'R$ 65', hood: 'Brooklin',
    },
    {
      src: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80',
      title: 'Nike Air Max 90', price: 'R$ 220', hood: 'Vila Mascote',
    },
  ];

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

        {/* ════ PAINEL ESQUERDO ════ */}
        <aside className="auth-visual">
          <div className="auth-stamp" aria-hidden="true">
            100%<br />grátis<br />pra anunciar
          </div>

          <div className="polaroids" aria-hidden="true">
            {polaroids.map((p, i) => (
              <article key={i} className={`polaroid polaroid-${i + 1}`}>
                <img src={p.src} alt="" />
                <h4>{p.title}</h4>
                <div className="polaroid-price">{p.price}</div>
                <span className="polaroid-hood">{p.hood}</span>
              </article>
            ))}
          </div>

          <div className="auth-visual-foot">
            <span className="badge">
              <span className="badge-dot" />
              Comunidade ativa agora
            </span>
            <h2>Seu bairro tem <em>mais do que você imagina.</em></h2>
            <p className="auth-lede">
              Desapegos que viram novos começos. Conecte-se com vizinhos,
              encontre raridades e contribua com a economia local.
            </p>
            <div className="auth-stats">
              <div className="stat"><span className="num">4.800+</span><span className="lbl">itens disponíveis</span></div>
              <div className="stat"><span className="num">1.247</span><span className="lbl">vizinhos ativos</span></div>
              <div className="stat"><span className="num">93%</span><span className="lbl">satisfação</span></div>
            </div>
          </div>
        </aside>

        {/* ════ PAINEL DIREITO ════ */}
        <section className="auth-form-side">
          <div className="login-card">

            <div className="form-header">
              <Link to="/" className="logo auth-logo">
                <span className="logo-mark">SD</span>
                Santo <em>Desapego</em>
              </Link>
              <h1>Entrar na sua <em>conta</em></h1>
              <p className="form-sub">Acesse para comprar, vender e favoritar itens</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>

              {/* E-mail */}
              <div className="input-group">
                <label htmlFor="email">E-mail</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 5L2 7" />
                  </svg>
                  <input type="email" id="email" name="email" placeholder="seu@email.com"
                    value={formData.email} onChange={handleChange} autoComplete="email" required />
                </div>
              </div>

              {/* Senha */}
              <div className="input-group">
                <label htmlFor="password">Senha</label>
                <div className="input-with-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input type={showPassword ? 'text' : 'password'} id="password" name="password"
                    placeholder="Sua senha" value={formData.password} onChange={handleChange}
                    autoComplete="current-password" required minLength={8} />
                  <button type="button" className="toggle-pw"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}>
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Mensagem de erro */}
              {errorMsg && (
                <div style={{
                  background: '#FFF5F3', border: '1.5px solid var(--terracotta)',
                  color: 'var(--terracotta)', padding: '0.65rem 0.9rem',
                  borderRadius: '10px', fontSize: '0.85rem',
                  marginBottom: '0.5rem', display: 'flex',
                  alignItems: 'center', gap: '0.5rem',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {errorMsg}
                </div>
              )}

              {/* Lembrar / Esqueci */}
              <div className="form-options">
                <label className="checkbox-row">
                  <input type="checkbox" name="remember" checked={formData.remember} onChange={handleChange} />
                  <span>Lembrar de mim</span>
                </label>
                <Link to="/esqueci-senha" className="forgot-link">Esqueci minha senha</Link>
              </div>

              {/* Submit */}
              <button type="submit" className="btn-login" disabled={submitting}>
                {submitting ? 'Entrando...' : (
                  <>Entrar
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>

              <div className="auth-divider"><span>ou continue com</span></div>

              {/* ── BOTÃO GOOGLE (largura total) ── */}
              <button
                type="button"
                className="btn-social"
                onClick={() => googleLogin()}
                disabled={submitting}
                style={{ width: '100%' }}
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M12 5c1.617 0 3.077.557 4.225 1.648l3.155-3.155C17.476 1.677 14.94.66 12 .66 7.392.66 3.397 3.297 1.386 7.122l3.708 2.875C6.082 7.108 8.74 5 12 5z" />
                  <path fill="#34A853" d="M23.34 12.272c0-.815-.073-1.6-.21-2.355H12v4.46h6.367c-.276 1.483-1.116 2.738-2.378 3.583v2.985h3.85c2.252-2.077 3.5-5.135 3.5-8.673z" />
                  <path fill="#4A90E2" d="M5.087 14.327A7.21 7.21 0 0 1 4.66 12c0-.808.143-1.589.4-2.319L1.353 6.806A11.96 11.96 0 0 0 .064 12c0 1.93.461 3.752 1.276 5.366l3.747-3.039z" />
                  <path fill="#FBBC05" d="M12 23.34c3.24 0 5.957-1.066 7.94-2.895l-3.85-2.985c-1.07.717-2.448 1.142-4.09 1.142-3.146 0-5.812-2.122-6.764-4.984l-3.747 3.04C3.42 20.494 7.4 23.34 12 23.34z" />
                </svg>
                Entrar com Google
              </button>

            </form>

            <p className="auth-foot-link">
              Ainda não tem conta?{' '}
              <Link to="/cadastro">Criar conta grátis</Link>
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

// ============================================================
//  Wrapper que provê o contexto do Google OAuth
// ============================================================
const Login = () => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <LoginContent />
  </GoogleOAuthProvider>
);

export default Login;