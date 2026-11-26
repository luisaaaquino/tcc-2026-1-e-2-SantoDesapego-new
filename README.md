# Santo Desapego - Plataforma de Comércio Local

> **Trabalho de Conclusão de Curso** | Bacharelado em Sistemas de Informação - SENAC

## 📌 Sobre o Projeto
O **Santo Desapego** é um Sistema de Intermediação voltado para a economia compartilhada e o comércio local. O projeto visa facilitar a compra e venda de itens entre usuários da mesma comunidade ou região, promovendo o consumo consciente e a circulação de bens parados.

## 🎨 Design e Wireframes (Figma)
O protótipo e os fluxos de usuário podem ser visualizados diretamente no Figma através do link abaixo:
👉 [Projeto Santo Desapego no Figma](https://www.figma.com/design/dCPBASNwCdMsIpBvmW22EU/TCC---Grupo-11?node-id=13-1633&p=f&t=rXVQKNNMwDPULb80-0)

## 🎯 Objetivos
- Facilitar a conexão entre compradores e vendedores locais.
- Incentivar a economia circular e sustentável.
- Oferecer uma plataforma segura e intuitiva para intermediação de produtos.

## 💻 Tecnologias Utilizadas
- **Frontend:** React 19 + Vite, React Router, Leaflet (mapas), Google OAuth
- **Backend:** Node.js + Express 5
- **Banco de Dados:** PostgreSQL
- **Autenticação:** JWT, bcrypt, Google Auth Library
- **Pagamentos:** Mercado Pago
- **Versionamento:** Git & GitHub

## 👥 Integrantes do Grupo
- **Luisa Vitoria Aquino Nascimento**
- **Maria Erica Joana da Conceição Cruz**
- **Paulo Henrique Alves Santana**

**Orientador:** Prof. Jose Martinele Alves Silva

## 📁 Estrutura do Repositório
- `/santo-desapego`: Frontend da aplicação (React + Vite).
- `/santo-desapego-api`: Backend/API da aplicação (Node.js + Express + PostgreSQL).
- `/docs`: Diagramas, arquitetura, casos de uso, modelagem de banco, cronogramas e entregas acadêmicas.

## 🚀 Como executar o projeto

### Pré-requisitos
- Node.js
- PostgreSQL

### Backend (`santo-desapego-api`)
```bash
cd santo-desapego-api
npm install
```
Crie um arquivo `.env` na raiz de `santo-desapego-api` com as variáveis abaixo. Nenhuma chave, senha ou ID fica fixo no código (RNF16): tudo vem deste arquivo, que não vai para o Git.
```
# ── Banco de dados (PostgreSQL) ──
DB_USER=
DB_HOST=localhost
DB_NAME=
DB_PASSWORD=
DB_PORT=5432

# ── Servidor ──
PORT=8080                       # padrão: 8080
NODE_ENV=                       # "production" na VPS
JWT_SECRET=                     # texto longo e aleatório (assina o login)
FRONTEND_URL=http://localhost:5173   # endereço do site (links de e-mail e retorno do pagamento)
API_URL=                        # endereço público HTTPS da API (aviso automático do Mercado Pago)
                                # se vazio, usa o domínio do MP_REDIRECT_URI

# ── Login com Google ──
GOOGLE_CLIENT_ID=               # mesmo valor do VITE_GOOGLE_CLIENT_ID do front

# ── Mercado Pago ──
MP_ACCESS_TOKEN=                # token da conta da plataforma
MP_CLIENT_ID=                   # app do Mercado Pago (conexão da conta do vendedor)
MP_CLIENT_SECRET=
MP_REDIRECT_URI=                # ex.: https://api.seudominio.com.br/api/mp/callback
MP_MARKETPLACE_FEE_PERCENT=5    # taxa da plataforma em %

# ── E-mail (código de verificação, recuperação de senha, notificações) ──
EMAIL_HOST=                     # servidor SMTP
EMAIL_PORT=465                  # padrão: 465
EMAIL_USER=                     # sem ele, em desenvolvimento o código aparece no terminal
EMAIL_APP_PASSWORD=

# ── IA (assistente de anúncio e Central de Ajuda) ──
LLM_API_KEY=                    # chave da API do modelo (aceita também OPENAI_API_KEY)
LLM_BASE_URL=                   # padrão: API do Gemini compatível com OpenAI
LLM_MODELO=                     # padrão: gemini-3.5-flash-lite
LLM_MODELO_AVALIADOR=           # padrão: o mesmo do LLM_MODELO
LLM_MODELO_EMBEDDING=           # padrão: gemini-embedding-001
LLM_TIMEOUT_MS=30000            # tempo máximo de cada chamada
LLM_MIN_INTERVALO_S=4           # intervalo mínimo entre chamadas

# ── Limites do agente de anúncio ──
AGENTE_MAX_PASSOS=12
AGENTE_MAX_TOKENS=60000
AGENTE_MAX_CUSTO_USD=0.02
AGENTE_MAX_TEMPO_MS=120000
SANTO_SUSPENSO=                 # 1 desliga as rotas de IA sem mexer no código
```
Crie o banco de dados usando o script `schema.sql` (ou, num banco que já existe, rode os arquivos de `migrations/` em ordem) e inicie o servidor:
```bash
npm run dev
```

### Painel administrativo
Não existe cadastro de administrador pela interface (por segurança). Para promover uma conta já existente:
```sql
UPDATE usuarios SET papel = 'administrador' WHERE email = 'seu-email@exemplo.com';
```
Após o login, um link "Painel administrativo" aparece na sidebar do Perfil, ou acesse `/admin` diretamente.

### Frontend (`santo-desapego`)
Crie um arquivo `.env.local` na raiz de `santo-desapego` (também fica fora do Git). As variáveis do Vite entram no momento do `npm run build`, então na VPS elas precisam existir antes do build:
```
VITE_API_URL=                   # endereço da API; se vazio, usa http://<mesmo host>:8080
VITE_GOOGLE_CLIENT_ID=          # Client ID do Google; se vazio, o botão "Entrar com Google" não aparece
```
```bash
cd santo-desapego
npm install
npm run dev
```

---
© 2026 - Bacharelado em Sistemas de Informação - Centro Universitário Senac