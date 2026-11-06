// Converte o relatório JSON do Playwright para o mesmo formato do Jest/Vitest,
// para usar o mesmo script de gráficos da API e do front (graficos.py).
const fs = require('fs');
const path = require('path');

const PASTA = path.join(__dirname, 'relatorio');
const entrada = JSON.parse(fs.readFileSync(path.join(PASTA, 'resultado-playwright.json'), 'utf8'));

const testes = [];
const percorrer = (suite, describes) => {
  const titulos = suite.title && !suite.title.endsWith('.js') ? [...describes, suite.title] : describes;
  for (const spec of suite.specs || []) {
    testes.push({ ancestorTitles: titulos, title: spec.title, status: spec.ok ? 'passed' : 'failed' });
  }
  for (const filha of suite.suites || []) percorrer(filha, titulos);
};
entrada.suites.forEach((s) => percorrer(s, []));

const aprovados = testes.filter((t) => t.status === 'passed').length;
fs.writeFileSync(path.join(PASTA, 'resultado.json'), JSON.stringify({
  numPassedTests: aprovados,
  numFailedTests: testes.length - aprovados,
  testResults: [{ assertionResults: testes }],
}, null, 2));
console.log(`Relatório convertido: ${aprovados} aprovados, ${testes.length - aprovados} reprovados`);
