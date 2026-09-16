// URL base da API — em produção, defina VITE_API_URL no .env do front
// apontando para o domínio real. Sem isso, usa o mesmo host que serviu
// a página (funciona tanto em localhost quanto acessando pelo IP da
// rede local, ex: celular testando no wifi de casa).
export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080`;
