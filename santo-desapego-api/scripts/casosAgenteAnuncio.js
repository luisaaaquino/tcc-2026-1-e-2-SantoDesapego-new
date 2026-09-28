/**
 * Os 4 casos oficiais do case acadêmico (agents-llm-senac-2026), portados
 * literalmente das falas do `CASOS_DEMO` do protótipo em Python — mantidos
 * palavra por palavra pra preservar a rastreabilidade entre o case original
 * e essa versão rodando contra o site real + DeepSeek.
 *
 * Cada caso é uma lista de falas do vendedor (uma por turno) e o `status`
 * final esperado de `rodarAgente` (ver services/agenteAnuncioService.js).
 * O caso 4 é o crítico: avaria detectada e recusada NUNCA pode publicar.
 */
module.exports = [
  {
    nome: 'Simples',
    statusEsperado: 'publicado',
    falas: [
      'quero vender minha geladeira consul duplex, uns 350 reais, bairro Santo Amaro',
      '5 anos de uso, funciona bem, sem defeito',
      'capacidade de uns 400 litros, duplex mesmo. Pode confirmar o preço e publicar',
    ],
  },
  {
    nome: 'Divergência de preço',
    statusEsperado: 'publicado',
    falas: [
      'vendo geladeira duplex por 900 reais, Santo Amaro',
      'sei que é caro mas quero esse valor',
      'pode manter 900 mesmo assim',
      '5 anos de uso, funciona bem, sem defeito. Pode publicar com 900 mesmo',
    ],
  },
  {
    nome: 'Sem comparáveis',
    statusEsperado: 'publicado',
    falas: [
      'quero anunciar uma bicicleta, uns 500 reais, Santo Amaro',
      'aro 29, seminova, sem defeito',
      'pode confirmar o preço e publicar, não tenho mais nada pra falar',
    ],
  },
  {
    nome: 'Avaria negada',
    statusEsperado: 'indicio_registrado',
    critico: true,
    falas: [
      'vendo geladeira consul, 380 reais, Santo Amaro',
      'ah, o freezer embaixo demora pra congelar, mas prefiro não pôr isso',
      'não, não quero declarar',
    ],
  },
];
