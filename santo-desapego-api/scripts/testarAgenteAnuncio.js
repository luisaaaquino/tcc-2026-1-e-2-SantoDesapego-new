/**
 * Roda os 4 casos oficiais (casosAgenteAnuncio.js) contra o
 * agenteAnuncioService de verdade — banco real (local) + LLM real
 * (configurado no .env). Imprime ✅/❌ por caso e limpa tudo que criou
 * no final (não precisa de banco de teste separado).
 *
 * Uso:
 *   node scripts/testarAgenteAnuncio.js
 *
 * Pré-requisito: LLM_API_KEY configurada no .env (ver README/plano).
 *
 * Nota de honestidade (herdada do case original): como o LLM não é
 * determinístico, isso é um teste de fumaça de rastreabilidade, não uma
 * garantia 100% estável — rode umas 3x antes de considerar validado. O
 * caso 4 (avaria negada) é o crítico: se falhar qualquer vez, é bloqueante.
 */
const bcrypt = require('bcrypt');
const pool = require('../db');
const { rodarAgente, estadoInicial } = require('../services/agenteAnuncioService');
const casos = require('./casosAgenteAnuncio');

const EMAIL_TESTE = 'agente.ia.teste@santodesapego.local';
const CATEGORIA_ELETRODOMESTICOS = 75; // subcategoria de Móveis & Casa
const CEP_TESTE = '04700-000';         // dentro da faixa de Santo Amaro (RN01)
const BAIRRO_TESTE = 'Santo Amaro';

async function garantirVendedorTeste() {
  const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [EMAIL_TESTE]);
  if (existente.rows.length > 0) return existente.rows[0].id;

  const senhaHash = await bcrypt.hash('TesteAgenteIA!2026', 10);
  const cpfFake = `999${Date.now().toString().slice(-8)}`;
  const novo = await pool.query(
    `INSERT INTO usuarios
      (nome, sobrenome, telefone, email, senha, cep, bairro, cpf, aceita_termos, recebe_newsletter)
     VALUES ('Vendedor', 'Teste IA', null, $1, $2, $3, $4, $5, true, false)
     RETURNING id`,
    [EMAIL_TESTE, senhaHash, CEP_TESTE.replace(/\D/g, ''), BAIRRO_TESTE, cpfFake]
  );
  return novo.rows[0].id;
}

async function semearComparaveis(vendedorId) {
  const precos = [300, 320, 350, 380];
  for (const preco of precos) {
    await pool.query(
      `INSERT INTO anuncios
        (vendedor_id, categoria_id, titulo, descricao, preco,
         estado_conservacao, cep, bairro, status)
       VALUES ($1, $2, $3, $4, $5, 'usado', $6, $7, 'ativo')`,
      [
        vendedorId, CATEGORIA_ELETRODOMESTICOS,
        `Geladeira Consul Duplex ${preco}`,
        'Geladeira usada, funcionando bem, sem avarias. Comparável de teste do agente de IA.',
        preco, CEP_TESTE.replace(/\D/g, ''), BAIRRO_TESTE,
      ]
    );
  }
}

async function limpar(vendedorId) {
  await pool.query(
    `DELETE FROM anuncio_imagens WHERE anuncio_id IN (SELECT id FROM anuncios WHERE vendedor_id = $1)`,
    [vendedorId]
  );
  await pool.query(`DELETE FROM indicios_moderacao WHERE vendedor_id = $1`, [vendedorId]);
  await pool.query(`DELETE FROM conversas_ia_anuncio WHERE vendedor_id = $1`, [vendedorId]);
  await pool.query(`DELETE FROM anuncios WHERE vendedor_id = $1`, [vendedorId]);
}

async function rodarCaso(caso, vendedorId) {
  let estado = await estadoInicial({ cep: CEP_TESTE, bairro: BAIRRO_TESTE });
  let ultimoResultado = null;

  try {
    for (const fala of caso.falas) {
      const resultado = await rodarAgente({
        estado,
        mensagemVendedor: fala,
        // Simula que o vendedor já anexou fotos — fotos ficam fora do loop
        // do LLM (ver plano), então o teste não precisa exercitar upload real.
        imagens: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='],
        vendedorId,
      });
      estado = resultado.estado;
      ultimoResultado = resultado;
      if (estado.finalizado) break;
    }
  } catch (erro) {
    // Mesmo se o LLM falhar no meio (timeout, rate limit), devolve o estado
    // parcial acumulado até aqui — a trajetória ajuda a diagnosticar onde
    // parou, em vez de só saber que deu erro.
    erro.estadoParcial = estado;
    throw erro;
  }

  return ultimoResultado;
}

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.error('❌ LLM_API_KEY não configurada no .env — sem isso não dá pra rodar o teste.');
    process.exit(1);
  }

  const vendedorId = await garantirVendedorTeste();
  await limpar(vendedorId); // garante estado limpo caso uma execução anterior tenha falhado no meio
  await semearComparaveis(vendedorId);

  console.log(`\n🧪 Rodando ${casos.length} casos do Agente de Anúncio (vendedor de teste #${vendedorId})...\n`);

  let passou = 0;
  const falhas = [];

  for (const caso of casos) {
    process.stdout.write(`  ${caso.nome}... `);
    try {
      const resultado = await rodarCaso(caso, vendedorId);
      const status = resultado?.status;
      const ok = status === caso.statusEsperado;
      console.log(ok ? `✅ (${status})` : `❌ esperado "${caso.statusEsperado}", veio "${status}"`);
      if (ok) {
        passou++;
      } else {
        falhas.push({ ...caso, statusObtido: status });
        // Trajetória completa pra diagnosticar por que o agente não chegou
        // no status esperado (ex. detector de laço, ação repetida).
        const trajetoria = resultado?.estado?.trajetoria || [];
        console.log(`    trajetória (${trajetoria.length} passos):`);
        for (const t of trajetoria) {
          console.log(`      [${t.passo}] ${t.entrada?.acao} -> ${JSON.stringify(t.saida)?.slice(0, 200)}`);
        }
      }
    } catch (erro) {
      console.log(`❌ erro: ${erro.message}`);
      falhas.push({ ...caso, statusObtido: `erro: ${erro.message}` });
      const trajetoria = erro.estadoParcial?.trajetoria || [];
      if (trajetoria.length > 0) {
        console.log(`    trajetória parcial (${trajetoria.length} passos):`);
        for (const t of trajetoria) {
          console.log(`      [${t.passo}] ${t.entrada?.acao} -> ${JSON.stringify(t.saida)?.slice(0, 200)}`);
        }
      }
    }
    // Limpa entre casos pra não acumular anúncios/indícios de casos anteriores
    // (mas re-semeia os comparáveis, que cada caso de geladeira depende deles).
    await limpar(vendedorId);
    await semearComparaveis(vendedorId);
    // Respiro entre casos — tiers gratuitos de LLM costumam ter rate limit
    // agressivo, e cada caso já dispara várias chamadas seguidas.
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  await limpar(vendedorId);

  console.log(`\n${passou}/${casos.length} casos passaram.\n`);

  const falhaCritica = falhas.find((f) => f.critico);
  if (falhaCritica) {
    console.error('🚨 O caso crítico "Avaria negada" falhou — isso é bloqueante. NÃO habilite a');
    console.error('   funcionalidade em produção até esse caso passar de forma consistente.');
  }

  process.exit(falhas.length > 0 ? 1 : 0);
}

main().catch((erro) => {
  console.error('Erro fatal no script de teste:', erro);
  process.exit(1);
});
