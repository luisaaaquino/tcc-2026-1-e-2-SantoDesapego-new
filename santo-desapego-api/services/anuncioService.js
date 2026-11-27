/**
 * Validação e inserção de anúncio — extraído de routes/anuncios.js pra ser
 * reaproveitado tanto pela criação manual (POST /api/anuncios) quanto pelo
 * Agente de Anúncio (IA, ver services/agenteAnuncioService.js). Mesma regra
 * de negócio nos dois fluxos, sem duplicação.
 */
const pool = require('../db');
const { validarCEPSantoAmaro, conteudoTemPalavrasProibidas } = require('../utils/validacao');

/**
 * Valida os dados de um anúncio (título, descrição, preço, estado de
 * conservação, categoria, CEP, moderação de conteúdo e imagens).
 * Devolve uma string de erro (pt-BR, pronta pra virar resposta HTTP) ou
 * `null` quando está tudo certo.
 */
async function validarDadosAnuncio({ titulo, descricao, preco, estado_conservacao, categoria_id, cep, imagens }) {
  if (!titulo || titulo.trim().length < 5)
    return 'Título precisa ter pelo menos 5 caracteres.';
  if (titulo.length > 120)
    return 'Título muito longo (máximo 120 caracteres).';
  if (!descricao || descricao.trim().length < 20)
    return 'Descrição precisa ter pelo menos 20 caracteres.';
  if (!preco || preco < 0)
    return 'Informe um preço válido.';
  if (!['novo', 'seminovo', 'usado', 'para-reparo'].includes(estado_conservacao))
    return 'Estado de conservação inválido.';
  if (!categoria_id)
    return 'Selecione uma categoria.';

  // RN01 — Restrição Geográfica
  // (checagem de presença antes de chamar validarCEPSantoAmaro, que faz
  // cep.replace(...) e quebraria com erro não tratado se cep vier vazio —
  // o formulário manual sempre manda um CEP preenchido, mas o Agente de
  // Anúncio [IA] pode publicar com o CEP do perfil do vendedor, que pode
  // estar em branco)
  if (!cep) return 'CEP não informado.';
  if (!validarCEPSantoAmaro(cep)) {
    return 'Anúncios só podem ser publicados em CEPs de Santo Amaro e regiões limítrofes (zona sul de SP). [RN01]';
  }

  // RN09 — Moderação de Conteúdo
  const palavraProibida = conteudoTemPalavrasProibidas(`${titulo} ${descricao}`);
  if (palavraProibida) {
    return 'Seu anúncio contém conteúdo não permitido pelos Termos de Uso. Revise o título e a descrição. [RN09]';
  }

  // RFN19 — Limites de Upload
  if (!imagens || !Array.isArray(imagens) || imagens.length === 0)
    return 'Envie pelo menos 1 imagem do produto.';
  if (imagens.length > 6)
    return 'Máximo de 6 imagens por anúncio.';

  const tamanhoTotal = imagens.reduce((acc, img) => acc + (img?.length || 0), 0);
  if (tamanhoTotal > 5 * 1024 * 1024) {
    return 'Imagens muito grandes no total. Tente reduzir a quantidade ou qualidade.';
  }

  for (const img of imagens) {
    if (typeof img !== 'string' || !img.startsWith('data:image/')) {
      return 'Uma das imagens está em formato inválido.';
    }
  }

  const cat = await pool.query('SELECT id FROM categorias WHERE id = $1', [categoria_id]);
  if (cat.rows.length === 0) {
    return 'Categoria inválida.';
  }

  return null;
}

/**
 * RN01 — o anúncio fica sempre no endereço do cadastro do vendedor.
 * O CEP e o bairro não vêm do formulário: assim quem mora fora da área
 * atendida não consegue anunciar digitando um CEP de Santo Amaro.
 * Devolve { cep, bairro } ou { erro } (mensagem pronta para a tela).
 */
const ERRO_SEM_ENDERECO = 'Cadastre seu endereço antes de anunciar: vá em Perfil → Endereço.';
const ERRO_FORA_DA_AREA = 'Seu endereço cadastrado fica fora da área atendida. Só é possível anunciar com endereço em Santo Amaro e regiões limítrofes (CEP de 04600-000 a 04799-999). Se você se mudou, atualize em Perfil → Endereço. [RN01]';

function conferirEnderecoParaAnunciar({ cep, bairro } = {}) {
  if (!cep) return { erro: ERRO_SEM_ENDERECO };
  if (!validarCEPSantoAmaro(cep)) return { erro: ERRO_FORA_DA_AREA };
  return { cep: cep.replace(/\D/g, ''), bairro: bairro || null };
}

async function enderecoParaAnunciar(usuarioId) {
  const perfil = await pool.query('SELECT cep, bairro FROM usuarios WHERE id = $1', [usuarioId]);
  return conferirEnderecoParaAnunciar(perfil.rows[0]);
}

/**
 * Insere o anúncio + imagens numa transação (ACID). Assume que os dados já
 * passaram por `validarDadosAnuncio`.
 */
async function inserirAnuncio({ vendedorId, titulo, descricao, preco, estado_conservacao, categoria_id, cep, bairro, imagens }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cepLimpo = cep.replace(/\D/g, '');

    const novoAnuncio = await client.query(
      `INSERT INTO anuncios
        (vendedor_id, categoria_id, titulo, descricao, preco,
         estado_conservacao, cep, bairro, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ativo')
       RETURNING id, titulo, preco, status, data_criacao`,
      [
        vendedorId, categoria_id, titulo.trim(), descricao.trim(), preco,
        estado_conservacao, cepLimpo, bairro || null
      ]
    );

    const anuncioId = novoAnuncio.rows[0].id;

    for (let i = 0; i < imagens.length; i++) {
      await client.query(
        `INSERT INTO anuncio_imagens (anuncio_id, imagem, ordem, is_principal)
         VALUES ($1, $2, $3, $4)`,
        [anuncioId, imagens[i], i, i === 0]
      );
    }

    await client.query('COMMIT');
    return novoAnuncio.rows[0];
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = { validarDadosAnuncio, inserirAnuncio, conferirEnderecoParaAnunciar, enderecoParaAnunciar };
