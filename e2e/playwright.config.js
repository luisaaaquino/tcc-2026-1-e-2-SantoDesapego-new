// Testes ponta a ponta: o Playwright liga a API (banco de teste recriado
// do zero) e o site, abre o navegador e usa o Santo Desapego como uma
// pessoa usaria.
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PASTA_FRONT = path.resolve(__dirname, '../santo-desapego');

module.exports = defineConfig({
  testDir: './testes',
  // Os testes compartilham o mesmo banco: rodam um de cada vez, na ordem
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'relatorio/resultado-playwright.json' }],
    ['html', { outputFolder: 'relatorio/html', open: 'never' }],
  ],
  outputDir: 'relatorio/evidencias',
  use: {
    baseURL: 'http://localhost:5174',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Evidências: print e vídeo quando um teste falha
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node servidor-api.js',
      url: 'http://localhost:8090/ping',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      cwd: PASTA_FRONT,
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:8090' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
