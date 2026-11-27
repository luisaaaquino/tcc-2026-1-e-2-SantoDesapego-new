/* ── Sessão vencida ─────────────────────────────────────────
   O token de login (JWT) vale 7 dias. Quando vence, o nome do
   usuário continua salvo no navegador, mas a API recusa o token —
   o site ficava "meio logado" (ex.: "Olá, Paulo!" no topo e o sino
   de notificações sumindo sem aviso). Aqui isso é tratado num lugar
   só, pra todas as telas:
   1. ao abrir o site, token já vencido -> limpa a sessão;
   2. com o site aberto, a API responde "Token inválido ou expirado."
      -> limpa a sessão e leva pro login com um aviso. ── */
const CHAVES_SESSAO = ['sd_token', 'sd_usuario', 'sd_lembrar'];
const ERRO_TOKEN_API = 'Token inválido ou expirado.'; // middleware/auth.js da API

/* ── "Lembrar de mim" (tela de login) ───────────────────────
   - marcado: a sessão dura até 7 dias (validade do token), mesmo
     fechando o navegador, e o e-mail já vem preenchido no próximo login;
   - desmarcado: a sessão acaba quando o navegador é fechado.
   O token continua no localStorage (todas as telas leem de lá); quem
   marca a sessão como "só desta visita" é um cookie sem data de
   validade, que o próprio navegador apaga ao ser fechado. ── */
const COOKIE_VISITA = 'sd_sessao_visita';
const CHAVE_EMAIL = 'sd_email_lembrado';

const marcarVisita = () => { document.cookie = `${COOKIE_VISITA}=1; path=/; SameSite=Lax`; };
const desmarcarVisita = () => { document.cookie = `${COOKIE_VISITA}=; path=/; max-age=0; SameSite=Lax`; };
const visitaAtiva = () => document.cookie.split('; ').includes(`${COOKIE_VISITA}=1`);

export const salvarSessao = (token, usuario, { lembrar = true, email } = {}) => {
  try {
    localStorage.setItem('sd_token', token);
    localStorage.setItem('sd_usuario', JSON.stringify(usuario));
    localStorage.setItem('sd_lembrar', lembrar ? '1' : '0');
    if (lembrar) {
      desmarcarVisita();
      if (email) localStorage.setItem(CHAVE_EMAIL, email);
    } else {
      marcarVisita();
      localStorage.removeItem(CHAVE_EMAIL);
    }
  } catch { /* sem storage */ }
};

export const emailLembrado = () => {
  try { return localStorage.getItem(CHAVE_EMAIL) || ''; } catch { return ''; }
};

// Ao abrir o site: sessão "sem lembrar" de uma visita anterior (o navegador
// foi fechado e apagou o cookie) -> encerra
export const encerrarSessaoSemLembrar = () => {
  try {
    if (localStorage.getItem('sd_lembrar') === '0' && !visitaAtiva()) limparSessao();
  } catch { /* sem storage */ }
};

export const limparSessao = () => {
  try { CHAVES_SESSAO.forEach((k) => localStorage.removeItem(k)); } catch { /* sem storage */ }
  try { desmarcarVisita(); } catch { /* sem cookies */ }
};

// Lê a validade (exp) gravada dentro do próprio token, sem chamar a API.
const tokenVencido = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false; // formato inesperado: quem decide é a API (passo 2)
  }
};

export const limparSessaoSeVencida = () => {
  try {
    const token = localStorage.getItem('sd_token');
    if (token && tokenVencido(token)) limparSessao();
  } catch { /* sem storage */ }
};

let redirecionando = false;

export const avisarSessaoExpiradaNaApi = () => {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (recurso, opcoes) => {
    const resposta = await fetchOriginal(recurso, opcoes);
    if (resposta.status !== 401 || redirecionando) return resposta;

    // Só reage quando a chamada foi feita com o token de login
    const cabecalhos = new Headers(opcoes?.headers || (recurso instanceof Request ? recurso.headers : undefined));
    if (!cabecalhos.get('Authorization')) return resposta;

    const corpo = await resposta.clone().json().catch(() => null);
    if (corpo?.erro !== ERRO_TOKEN_API) return resposta;

    limparSessao();
    if (window.location.pathname !== '/login') {
      redirecionando = true;
      window.location.assign('/login?sessao=expirada');
    }
    return resposta;
  };
};
