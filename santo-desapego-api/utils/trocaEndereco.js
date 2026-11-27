// ============================================================
//  [RN01] Limite de troca de endereço
//  O anúncio usa o CEP do cadastro, então trocar o CEP é o que decide
//  onde a pessoa pode anunciar. Para dificultar quem troca só para
//  anunciar em Santo Amaro:
//    - preencher o CEP pela primeira vez não conta como troca;
//    - a 1ª troca de CEP/bairro é livre (corrigir um erro de cadastro);
//    - da 2ª em diante, só 30 dias depois da troca anterior.
//  Logradouro, número e complemento podem mudar à vontade.
// ============================================================
const DIAS_ENTRE_TROCAS = 30;
const TROCAS_LIVRES = 1;

const soDigitos = (v) => (v ? String(v).replace(/\D/g, '') : '') || null;
const textoOuNulo = (v) => (v && String(v).trim()) || null;

// O CEP ou o bairro mudou em relação ao que está no cadastro?
const enderecoMudou = (atual, novo) =>
  soDigitos(atual.cep) !== soDigitos(novo.cep) || textoOuNulo(atual.bairro) !== textoOuNulo(novo.bairro);

// Data a partir da qual a próxima troca fica liberada (null = liberada agora)
const trocaLiberadaEm = ({ endereco_trocas: trocas = 0, endereco_trocado_em: trocadoEm }, agora = new Date()) => {
  if (trocas < TROCAS_LIVRES || !trocadoEm) return null;
  const liberada = new Date(new Date(trocadoEm).getTime() + DIAS_ENTRE_TROCAS * 24 * 60 * 60 * 1000);
  return liberada > agora ? liberada : null;
};

module.exports = { DIAS_ENTRE_TROCAS, TROCAS_LIVRES, enderecoMudou, trocaLiberadaEm };
