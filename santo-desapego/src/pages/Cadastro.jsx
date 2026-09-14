import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Cadastro.css';
import { BAIRROS } from '../componentes/SeletorBairro';

// RN01 — mesma faixa de CEP de Santo Amaro validada no back-end
const cepDentroDeSantoAmaro = (cepNumeros) => {
  const prefixo = parseInt(cepNumeros.slice(0, 5), 10);
  return prefixo >= 4600 && prefixo <= 4799;
};

const API_URL = 'http://localhost:8080';

// ============================================================
//  Validação real de CPF — checa os 2 dígitos verificadores
//  (a "matemática oficial" da Receita Federal)
// ============================================================
const validarCPF = (cpf) => {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  // Rejeita CPFs com todos os dígitos iguais (111.111.111-11, etc.)
  if (/^(\d)\1+$/.test(limpo)) return false;

  // Calcula o 1º dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(limpo[9])) return false;

  // Calcula o 2º dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(limpo[10])) return false;

  return true;
};

const Cadastro = () => {
  const [form, setForm] = useState({
    nome: '', sobrenome: '', cpf: '', email: '', confirmEmail: '',
    telefone: '', senha: '', confirmSenha: '',
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  });

  const [showSenha, setShowSenha]           = useState(false);
  const [showConfirmSenha, setShowConfirmSenha] = useState(false);
  const [emailError, setEmailError]         = useState(false);
  const [confirmEmailError, setConfirmEmailError] = useState(false);
  const [confirmSenhaError, setConfirmSenhaError] = useState(false);
  const [cpfError, setCpfError]             = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', cls: '' });
  const [showStrength, setShowStrength]     = useState(false);
  const [cepLoading, setCepLoading]         = useState(false);
  const [cepOk, setCepOk]                   = useState(false);
  const [cepErro, setCepErro]               = useState('');
  const [cepForaArea, setCepForaArea]       = useState(false);
  const [termsChecked, setTermsChecked]     = useState(false);
  const [newsChecked, setNewsChecked]       = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [loading, setLoading]               = useState(false);
  const [dots, setDots] = useState({ d1: 'active', d2: '', d3: '' });
  const [globalError, setGlobalError] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validateEmail = (value) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailError(value !== '' && !re.test(value));
  };

  const validateConfirmEmail = (value) => {
    setConfirmEmailError(value !== '' && value !== form.email);
  };

  const validateConfirmSenha = (value) => {
    setConfirmSenhaError(value !== '' && value !== form.senha);
  };

  // Aplica máscara 000.000.000-00 conforme digita
  const formatCPF = (value) => {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9)      v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
    else if (v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
    else if (v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`;
    setForm((prev) => ({ ...prev, cpf: v }));

    // Valida em tempo real só quando completou os 11 dígitos
    const numeros = v.replace(/\D/g, '');
    if (numeros.length === 11) setCpfError(!validarCPF(v));
    else setCpfError(false);
  };

  const formatPhone = (value) => {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    setForm((prev) => ({ ...prev, telefone: v }));
  };

  const checkPasswordStrength = (val) => {
    if (!val) { setShowStrength(false); return; }
    setShowStrength(true);
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const levels = ['weak', 'weak', 'medium', 'strong'];
    const labels = ['Muito fraca', 'Fraca', 'Média', 'Forte'];
    setPasswordStrength({ score, cls: levels[score - 1] || 'weak', label: `Força: ${labels[score - 1] || 'Muito fraca'}` });
  };

  const formatCEP = (value) => {
    let val = value.replace(/\D/g, '');
    if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5, 8);
    setForm((prev) => ({ ...prev, cep: val }));
    setCepErro('');
    setCepForaArea(false);

    const numeros = val.replace(/\D/g, '');
    if (numeros.length !== 8) { setCepOk(false); return; }

    setCepLoading(true);
    setCepOk(false);

    fetch(`https://viacep.com.br/ws/${numeros}/json/`)
      .then((r) => r.json())
      .then((dados) => {
        if (dados.erro) {
          setCepErro('CEP não encontrado. Verifique o número digitado.');
          return;
        }
        const foraDeArea = !cepDentroDeSantoAmaro(numeros);

        setForm((prev) => ({
          ...prev,
          logradouro: dados.logradouro || prev.logradouro,
          bairro: foraDeArea
            // fora de Santo Amaro: já seleciona "Outro bairro" automaticamente
            ? 'Outro bairro'
            // dentro da área: só preenche sozinho se bater com a lista atendida
            : (BAIRROS.includes(dados.bairro) ? dados.bairro : prev.bairro),
        }));
        setCepOk(true);
        setCepForaArea(foraDeArea);
      })
      .catch(() => {
        setCepErro('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
      })
      .finally(() => setCepLoading(false));
  };

  // ============================================================
  //  VALIDAÇÃO COMPLETA — todos os campos obrigatórios
  // ============================================================
  const validarCadastro = () => {
    if (!form.nome.trim())       return 'Por favor, preencha o nome.';
    if (!form.sobrenome.trim())  return 'Por favor, preencha o sobrenome.';

    if (!validarCPF(form.cpf))
      return 'CPF inválido. Verifique os dígitos.';

    const telefoneNumeros = form.telefone.replace(/\D/g, '');
    if (telefoneNumeros.length < 10)
      return 'Telefone inválido. Use o formato (XX) XXXXX-XXXX.';

    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!reEmail.test(form.email))
      return 'E-mail inválido.';

    if (form.email !== form.confirmEmail)
      return 'Os e-mails não coincidem.';

    if (form.senha.length < 8)
      return 'A senha deve ter pelo menos 8 caracteres.';

    if (form.senha !== form.confirmSenha)
      return 'As senhas não coincidem.';

    const cepNumeros = form.cep.replace(/\D/g, '');
    if (cepNumeros.length !== 8)
      return 'CEP inválido. Use o formato 00000-000.';

    if (!form.bairro)            return 'Por favor, selecione o bairro.';
    if (!form.logradouro.trim()) return 'Por favor, preencha o logradouro.';
    if (!form.numero.trim())     return 'Por favor, preencha o número do endereço.';

    if (!termsChecked)
      return 'Você precisa aceitar os Termos de Uso para continuar.';

    return null;
  };

  // ============================================================
  //  ENVIO PARA O BACK-END
  // ============================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');

    const erro = validarCadastro();
    if (erro) {
      setGlobalError(erro);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setDots({ d1: 'done', d2: 'done', d3: 'active' });
    setLoading(true);

    // Removemos a máscara antes de enviar — guardamos só os números no banco.
    // Boa prática: facilita buscas e ocupa menos espaço.
    const payload = {
      nome:              form.nome.trim(),
      sobrenome:         form.sobrenome.trim(),
      cpf:               form.cpf.replace(/\D/g, ''),       // 52998224725 (11 dígitos)
      telefone:          form.telefone.replace(/\D/g, ''),  // 11976069928 (11 dígitos)
      email:             form.email.trim().toLowerCase(),
      senha:             form.senha,
      cep:               form.cep.replace(/\D/g, ''),       // 04746085 (8 dígitos)
      logradouro:        form.logradouro.trim(),
      numero:            form.numero.trim(),
      complemento:       form.complemento.trim(),
      bairro:            form.bairro,
      aceita_termos:     termsChecked,
      recebe_newsletter: newsChecked,
    };

    try {
      const resposta = await fetch(`${API_URL}/api/auth/cadastro`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setGlobalError(dados.erro || 'Não foi possível concluir o cadastro.');
        setLoading(false);
        setDots({ d1: 'done', d2: 'done', d3: '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      console.log('✅ Usuário criado:', dados.usuario);
      setDots({ d1: 'done', d2: 'done', d3: 'done' });
      setSubmitted(true);

    } catch (erro) {
      console.error('Erro ao conectar com o servidor:', erro);
      setGlobalError('Não foi possível conectar ao servidor. Verifique se o back-end está rodando.');
      setLoading(false);
      setDots({ d1: 'done', d2: 'done', d3: '' });
    }
  };

  const dotClass = (key) => `step-dot${dots[key] ? ' ' + dots[key] : ''}`;
  const segClass = (i) => `strength-seg${i < passwordStrength.score ? ' ' + passwordStrength.cls : ''}`;

  /* ── Ícones reutilizáveis ── */
  const IconUser  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  const IconMail  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
  const IconLock  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
  const IconPin   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>;
  const IconPhone = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
  const IconHome  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  const IconID    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 9h4M14 13h4M6.5 17.5c0-1 1-2 2.5-2s2.5 1 2.5 2"/></svg>;
  const IconChevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;
  const IconEye   = (open) => open
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
  const IconCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
  const IconAlert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  const IconArrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>;

  return (
    <div className="cadastro-wrapper">

      <div className="announcement">
        🎉 <strong>Novo!</strong> Cadastro gratuito — Anuncie seu primeiro item em menos de 2 minutos
      </div>

      <header className="site-header">
        <div className="nav-top">
          <Link to="/" className="logo">
            <span className="logo-mark">SD</span>
            Santo <em>Desapego</em>
          </Link>
          <nav className="nav-actions">
            <Link to="/" className="nav-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Voltar para a home
            </Link>
          </nav>
        </div>
      </header>

      <div className="cadastro-page">

        {/* LEFT PANEL */}
        <div className="left-panel">
          <h2>Seu bairro <em>nunca</em><br />foi tão próximo.</h2>
          <p>Crie sua conta gratuita e comece a comprar, vender e trocar com vizinhos de Santo Amaro em poucos minutos.</p>

          <ul className="benefits-list">
            {[
              { icon: '🏷️', title: 'Anúncio gratuito',        desc: 'Publique quantos itens quiser sem pagar nada' },
              { icon: '📍', title: 'Hiperlocal de verdade',    desc: 'Veja a distância exata até o vendedor do bairro' },
              { icon: '💬', title: 'Chat seguro integrado',    desc: 'Negocie sem expor seu número de telefone' },
              { icon: '⭐', title: 'Reputação comunitária',    desc: 'Avaliações que constroem confiança real entre vizinhos' },
            ].map((b) => (
              <li key={b.title}>
                <div className="benefit-icon">{b.icon}</div>
                <div className="benefit-text">
                  <strong>{b.title}</strong>
                  <span>{b.desc}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="left-testimonial">
            <p>"Vendi meu sofá em menos de 3 horas. O comprador morava a 400m. Foi ridiculamente fácil."</p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">MC</div>
              <div className="testimonial-name">
                <strong>Mariana Costa</strong>
                <span>Campo Belo · membro desde jan/2025</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          {submitted ? (
            <div className="success-state">
              <div className="success-icon"><IconCheck /></div>
              <h2>Bem-vinda ao <em>vizinhado</em>!</h2>
              <p>Sua conta foi criada com sucesso. Agora é só fazer login.</p>
              <Link to="/login" className="btn-success">
                Fazer login agora <IconArrow />
              </Link>
            </div>
          ) : (
            <>
              <div className="form-header">
                <div className="step-indicator">
                  <div className={dotClass('d1')} />
                  <div className={dotClass('d2')} />
                  <div className={dotClass('d3')} />
                </div>
                <h1>Criar sua <em>conta</em></h1>
                <p>É gratuito e leva menos de 2 minutos. Preencha todos os campos abaixo.</p>
              </div>

              <form className="signup-form" onSubmit={handleSubmit} noValidate>

                {/* Mensagem de erro global */}
                {globalError && (
                  <div style={{
                    background: '#FFF5F3',
                    border: '1.5px solid var(--terracotta)',
                    color: 'var(--terracotta)',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    fontSize: '0.88rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}>
                    <IconAlert />
                    <strong>{globalError}</strong>
                  </div>
                )}

                {/* Nome e Sobrenome */}
                <div className="form-row">
                  {[
                    { label: 'Nome',      name: 'nome',      placeholder: 'Ex: Mariana', ac: 'given-name' },
                    { label: 'Sobrenome', name: 'sobrenome', placeholder: 'Ex: Costa',   ac: 'family-name' },
                  ].map((f) => (
                    <div className="field-group no-mb" key={f.name}>
                      <label className="field-label">{f.label} <span className="required">*</span></label>
                      <div className="field-input-wrap">
                        <IconUser />
                        <input type="text" className="field-input" placeholder={f.placeholder}
                          name={f.name} value={form[f.name]} onChange={handleChange} autoComplete={f.ac} required />
                      </div>
                    </div>
                  ))}
                </div>

                {/* CPF + Telefone (lado a lado) */}
                <div className="form-row" style={{ marginTop: '1rem' }}>
                  <div className="field-group no-mb">
                    <label className="field-label">CPF <span className="required">*</span></label>
                    <div className="field-input-wrap">
                      <IconID />
                      <input type="text" className={`field-input${cpfError ? ' error' : ''}`}
                        placeholder="000.000.000-00" name="cpf" value={form.cpf}
                        onChange={(e) => formatCPF(e.target.value)}
                        maxLength={14} required />
                    </div>
                    {cpfError && <span className="field-error"><IconAlert /> CPF inválido.</span>}
                  </div>

                  <div className="field-group no-mb">
                    <label className="field-label">Telefone / WhatsApp <span className="required">*</span></label>
                    <div className="field-input-wrap">
                      <IconPhone />
                      <input type="tel" className="field-input" placeholder="(11) 99999-9999"
                        name="telefone" value={form.telefone}
                        onChange={(e) => formatPhone(e.target.value)}
                        autoComplete="tel" required />
                    </div>
                  </div>
                </div>

                {/* E-mail e Confirmação */}
                <div className="field-group" style={{ marginTop: '1rem' }}>
                  <label className="field-label">E-mail <span className="required">*</span></label>
                  <div className="field-input-wrap">
                    <IconMail />
                    <input type="email" className={`field-input${emailError ? ' error' : ''}`}
                      placeholder="voce@email.com" name="email" value={form.email}
                      onChange={(e) => { handleChange(e); validateEmail(e.target.value); }}
                      autoComplete="email" required />
                  </div>
                  {emailError && <span className="field-error"><IconAlert /> E-mail inválido.</span>}
                </div>

                <div className="field-group">
                  <label className="field-label">Confirmar e-mail <span className="required">*</span></label>
                  <div className="field-input-wrap">
                    <IconMail />
                    <input type="email" className={`field-input${confirmEmailError ? ' error' : ''}`}
                      placeholder="repita seu e-mail" name="confirmEmail" value={form.confirmEmail}
                      onChange={(e) => { handleChange(e); validateConfirmEmail(e.target.value); }}
                      autoComplete="email" required />
                  </div>
                  {confirmEmailError && <span className="field-error"><IconAlert /> Os e-mails não coincidem.</span>}
                </div>

                {/* Senha e Confirmação */}
                <div className="field-group">
                  <label className="field-label">Senha <span className="required">*</span></label>
                  <div className="field-input-wrap">
                    <IconLock />
                    <input type={showSenha ? 'text' : 'password'} className="field-input"
                      placeholder="Mínimo 8 caracteres" name="senha" value={form.senha}
                      onChange={(e) => { handleChange(e); checkPasswordStrength(e.target.value); }}
                      autoComplete="new-password" required minLength={8} />
                    <button type="button" className="password-toggle" onClick={() => setShowSenha(!showSenha)}>
                      {IconEye(showSenha)}
                    </button>
                  </div>
                  {showStrength && (
                    <div className="password-strength">
                      <div className="strength-bar">
                        {[0,1,2,3].map((i) => <div key={i} className={segClass(i)} />)}
                      </div>
                      <span className={`strength-label ${passwordStrength.cls}`}>{passwordStrength.label}</span>
                    </div>
                  )}
                </div>

                <div className="field-group">
                  <label className="field-label">Confirmar senha <span className="required">*</span></label>
                  <div className="field-input-wrap">
                    <IconLock />
                    <input type={showConfirmSenha ? 'text' : 'password'}
                      className={`field-input${confirmSenhaError ? ' error' : ''}`}
                      placeholder="repita sua senha" name="confirmSenha" value={form.confirmSenha}
                      onChange={(e) => { handleChange(e); validateConfirmSenha(e.target.value); }}
                      autoComplete="new-password" required />
                    <button type="button" className="password-toggle" onClick={() => setShowConfirmSenha(!showConfirmSenha)}>
                      {IconEye(showConfirmSenha)}
                    </button>
                  </div>
                  {confirmSenhaError && <span className="field-error"><IconAlert /> As senhas não coincidem.</span>}
                </div>

                {/* Endereço */}
                <div className="form-section-label">Endereço</div>

                <div className="form-row">
                  <div className="field-group no-mb">
                    <label className="field-label">CEP <span className="required">*</span></label>
                    <div className="field-input-wrap cep-wrap">
                      <IconPin />
                      <input type="text" className={`field-input${cepOk ? ' success' : ''}`}
                        placeholder="04000-000" name="cep" value={form.cep}
                        onChange={(e) => formatCEP(e.target.value)} maxLength={9} autoComplete="postal-code" required />
                      {cepLoading && <div className="cep-loader visible"><span /></div>}
                      {cepOk && !cepLoading && <div className="cep-ok visible"><IconCheck /></div>}
                    </div>
                    {cepErro
                      ? <span className="field-error"><IconAlert /> {cepErro}</span>
                      : <span className="field-hint">Preenchimento automático do endereço</span>}
                  </div>

                  <div className="field-group no-mb">
                    <label className="field-label">Bairro <span className="required">*</span></label>
                    <div className="select-wrap field-input-wrap">
                      <svg className="select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <select className="field-select" name="bairro" value={form.bairro} onChange={handleChange} required>
                        <option value="" disabled>Selecione...</option>
                        {BAIRROS.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                        {/* Fallback pra quem mora fora da área de Santo Amaro atendida */}
                        <option value="Outro bairro">Outro bairro (fora de Santo Amaro)</option>
                      </select>
                      <span className="select-arrow"><IconChevron /></span>
                    </div>
                  </div>
                </div>

                {cepForaArea && (
                  <div className="alerta-fora-area">
                    <IconAlert />
                    <div>
                      <strong>Esse CEP fica fora da área de Santo Amaro atendida pela plataforma.</strong>
                      <span> Você pode concluir o cadastro normalmente, mas anunciar e comprar itens fica limitado aos vizinhos de Santo Amaro e região.</span>
                    </div>
                  </div>
                )}

                <div className="form-row" style={{ marginTop: '1rem' }}>
                  <div className="field-group no-mb" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">Logradouro <span className="required">*</span></label>
                    <div className="field-input-wrap">
                      <IconHome />
                      <input type="text" className="field-input" placeholder="Rua, Av., Travessa..."
                        name="logradouro" value={form.logradouro} onChange={handleChange}
                        autoComplete="street-address" required />
                    </div>
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '1rem' }}>
                  <div className="field-group no-mb">
                    <label className="field-label">Número <span className="required">*</span></label>
                    <div className="field-input-wrap">
                      <IconHome />
                      <input type="text" className="field-input" placeholder="Ex: 123"
                        name="numero" value={form.numero} onChange={handleChange} required />
                    </div>
                  </div>
                  <div className="field-group no-mb">
                    <label className="field-label">Complemento <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(opcional)</span></label>
                    <div className="field-input-wrap">
                      <IconHome />
                      <input type="text" className="field-input" placeholder="Apto, Bloco..."
                        name="complemento" value={form.complemento} onChange={handleChange} />
                    </div>
                  </div>
                </div>

                {/* Checkboxes */}
                <div style={{ marginTop: '1.25rem' }}>
                  <div className="checkbox-group">
                    <div className={`checkbox-custom${termsChecked ? ' checked' : ''}`} onClick={() => setTermsChecked(!termsChecked)} />
                    <label className="checkbox-label" onClick={() => setTermsChecked(!termsChecked)}>
                      Li e aceito os <a href="#" onClick={e => e.stopPropagation()}>Termos de Uso</a> e a{' '}
                      <a href="#" onClick={e => e.stopPropagation()}>Política de Privacidade (LGPD)</a>.{' '}
                      <span className="required" style={{ color: 'var(--terracotta)' }}>*</span>
                    </label>
                  </div>
                  <div className="checkbox-group">
                    <div className={`checkbox-custom${newsChecked ? ' checked' : ''}`} onClick={() => setNewsChecked(!newsChecked)} />
                    <label className="checkbox-label" onClick={() => setNewsChecked(!newsChecked)}>
                      Quero receber novidades e alertas de desapegos perto de mim por e-mail.
                    </label>
                  </div>
                </div>

                <button type="submit" className="btn-dark btn-submit" disabled={loading}>
                  {loading ? 'Criando sua conta...' : <> Criar minha conta grátis <IconArrow /> </>}
                </button>
              </form>

              <p className="form-footer">
                Já tem uma conta? <Link to="/login">Entrar agora →</Link>
              </p>
            </>
          )}
        </div>
      </div>

      <footer className="site-footer">
        <span>© 2025 Santo Desapego — Projeto acadêmico TCC · SENAC Santo Amaro · </span>
        <a href="#">Privacidade</a> · <a href="#">Termos</a>
      </footer>
    </div>
  );
};

export default Cadastro;