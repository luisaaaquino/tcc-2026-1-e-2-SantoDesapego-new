/* ── Sessão vencida ─────────────────────────────────────────
   O token de login (JWT) vale 7 dias. Quando vence, o nome do
   usuário continua salvo no navegador, mas a API recusa o token —
   o site ficava "meio logado" (ex.: "Olá, Paulo!" no topo e o sino
   de notificações sumindo sem aviso). Aqui isso é tratado num lugar
   só, pra todas as telas:
   1. ao abrir o site, token já vencido -> limpa a sessão;
   2. com o site aberto, a API responde "Token inválido ou expirado."
      -> limpa a sessão e leva pro login com um aviso. ── */
const CHAVES_SESSAO = ['sd_token', 'sd_usuario'];
const ERRO_TOKEN_API = 'Token inválido ou expirado.'; // middleware/auth.js da API

export const limparSessao = () => {
  try { CHAVES_SESSAO.forEach((k) => localStorage.removeItem(k)); } catch { /* sem storage */ }
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
