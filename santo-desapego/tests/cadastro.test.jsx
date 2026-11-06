import { describe, test, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Cadastro from '../src/pages/Cadastro';
import { renderComRota, respostaJson, simularFetch } from './helpers';

const VIACEP_SANTO_AMARO = respostaJson({ logradouro: 'Rua Padre José de Anchieta', bairro: 'Brooklin' });
const CADASTRO_OK = respostaJson({ usuario: { id: 1 }, verificacao: { desafio: 'abc', email_mascarado: 'an***@teste.com', finalidade: 'cadastro' } }, 201);

const campo = (placeholder) => screen.getByPlaceholderText(placeholder);
const abrir = (rotas = {}) => {
  const fetchFalso = simularFetch({ viacep: VIACEP_SANTO_AMARO, '/api/auth/cadastro': CADASTRO_OK, ...rotas });
  renderComRota(<Cadastro />, { rota: '/cadastro' });
  return { user: userEvent.setup(), fetchFalso };
};

// Preenche o formulário inteiro com dados válidos (dá para trocar campos)
const preencher = async (user, dados = {}) => {
  const d = {
    nome: 'Ana', sobrenome: 'Lima', cpf: '52998224725', telefone: '11987654321',
    email: 'Ana@Teste.com', confirmEmail: 'Ana@Teste.com', senha: 'Desapego@2026', confirmSenha: 'Desapego@2026',
    cep: '04710150', numero: '10', termos: true, ...dados,
  };
  if (d.nome) await user.type(campo('Ex: Mariana'), d.nome);
  if (d.sobrenome) await user.type(campo('Ex: Costa'), d.sobrenome);
  if (d.cpf) await user.type(campo('000.000.000-00'), d.cpf);
  if (d.telefone) await user.type(campo('(11) 99999-9999'), d.telefone);
  if (d.email) await user.type(campo('voce@email.com'), d.email);
  if (d.confirmEmail) await user.type(campo('repita seu e-mail'), d.confirmEmail);
  if (d.senha) await user.type(campo('Mínimo 8 caracteres'), d.senha);
  if (d.confirmSenha) await user.type(campo('repita sua senha'), d.confirmSenha);
  if (d.cep) {
    await user.type(campo('04000-000'), d.cep);
    await waitFor(() => expect(campo('Rua, Av., Travessa...')).not.toHaveValue(''));
  }
  if (d.numero) await user.type(campo('Ex: 123'), d.numero);
  if (d.termos) await user.click(screen.getByText(/Li e aceito os/));
};
const enviar = (user) => user.click(screen.getByRole('button', { name: /Criar minha conta grátis/ }));
const corpoDoCadastro = (fetchFalso) => {
  const chamada = fetchFalso.mock.calls.find(([url]) => String(url).includes('/api/auth/cadastro'));
  return chamada ? JSON.parse(chamada[1].body) : null;
};

/* ─────────────────────────────────────────────────────────── */
describe('RF01 - Gestão de Perfil Geográfico', () => {
  test('CEP de Santo Amaro preenche o endereço e o bairro sozinho', async () => {
    const { user } = abrir();
    await user.type(campo('04000-000'), '04710150');

    await waitFor(() => expect(campo('Rua, Av., Travessa...')).toHaveValue('Rua Padre José de Anchieta'));
    expect(screen.getByRole('combobox')).toHaveValue('Brooklin');
    expect(campo('04000-000')).toHaveValue('04710-150');
  });

  test('CEP de fora da área avisa, marca "Outro bairro" e deixa concluir o cadastro', async () => {
    const { user } = abrir({ viacep: respostaJson({ logradouro: 'Av. Paulista', bairro: 'Bela Vista' }) });
    await user.type(campo('04000-000'), '01310100');

    expect(await screen.findByText(/fora da área de Santo Amaro/)).toBeInTheDocument();
    expect(screen.getByText(/Você pode concluir o cadastro normalmente/)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Outro bairro');
  });

  test('CEP que não existe mostra o erro', async () => {
    const { user } = abrir({ viacep: respostaJson({ erro: true }) });
    await user.type(campo('04000-000'), '99999999');
    expect(await screen.findByText('CEP não encontrado. Verifique o número digitado.')).toBeInTheDocument();
  });

  test('se a consulta de CEP falhar, pede para preencher o endereço à mão', async () => {
    const { user } = abrir({ viacep: () => { throw new Error('offline'); } });
    await user.type(campo('04000-000'), '04710150');
    expect(await screen.findByText(/Preencha o endereço manualmente/)).toBeInTheDocument();
  });

  test('o telefone ganha máscara (11) 98765-4321', async () => {
    const { user } = abrir();
    await user.type(campo('(11) 99999-9999'), '11987654321');
    expect(campo('(11) 99999-9999')).toHaveValue('(11) 98765-4321');
  });

  test('e-mail inválido e confirmação diferente são apontados na hora', async () => {
    const { user } = abrir();
    await user.type(campo('voce@email.com'), 'ana@');
    expect(screen.getByText('E-mail inválido.')).toBeInTheDocument();
    await user.type(campo('repita seu e-mail'), 'outro@teste.com');
    expect(screen.getAllByText(/Os e-mails não coincidem/).length).toBeGreaterThan(0);
  });

  test('senhas diferentes são apontadas na hora', async () => {
    const { user } = abrir();
    await user.type(campo('Mínimo 8 caracteres'), 'Desapego@2026');
    await user.type(campo('repita sua senha'), 'Desapego@2027');
    expect(screen.getByText(/As senhas não coincidem/)).toBeInTheDocument();
  });

  test('formulário vazio não é enviado e o primeiro campo faltando é avisado', async () => {
    const { user, fetchFalso } = abrir();
    await enviar(user);
    expect(screen.getByText('Por favor, preencha o nome.')).toBeInTheDocument();
    expect(corpoDoCadastro(fetchFalso)).toBeNull();
  });

  test('cadastro completo envia os dados sem máscara e o e-mail em minúsculas', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user);
    await enviar(user);

    await waitFor(() => expect(corpoDoCadastro(fetchFalso)).not.toBeNull());
    expect(corpoDoCadastro(fetchFalso)).toMatchObject({
      nome: 'Ana', sobrenome: 'Lima', cpf: '52998224725', telefone: '11987654321',
      email: 'ana@teste.com', cep: '04710150', logradouro: 'Rua Padre José de Anchieta',
      numero: '10', bairro: 'Brooklin', aceita_termos: true,
    });
  });

  test('depois de cadastrar, pede o código enviado para confirmar o e-mail', async () => {
    const { user } = abrir();
    await preencher(user);
    await enviar(user);
    expect(await screen.findByRole('heading', { name: /Confirme seu e-mail/ })).toBeInTheDocument();
  });

  test('se o e-mail do código não sair, a conta é criada e pede para fazer login', async () => {
    const { user } = abrir({ '/api/auth/cadastro': respostaJson({ usuario: { id: 1 }, verificacao: null }, 201) });
    await preencher(user);
    await enviar(user);
    expect(await screen.findByRole('link', { name: /Fazer login agora/ })).toBeInTheDocument();
  });

  test('erro da API (ex.: CPF já cadastrado) aparece na tela', async () => {
    const { user } = abrir({ '/api/auth/cadastro': respostaJson({ erro: 'E-mail ou CPF já cadastrado na plataforma.' }, 409) });
    await preencher(user);
    await enviar(user);
    expect(await screen.findByText('E-mail ou CPF já cadastrado na plataforma.')).toBeInTheDocument();
  });

  test('servidor fora do ar mostra aviso', async () => {
    const { user } = abrir({ '/api/auth/cadastro': () => { throw new Error('offline'); } });
    await preencher(user);
    await enviar(user);
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN02 - Verificação de Identidade (Compliance)', () => {
  test('o CPF ganha máscara 000.000.000-00', async () => {
    const { user } = abrir();
    await user.type(campo('000.000.000-00'), '52998224725');
    expect(campo('000.000.000-00')).toHaveValue('529.982.247-25');
  });

  test('CPF com dígitos verificadores errados é apontado na hora', async () => {
    const { user } = abrir();
    await user.type(campo('000.000.000-00'), '12345678900');
    expect(screen.getByText('CPF inválido.')).toBeInTheDocument();
  });

  test('CPF com todos os dígitos iguais é inválido', async () => {
    const { user } = abrir();
    await user.type(campo('000.000.000-00'), '11111111111');
    expect(screen.getByText('CPF inválido.')).toBeInTheDocument();
  });

  test('CPF válido não mostra erro', async () => {
    const { user } = abrir();
    await user.type(campo('000.000.000-00'), '52998224725');
    expect(screen.queryByText('CPF inválido.')).not.toBeInTheDocument();
  });

  test('com CPF inválido o cadastro não é enviado', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user, { cpf: '12345678900' });
    await enviar(user);
    expect(screen.getByText('CPF inválido. Verifique os dígitos.')).toBeInTheDocument();
    expect(corpoDoCadastro(fetchFalso)).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN03 - Política de Senhas Robustas', () => {
  test.each([
    ['abc', 'Muito fraca'],
    ['abcdefgh', 'Muito fraca'],
    ['Abcdefgh', 'Fraca'],
    ['Abcdefg1', 'Média'],
    ['Abcdef1@', 'Forte'],
  ])('a senha "%s" aparece como "%s"', async (senha, forca) => {
    const { user } = abrir();
    await user.type(campo('Mínimo 8 caracteres'), senha);
    expect(screen.getByText(`Força: ${forca}`)).toBeInTheDocument();
  });

  test('senha com menos de 8 caracteres não é enviada', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user, { senha: 'Ab1@', confirmSenha: 'Ab1@' });
    await enviar(user);
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres.')).toBeInTheDocument();
    expect(corpoDoCadastro(fetchFalso)).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RN11 - Consentimento Livre e Esclarecido', () => {
  test('sem aceitar os Termos de Uso o cadastro não é enviado', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user, { termos: false });
    await enviar(user);
    expect(screen.getByText('Você precisa aceitar os Termos de Uso para continuar.')).toBeInTheDocument();
    expect(corpoDoCadastro(fetchFalso)).toBeNull();
  });

  test('os Termos de Uso e a Política de Privacidade abrem para leitura', async () => {
    const { user } = abrir();
    await user.click(screen.getAllByRole('link', { name: 'Termos de Uso' })[0]);
    const dialogo = screen.getByRole('dialog', { name: /Termos de Uso e Política de Privacidade/ });
    expect(screen.getByRole('tab', { name: 'Termos de Uso' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Privacidade (LGPD)' }));
    expect(screen.getByRole('tab', { name: 'Privacidade (LGPD)' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Escape}');
    expect(dialogo).not.toBeInTheDocument();
  });

  test('abrir os termos não marca o aceite sozinho', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user, { termos: false });
    await user.click(screen.getAllByRole('link', { name: 'Termos de Uso' })[0]);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await enviar(user);
    expect(corpoDoCadastro(fetchFalso)).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RF22 - Newsletter', () => {
  test('a newsletter vem desmarcada (opt-in)', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user);
    await enviar(user);
    await waitFor(() => expect(corpoDoCadastro(fetchFalso)).not.toBeNull());
    expect(corpoDoCadastro(fetchFalso).recebe_newsletter).toBe(false);
  });

  test('quem marca a opção recebe a newsletter', async () => {
    const { user, fetchFalso } = abrir();
    await preencher(user);
    await user.click(screen.getByText(/Quero receber novidades/));
    await enviar(user);
    await waitFor(() => expect(corpoDoCadastro(fetchFalso)).not.toBeNull());
    expect(corpoDoCadastro(fetchFalso).recebe_newsletter).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────── */
describe('RNF12 - Acessibilidade WCAG 2.1 Nível AA', () => {
  // WCAG 1.3.1 / 4.1.2: o leitor de tela precisa anunciar o nome de cada campo
  test.each(['Nome', 'CPF', 'E-mail', 'Senha', 'CEP'])('o campo "%s" do cadastro tem rótulo ligado a ele', (rotulo) => {
    abrir();
    expect(screen.getByLabelText(new RegExp(`^${rotulo}`))).toBeInTheDocument();
  });

  // WCAG 2.1.1: tudo precisa funcionar pelo teclado
  test('o aceite dos Termos é uma caixa de seleção que funciona pelo teclado', () => {
    abrir();
    expect(screen.getByRole('checkbox', { name: /Termos de Uso/ })).toBeInTheDocument();
  });

  test('os erros do formulário são anunciados ao leitor de tela', async () => {
    const { user } = abrir();
    await enviar(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Por favor, preencha o nome.');
  });
});
