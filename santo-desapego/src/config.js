// URL base da API — em produção, defina VITE_API_URL no .env do front
// apontando para o domínio real. Sem isso, usa o mesmo host que serviu
// a página (funciona tanto em localhost quanto acessando pelo IP da
// rede local, ex: celular testando no wifi de casa).
export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080`;

// [RNF16] Client ID do login com Google — vem do .env do front
// (VITE_GOOGLE_CLIENT_ID), nunca fixo no código. Sem ele, o botão
// "Entrar com Google" não aparece.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Caixas de e-mail do domínio (Locaweb) exibidas no site
export const EMAILS = {
  contato: 'contato@santosdesapego.com.br',
  financeiro: 'financeiro@santosdesapego.com.br',
  denuncias: 'denuncias@santosdesapego.com.br',
};
