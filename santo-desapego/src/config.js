// URL base da API — em produção, defina VITE_API_URL no .env do front
// apontando para o domínio real. Sem isso, cai no localhost do dev.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
