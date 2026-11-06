import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Anunciar from '../src/pages/Anunciar';
import { renderComRota, respostaJson, simularFetch, logar } from './helpers';

// O redimensionamento real é testado em imagem.test.js; aqui só devolve uma foto pronta
vi.mock('../src/utils/imagem', () => ({
  redimensionarImagem: vi.fn(async (file) => `data:image/jpeg;base64,${file.name}`),
}));
// Os assistentes de IA têm testes próprios na API
vi.mock('../src/componentes/AgenteAnuncioChat', () => ({ default: () => <div>chat da IA</div> }));
vi.mock('../src/componentes/AnuncioRapidoIA', () => ({ default: () => <div>anúncio rápido</div> }));

const CATEGORIAS = [
  { id: 1, nome: 'Móveis', subcategorias: [{ id: 11, nome: 'Sofás' }, { id: 12, nome: 'Mesas' }] },
  { id: 8, nome: 'Outros', subcategorias: [] },
];
const PERFIL = { usuario: { id: 2, nome: 'Caio', cep: '04710150', bairro: 'Campo Belo' } };

const foto = (nome, tipo = 'image/jpeg') => new File(['x'], nome, { type: tipo });
const abrir = async (rotas = {}) => {
  logar({ id: 2, nome: 'Caio' });
  const fetchFalso = simularFetch({
    '/api/categorias': respostaJson({ categorias: CATEGORIAS }),
    '/api/usuario/perfil': respostaJson(PERFIL),
    '/api/anuncios': respostaJson({ anuncio: { id: 77, titulo: 'Sofá 3 lugares' } }, 201),
    ...rotas,
  });
  renderComRota(<Anunciar />, { rota: '/anunciar', caminho: '/anunciar' });
  await screen.findByRole('heading', { name: /Criar anúncio/ });
  return { user: userEvent.setup({ applyAccept: false }), fetchFalso };
};
const campo = (placeholder) => screen.getByPlaceholderText(placeholder);
const inputFotos = () => document.querySelector('input[type="file"]');
const publicar = (user) => user.click(screen.getByRole('button', { name: /Publicar anúncio/ }));
const erro = () => document.querySelector('.anunciar-alert.error')?.textContent || '';
const corpoEnviado = (fetchFalso) => {
  const chamada = fetchFalso.mock.calls.find(([url, op]) => String(url).endsWith('/api/anuncios') && op?.method === 'POST');
  return chamada ? JSON.parse(chamada[1].body) : null;
};

const preencher = async (user, { estado = 'Usado', sub = 'Sofás', preco = '850,50', fotos = 1 } = {}) => {
  await user.type(campo(/Ex: Sofá 3 lugares/), 'Sofá 3 lugares retrátil');
  await user.type(campo(/Descreva o produto/), 'Sofá cinza, 3 lugares, retrátil e reclinável, sem rasgos.');
  if (estado) await user.click(screen.getByText(estado));
  const [principal, subcategoria] = screen.getAllByRole('combobox');
  await user.selectOptions(principal, 'Móveis');
  if (sub) await user.selectOptions(subcategoria, sub);
  if (preco) await user.type(campo('0,00'), preco);
  if (fotos) await user.upload(inputFotos(), Array.from({ length: fotos }, (_, i) => foto(`foto${i + 1}.jpg`)));
};

beforeEach(() => vi.clearAllMocks());

