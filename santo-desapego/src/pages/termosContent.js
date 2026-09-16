/* ── Termos de Uso e Política de Privacidade ────────────────
   Conteúdo extraído dos Apêndices E e F do documento de
   entrega final do TCC (Termos de Uso e Política de Privacidade).
   ──────────────────────────────────────────────────────────── */

export const TERMOS_USO = [
  {
    titulo: '1. Apresentação e Aceitação',
    paragrafos: [
      'Estes Termos de Uso regulam o acesso e a utilização da plataforma digital Santo Desapego, desenvolvida no âmbito do TCC do Bacharelado em Sistemas de Informação do Centro Universitário Senac – Santo Amaro, pelos autores Luisa Vitoria Aquino Nascimento, Maria Erica Joana da Conceição Cruz e Paulo Henrique Alves Santana.',
      'A Plataforma é um sistema de intermediação de compra e venda de produtos novos e usados baseado no modelo de economia compartilhada, voltado ao fortalecimento do comércio de proximidade no distrito de Santo Amaro, em São Paulo/SP.',
      'Ao criar uma conta ou realizar qualquer transação, o Usuário declara ter lido, compreendido e concordado integralmente com estes Termos e com a Política de Privacidade. O aceite eletrônico é registrado com data, hora e versão do documento, em conformidade com a LGPD – Lei n.º 13.709/2018.',
    ],
  },
  {
    titulo: '2. Definições',
    lista: [
      'Plataforma: sistema web Santo Desapego que intermedia transações de compra e venda entre usuários.',
      'Usuário: pessoa física cadastrada, podendo atuar como Comprador, Vendedor ou ambos.',
      'Anúncio: publicação de produto realizada pelo Vendedor, contendo descrição, fotos, preço e estado de conservação.',
      'Escrow: mecanismo de retenção do valor pago pelo Comprador até a confirmação do recebimento do produto.',
      'Taxa de Intermediação: comissão de 5% (cinco por cento) retida pela Plataforma sobre o valor bruto de cada venda concluída.',
    ],
  },
  {
    titulo: '3. Elegibilidade e Cadastro',
    paragrafos: [
      'O cadastro é permitido exclusivamente a pessoas físicas maiores de 18 (dezoito) anos e plenamente capazes. O Usuário deve fornecer: nome completo, e-mail válido, CPF e CEP. O usuário é responsável pela veracidade das informações fornecidas. Cadastros com dados falsos serão cancelados sem aviso prévio.',
      'A senha deve respeitar a política de complexidade definida em: mínimo de 8 caracteres, letras maiúsculas e minúsculas, número e caractere especial. É vedado o uso de dados pessoais na senha.',
    ],
  },
  {
    titulo: '4. Funcionamento da Plataforma e Regras de Uso',
    paragrafos: [
      'A presente seção estabelece as diretrizes fundamentais para a utilização da Plataforma, definindo as normas de conduta e os procedimentos que regem as interações entre os usuários. O cumprimento destas regras é indispensável para assegurar a transparência, a segurança e a confiabilidade em todo o ambiente virtual.',
    ],
    subsecoes: [
      {
        titulo: '4.1 Anúncios',
        paragrafos: [
          'O Vendedor pode publicar produtos novos ou usados respeitando as regras de negócio da Plataforma. Anúncios devem conter título, descrição, categoria, ao menos uma foto e estado de conservação (Novo, Como Novo, Bom Estado ou Marcas de Uso). Anúncios com conteúdo ilícito ou que violem os presentes Termos serão bloqueados automaticamente ou removidos pela moderação. O prazo de vigência de cada anúncio ativo é de 30 (trinta) dias, renovável mediante confirmação do Vendedor.',
        ],
      },
      {
        titulo: '4.2 Transações e Pagamentos',
        paragrafos: [
          'Pagamentos são processados exclusivamente pela API do Mercado Pago, aceitando Pix, Cartão de Crédito e Boleto. A Plataforma não armazena dados brutos de cartão, em conformidade com o padrão PCI-DSS. O status "Vendido" somente é atribuído após confirmação de pagamento pela API. O valor pago fica retido em Escrow até a confirmação de recebimento pelo Comprador. A Taxa de Intermediação de 5% é deduzida automaticamente do valor bruto no momento da liquidação, sendo exibida ao Vendedor antes da confirmação da venda.',
        ],
      },
      {
        titulo: '4.3 Sistema de Reputação',
        paragrafos: [
          'Após a conclusão de cada venda, ambas as partes devem avaliar a experiência com nota de 1 a 5 estrelas e comentário. Avaliações pendentes há mais de 48 horas bloqueiam novas operações do usuário. A Plataforma se reserva o direito de remover avaliações que contenham conteúdo ofensivo ou fraudulento.',
        ],
      },
    ],
  },
  {
    titulo: '5. Responsabilidades e Limitações',
    paragrafos: [
      'A Plataforma atua exclusivamente como intermediária entre Comprador e Vendedor, não sendo partícipe das negociações nem responsável pela qualidade, procedência ou existência dos produtos anunciados. Os Usuários são inteiramente responsáveis pelas informações que publicam e pelas transações que realizam. A Plataforma não se responsabiliza por danos decorrentes de informações falsas prestadas por Usuários.',
    ],
    lista: [
      'É vedado publicar produtos ilícitos, armas, materiais adultos ou itens proibidos por lei.',
      'É vedado utilizar a Plataforma para práticas fraudulentas.',
      'É vedado contornar o sistema de pagamento integrado para realizar transações externas.',
      'É vedado praticar quaisquer atos que prejudiquem outros usuários ou a integridade da Plataforma.',
    ],
  },
  {
    titulo: '6. Suspensão e Encerramento de Conta',
    paragrafos: [
      'A Plataforma pode suspender ou encerrar contas que violem estes Termos, a critério do Moderador ou do sistema automático. O Usuário pode solicitar o encerramento da sua conta a qualquer momento. Nesse caso, os dados pessoais serão excluídos ou anonimizados, respeitado o prazo legal de retenção de 5 (cinco) anos para registros financeiros, conforme a LGPD.',
    ],
  },
  {
    titulo: '7. Alterações dos Termos',
    paragrafos: [
      'Estes Termos poderão ser revisados periodicamente. Alterações relevantes serão comunicadas por e-mail e/ou por notificação in-app. A continuidade do uso da Plataforma após a comunicação implica aceitação dos novos Termos, cujo registro de consentimento será atualizado.',
    ],
  },
  {
    titulo: '8. Foro e Legislação Aplicável',
    paragrafos: [
      'Estes Termos são regidos pelas leis brasileiras, em especial a Lei n.º 13.709/2018 (LGPD), o Código de Defesa do Consumidor (Lei n.º 8.078/1990) e o Marco Civil da Internet (Lei n.º 12.965/2014). Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias.',
    ],
  },
];

