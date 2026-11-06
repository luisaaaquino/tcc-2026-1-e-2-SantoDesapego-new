import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// Testes unitários do front (Vitest + React Testing Library).
// Fica separado do vite.config.js pra não mexer na configuração do site.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './tests/relatorio/cobertura',
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true, // grava a cobertura mesmo com testes falhando
      // Arquivos com testes unitários. Páginas grandes (Perfil, Admin,
      // Explorar...) entram nos testes ponta a ponta.
      include: [
        'src/utils/**/*.js',
        'src/componentes/VerificacaoCodigo.jsx',
        'src/componentes/SeletorBairro.jsx',
        'src/componentes/AcessibilidadeCores.jsx',
        'src/componentes/NotificacoesSino.jsx',
        'src/componentes/DicasSeguranca.jsx',
        'src/componentes/LegalModal.jsx',
        'src/pages/Cadastro.jsx',
        'src/pages/Anunciar.jsx',
      ],
    },
  },
}));
