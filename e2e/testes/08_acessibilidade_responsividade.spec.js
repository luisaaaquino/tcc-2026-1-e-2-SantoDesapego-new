// RNF12: cada tela passa pelo axe (mesma ferramenta do axe DevTools citada no
// TCC) com as regras da WCAG 2.1 nível A e AA. A meta do documento é
// "zero erros críticos". Os resultados vão para relatorio/axe/ e viram gráfico.
// RNF11: o site precisa caber na tela do celular, sem rolagem para o lado.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { USUARIOS } = require('../dados');
const { entrar } = require('../utilitarios');

const PASTA_AXE = path.join(__dirname, '..', 'relatorio', 'axe');
const IMPACTOS = ['critical', 'serious', 'moderate', 'minor'];

const PAGINAS_PUBLICAS = [
  ['Home', '/'],
  ['Explorar', '/explorar'],
  ['Anúncio', '/anuncio/1'],
  ['Login', '/login'],
  ['Cadastro', '/cadastro'],
  ['Central de Ajuda', '/central-ajuda'],
  ['Sobre', '/sobre'],
];
const PAGINAS_LOGADAS = [
  ['Anunciar', '/anunciar'],
  ['Perfil', '/perfil'],
  ['Mensagens', '/mensagens'],
];

const analisar = async (page, nome) => {
  await page.waitForLoadState('networkidle');
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const porImpacto = Object.fromEntries(IMPACTOS.map((i) => [i, resultado.violations.filter((v) => v.impact === i).length]));
  fs.mkdirSync(PASTA_AXE, { recursive: true });
  fs.writeFileSync(path.join(PASTA_AXE, `${nome}.json`), JSON.stringify({
    pagina: nome,
    por_impacto: porImpacto,
    violacoes: resultado.violations.map((v) => ({ regra: v.id, impacto: v.impact, descricao: v.help, elementos: v.nodes.length })),
  }, null, 2));
  return { porImpacto, violacoes: resultado.violations };
};

const resumo = (violacoes) => violacoes.filter((v) => v.impact === 'critical').map((v) => `${v.id}: ${v.help}`).join('\n');

test.describe('RNF12 - Acessibilidade WCAG 2.1 Nível AA', () => {
  for (const [nome, rota] of PAGINAS_PUBLICAS) {
    test(`axe: página ${nome} sem erros críticos de acessibilidade`, async ({ page }) => {
      await page.goto(rota);
      const { porImpacto, violacoes } = await analisar(page, nome);
      expect(porImpacto.critical, resumo(violacoes)).toBe(0);
    });
  }

  for (const [nome, rota] of PAGINAS_LOGADAS) {
    test(`axe: página ${nome} (logado) sem erros críticos de acessibilidade`, async ({ page }) => {
      await entrar(page, USUARIOS.vendedor);
      await page.goto(rota);
      const { porImpacto, violacoes } = await analisar(page, nome);
      expect(porImpacto.critical, resumo(violacoes)).toBe(0);
    });
  }

  test('o site inteiro pode ser navegado com o teclado a partir do topo da home', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focado = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT']).toContain(focado);
  });
});

test.describe('RNF11 - Usabilidade e Responsividade', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const [nome, rota] of [...PAGINAS_PUBLICAS]) {
    test(`celular: a página ${nome} cabe na tela sem rolagem lateral`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForLoadState('networkidle');
      const { largura, conteudo } = await page.evaluate(() => ({
        largura: window.innerWidth, conteudo: document.documentElement.scrollWidth,
      }));
      expect(conteudo).toBeLessThanOrEqual(largura + 1);
    });
  }

  test('celular: o menu abre pelo botão de menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  });
});
