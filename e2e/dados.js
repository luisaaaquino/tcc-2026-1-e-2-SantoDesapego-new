// Dados fixos do banco de teste ponta a ponta. Os testes usam estas
// constantes para saber com quem logar e o que procurar na tela.

// Gera um CPF válido a partir de 9 dígitos (calcula os 2 verificadores)
const cpf = (base) => {
  const d = base.split('').map(Number);
  for (const tamanho of [9, 10]) {
    const soma = d.slice(0, tamanho).reduce((s, n, i) => s + n * (tamanho + 1 - i), 0);
    const resto = (soma * 10) % 11;
    d.push(resto === 10 ? 0 : resto);
  }
  return d.join('');
};

const SENHA = 'Desapego@2026';

const USUARIOS = {
  comprador: { nome: 'Ana', sobrenome: 'Lima', email: 'ana@e2e.santodesapego.com', cpf: cpf('529982247'),
    cep: '04710150', bairro: 'Santo Amaro Centro' },
  vendedor: { nome: 'Caio', sobrenome: 'Souza', email: 'caio@e2e.santodesapego.com', cpf: cpf('111444777'),
    cep: '04602000', bairro: 'Campo Belo' },
  vizinho: { nome: 'Bia', sobrenome: 'Ramos', email: 'bia@e2e.santodesapego.com', cpf: cpf('123456789'),
    cep: '04650000', bairro: 'Granja Julieta' },
  admin: { nome: 'Dora', sobrenome: 'Admin', email: 'admin@e2e.santodesapego.com', cpf: cpf('987654321'),
    cep: '04710150', bairro: 'Santo Amaro Centro', papel: 'administrador' },
};

// Anúncios do vendedor (Caio). "Geladeira" já foi comprada pela Ana.
const ANUNCIOS = {
  bicicleta: { titulo: 'Bicicleta aro 29 Caloi', categoria: 'esporte-bicicletas', preco: 850, estado: 'usado',
    descricao: 'Bicicleta aro 29 com 21 marchas, freio a disco, pneus novos. Pouco usada.', bairro: 'Campo Belo', cep: '04602000' },
  sofa: { titulo: 'Sofá 3 lugares retrátil cinza', categoria: 'moveis-sofas-poltronas', preco: 1200, estado: 'seminovo',
    descricao: 'Sofá retrátil e reclinável, tecido suede cinza, sem rasgos nem manchas.', bairro: 'Santo Amaro Centro', cep: '04710150' },
  livro: { titulo: 'Coleção Harry Potter 7 livros', categoria: 'livros-literatura', preco: 180, estado: 'usado',
    descricao: 'Coleção completa capa dura, todos os 7 volumes em bom estado.', bairro: 'Granja Julieta', cep: '04650000' },
  pausado: { titulo: 'Mesa de jantar 6 cadeiras', categoria: 'moveis-mesas-cadeiras', preco: 900, estado: 'usado',
    descricao: 'Mesa de madeira maciça com 6 cadeiras estofadas.', bairro: 'Campo Belo', cep: '04602000', status: 'pausado' },
  geladeira: { titulo: 'Geladeira Brastemp 400L', categoria: 'eletronicos-eletrodomesticos', preco: 1500, estado: 'usado',
    descricao: 'Geladeira frost free 400 litros, funcionando perfeitamente.', bairro: 'Campo Belo', cep: '04602000', status: 'vendido' },
};

// Compra já paga (o Mercado Pago real não entra no teste): Ana comprou a geladeira
const CODIGO_ENTREGA = '482913';

// Imagem PNG mínima (1x1) para os anúncios
const IMAGEM = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/** Popula o banco recém-criado. `bcrypt` vem das dependências da API. */
async function popular(client, bcrypt) {
  const hash = await bcrypt.hash(SENHA, 4);
  const ids = {};
  for (const [chave, u] of Object.entries(USUARIOS)) {
    const { rows } = await client.query(
      `INSERT INTO usuarios (nome, sobrenome, email, senha, cpf, cep, bairro, logradouro, numero,
         aceita_termos, termos_versao, termos_aceitos_em, papel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Rua de Teste','100', TRUE, '1.0', NOW(), $8) RETURNING id`,
      [u.nome, u.sobrenome, u.email, hash, u.cpf, u.cep, u.bairro, u.papel || 'usuario']
    );
    ids[chave] = rows[0].id;
  }

  const anuncios = {};
  for (const [chave, a] of Object.entries(ANUNCIOS)) {
    const { rows } = await client.query(
      `INSERT INTO anuncios (vendedor_id, categoria_id, titulo, descricao, preco, estado_conservacao, cep, bairro, status)
       VALUES ($1, (SELECT id FROM categorias WHERE slug = $2), $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ids.vendedor, a.categoria, a.titulo, a.descricao, a.preco, a.estado, a.cep, a.bairro, a.status || 'ativo']
    );
    anuncios[chave] = rows[0].id;
    await client.query(
      'INSERT INTO anuncio_imagens (anuncio_id, imagem, ordem, is_principal) VALUES ($1, $2, 0, TRUE)',
      [rows[0].id, IMAGEM]
    );
  }

  await client.query(
    `INSERT INTO compras (anuncio_id, comprador_id, vendedor_id, preco, payment_id, status, metodo_pagamento, parcelas, codigo_entrega)
     VALUES ($1, $2, $3, $4, 'e2e-pagamento-1', 'approved', 'visa', 1, $5)`,
    [anuncios.geladeira, ids.comprador, ids.vendedor, ANUNCIOS.geladeira.preco, CODIGO_ENTREGA]
  );

  return { ids, anuncios };
}

module.exports = { USUARIOS, ANUNCIOS, SENHA, CODIGO_ENTREGA, IMAGEM, popular, cpf };