export const POLITICA_PRIVACIDADE = [
  {
    titulo: '1. Controlador dos Dados',
    paragrafos: [
      'O controlador dos dados pessoais, nos termos do art. 5.º, VI, da LGPD, é a equipe de desenvolvimento da plataforma Santo Desapego – Luisa Vitoria Aquino Nascimento, Maria Erica Joana da Conceição Cruz e Paulo Henrique Alves Santana – vinculada ao Centro Universitário Senac, Santo Amaro, São Paulo/SP.',
    ],
  },
  {
    titulo: '2. Dados Coletados e Finalidades',
    paragrafos: [
      'Em observância ao princípio da minimização de dados, a Plataforma coleta apenas as informações estritamente necessárias para a prestação do serviço, organizadas nas categorias abaixo:',
    ],
    lista: [
      'Dados de Identificação: nome completo, CPF e endereço de e-mail, coletados para criação e autenticação da conta.',
      'Dados de Localização: CEP, utilizado para validação geográfica e ordenação de anúncios por proximidade.',
      'Dados de Transação: histórico de compras e vendas, status de pagamentos e avaliações, para rastreabilidade e comprovantes.',
      'Dados de Navegação: logs de acesso e metadados de sessão, utilizados para segurança e auditoria.',
      'Registro de Consentimento: timestamp, versão do documento e IP de aceite dos Termos de Uso e desta Política.',
    ],
    rodape: 'É expressamente vedada a coleta de dados sensíveis (origem racial, convicções religiosas, biometria ou orientação sexual).',
  },
  {
    titulo: '3. Base Legal para o Tratamento',
    paragrafos: [
      'O tratamento dos dados pessoais é realizado com as seguintes bases legais previstas nos arts. 7.º e 11 da LGPD: consentimento livre e esclarecido, obtido no ato do cadastro; execução de contrato, para viabilizar as transações entre Comprador e Vendedor; obrigação legal, para retenção de registros financeiros pelo prazo exigido em lei; e legítimo interesse da Plataforma, para segurança e prevenção de fraudes.',
    ],
  },
  {
    titulo: '4. Segurança dos Dados',
    paragrafos: [
      'A Plataforma adota medidas técnicas e organizacionais alinhadas ao princípio de Privacy by Design.',
    ],
    lista: [
      'Criptografia de senhas via hashing no banco de dados.',
      'Comunicação cifrada por protocolo TLS/SSL – HTTPS obrigatório.',
      'Controle de acesso baseado em papéis (RBAC) por perfil de Comprador, Vendedor, Moderador e Administrador.',
      'Não armazenamento de dados brutos de cartão, delegado à API do Mercado Pago em conformidade com PCI-DSS.',
      'Logs de auditoria para rastreabilidade de ações críticas.',
    ],
  },
  {
    titulo: '5. Compartilhamento de Dados com Terceiros',
    paragrafos: [
      'Os dados dos Usuários não são vendidos nem cedidos a terceiros para fins comerciais. O compartilhamento ocorre somente nas seguintes hipóteses:',
    ],
    lista: [
      'Mercado Pago, para processamento de pagamentos, na medida estritamente necessária à confirmação da transação.',
      'Autoridades públicas, mediante requisição legal fundamentada.',
      'Entre os próprios usuários da Plataforma, limitado aos dados do perfil público.',
    ],
  },
  {
    titulo: '6. Direitos do Titular',
    paragrafos: [
      'Em conformidade com os arts. 17 a 22 da LGPD, o Usuário tem direito a, a qualquer tempo:',
    ],
    lista: [
      'Confirmação e acesso: verificar quais dados são tratados pela Plataforma.',
      'Portabilidade: exportar seus dados em formato JSON ou CSV.',
      'Correção: atualizar dados incompletos, inexatos ou desatualizados diretamente no perfil.',
      'Exclusão (direito ao esquecimento): solicitar a exclusão ou anonimização da conta, ressalvados os registros financeiros retidos por obrigação legal por até 5 anos.',
      'Revogação do consentimento: retirar o consentimento a qualquer momento, o que implicará o encerramento do acesso à Plataforma.',
    ],
  },
  {
    titulo: '7. Retenção e Eliminação de Dados',
    paragrafos: [
      'Dados de perfil e anúncios são excluídos ou anonimizados após o encerramento da conta. Registros de transações financeiras são mantidos em modo somente leitura por 5 (cinco) anos para cumprimento de obrigações legais e fiscais. Logs de auditoria de segurança são retidos pelo prazo mínimo exigido pela legislação vigente.',
    ],
  },
  {
    titulo: '8. Cookies e Tecnologias Similares',
    paragrafos: [
      'A Plataforma utiliza cookies de sessão estritamente necessários para autenticação e segurança, não empregando cookies de rastreamento ou publicidade. O Usuário pode configurar seu navegador para recusar cookies, o que poderá afetar funcionalidades dependentes de sessão autenticada.',
    ],
  },
  {
    titulo: '9. Alterações desta Política',
    paragrafos: [
      'Esta Política poderá ser atualizada para refletir mudanças legais ou operacionais. Alterações serão comunicadas por e-mail e notificação in-app com 15 (quinze) dias de antecedência. O novo consentimento será registrado com timestamp. A versão vigente sempre estará disponível no rodapé da Plataforma.',
    ],
  },
  {
    titulo: '10. Contato com o Encarregado (DPO)',
    paragrafos: [
      'Para exercer os direitos previstos nesta Política ou esclarecer dúvidas sobre o tratamento de dados, o Usuário pode entrar em contato com a equipe de desenvolvimento pelo endereço institucional do Centro Universitário Senac – Santo Amaro. A Plataforma compromete-se a responder as solicitações no prazo máximo de 15 (quinze) dias úteis, conforme previsto no art. 18, § 3.º, da LGPD.',
    ],
  },
];