/* ─────────────────────────────────────────────────────────── */
describe('RF06 - Anúncio de Produtos', () => {
  test('sem login, quem tenta anunciar vai para o login', async () => {
    simularFetch();
    renderComRota(<Anunciar />, { rota: '/anunciar', caminho: '/anunciar' });
    expect(await screen.findByTestId('rota-atual')).toHaveTextContent('/login');
  });

  test('o CEP e o bairro do anúncio já vêm do cadastro do vendedor', async () => {
    await abrir();
    expect(campo('04000-000')).toHaveValue('04710-150');
    expect(screen.getAllByRole('combobox')[2]).toHaveValue('Campo Belo');
  });

  test('oferece preencher à mão, conversar com a IA ou fazer o anúncio rápido', async () => {
    const { user } = await abrir();
    await user.click(screen.getByRole('button', { name: /Conversar com IA/ }));
    expect(screen.getByText('chat da IA')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Anúncio rápido/ }));
    expect(screen.getByText('anúncio rápido')).toBeInTheDocument();
  });

  test('anúncio completo é publicado com os dados certos', async () => {
    const { user, fetchFalso } = await abrir();
    await preencher(user);
    await publicar(user);

    expect(await screen.findByText(/Seu anúncio está/)).toBeInTheDocument();
    expect(corpoEnviado(fetchFalso)).toEqual({
      titulo: 'Sofá 3 lugares retrátil',
      descricao: 'Sofá cinza, 3 lugares, retrátil e reclinável, sem rasgos.',
      preco: 850.5, estado_conservacao: 'usado', categoria_id: 11,
      cep: '04710150', bairro: 'Campo Belo', imagens: ['data:image/jpeg;base64,foto1.jpg'],
    });
  });

  test('título com menos de 5 caracteres não é publicado', async () => {
    const { user, fetchFalso } = await abrir();
    await publicar(user);
    expect(erro()).toMatch('Título precisa ter pelo menos 5 caracteres.');
    expect(corpoEnviado(fetchFalso)).toBeNull();
  });

  test('o contador mostra quantos caracteres do título foram usados', async () => {
    const { user } = await abrir();
    await user.type(campo(/Ex: Sofá 3 lugares/), 'Sofá');
    expect(screen.getByText('4/120')).toBeInTheDocument();
  });

  test('descrição curta não é publicada', async () => {
    const { user } = await abrir();
    await user.type(campo(/Ex: Sofá 3 lugares/), 'Sofá 3 lugares');
    await user.type(campo(/Descreva o produto/), 'Sofá bom');
    await publicar(user);
    expect(erro()).toMatch('Descrição precisa ter pelo menos 20 caracteres.');
  });

  test('categoria com subcategorias exige escolher a subcategoria', async () => {
    const { user } = await abrir();
    await preencher(user, { sub: null });
    await publicar(user);
    expect(erro()).toMatch('Selecione uma subcategoria.');
  });

  test('categoria sem subcategorias publica com a categoria principal', async () => {
    const { user, fetchFalso } = await abrir();
    await preencher(user, { sub: null });
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Outros');
    await publicar(user);
    await screen.findByText(/Seu anúncio está/);
    expect(corpoEnviado(fetchFalso).categoria_id).toBe(8);
  });

  test('o preço aceita só números e vírgula, com até 2 casas', async () => {
    const { user } = await abrir();
    await user.type(campo('0,00'), 'R$ 89,909');
    expect(campo('0,00')).toHaveValue('89,90');
  });

  test('preço zero não é publicado', async () => {
    const { user } = await abrir();
    await preencher(user, { preco: '0' });
    await publicar(user);
    expect(erro()).toMatch('Informe um preço válido (maior que zero).');
  });

  test('erro da API (ex.: CEP fora da área) aparece na tela', async () => {
    const { user } = await abrir({
      '/api/anuncios': respostaJson({ erro: 'Anúncios só podem ser publicados em CEPs de Santo Amaro. [RN01]' }, 400),
    });
    await preencher(user);
    await publicar(user);
    await waitFor(() => expect(erro()).toMatch('[RN01]'));
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN15 - Classificação de Estado de Conservação', () => {
  test('o vendedor escolhe entre Novo, Seminovo, Usado e Para reparo', async () => {
    await abrir();
    for (const estado of ['Novo', 'Seminovo', 'Usado', 'Para reparo']) {
      expect(screen.getByText(estado)).toBeInTheDocument();
    }
  });

  test('sem estado de conservação o anúncio não é publicado', async () => {
    const { user, fetchFalso } = await abrir();
    await preencher(user, { estado: null });
    await publicar(user);
    expect(erro()).toMatch('Selecione o estado de conservação.');
    expect(corpoEnviado(fetchFalso)).toBeNull();
  });

  test('"Para reparo" é enviado como para-reparo', async () => {
    const { user, fetchFalso } = await abrir();
    await preencher(user, { estado: 'Para reparo' });
    await publicar(user);
    await screen.findByText(/Seu anúncio está/);
    expect(corpoEnviado(fetchFalso).estado_conservacao).toBe('para-reparo');
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RNF19 - Limites de Upload', () => {
  test('sem foto o anúncio não é publicado', async () => {
    const { user } = await abrir();
    await preencher(user, { fotos: 0 });
    await publicar(user);
    expect(erro()).toMatch('Envie pelo menos 1 foto do produto.');
  });

  test('aceita até 6 fotos e esconde o botão de adicionar', async () => {
    const { user } = await abrir();
    await user.upload(inputFotos(), Array.from({ length: 6 }, (_, i) => foto(`f${i}.jpg`)));
    expect(screen.getByText('6/6')).toBeInTheDocument();
    expect(inputFotos()).toBeNull();
  });

  test('a 7ª foto é recusada', async () => {
    const { user } = await abrir();
    await user.upload(inputFotos(), Array.from({ length: 5 }, (_, i) => foto(`f${i}.jpg`)));
    await user.upload(inputFotos(), [foto('a.jpg'), foto('b.jpg')]);
    expect(erro()).toMatch('Você pode enviar no máximo 6 imagens. Já tem 5.');
    expect(screen.getByText('5/6')).toBeInTheDocument();
  });

  test('arquivo que não é imagem é recusado', async () => {
    const { user } = await abrir();
    await user.upload(inputFotos(), [foto('contrato.pdf', 'application/pdf')]);
    expect(erro()).toMatch('Aceitamos apenas imagens');
    expect(screen.getByText('0/6')).toBeInTheDocument();
  });

  test('foto acima de 5 MB é recusada', async () => {
    const { user } = await abrir();
    const grande = foto('grande.jpg');
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 });
    await user.upload(inputFotos(), [grande]);
    expect(erro()).toMatch('passa de 5MB');
  });

  test('toda foto passa pelo redimensionamento antes de ir para o anúncio', async () => {
    const { redimensionarImagem } = await import('../src/utils/imagem');
    const { user } = await abrir();
    await user.upload(inputFotos(), [foto('a.jpg'), foto('b.jpg')]);
    expect(redimensionarImagem).toHaveBeenCalledTimes(2);
  });

  test('a primeira foto é a principal e dá para remover fotos', async () => {
    const { user } = await abrir();
    await user.upload(inputFotos(), [foto('a.jpg'), foto('b.jpg')]);
    expect(screen.getByText('PRINCIPAL')).toBeInTheDocument();
    await user.click(screen.getAllByTitle('Remover')[0]);
    expect(screen.getByText('1/6')).toBeInTheDocument();
    expect(screen.getByAltText('Foto 1')).toHaveAttribute('src', 'data:image/jpeg;base64,b.jpg');
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RNF12 - Acessibilidade WCAG 2.1 Nível AA', () => {
  test('o campo "Título" do anúncio tem rótulo ligado a ele', async () => {
    await abrir();
    expect(screen.getByLabelText(/^Título/)).toBeInTheDocument();
  });

  test('o estado de conservação pode ser escolhido pelo teclado', async () => {
    await abrir();
    expect(screen.getByRole('radio', { name: /Usado/ })).toBeInTheDocument();
  });

  test('cada foto enviada tem texto alternativo', async () => {
    const { user } = await abrir();
    await user.upload(inputFotos(), [foto('a.jpg')]);
    expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
  });
});
