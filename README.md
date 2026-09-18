# Santo Desapego - Plataforma de Comércio Local

> **Trabalho de Conclusão de Curso** | Bacharelado em Sistemas de Informação - SENAC

## 📌 Sobre o Projeto
O **Santo Desapego** é um Sistema de Intermediação voltado para a economia compartilhada e o comércio local. O projeto visa facilitar a troca, venda e doação de itens entre usuários da mesma comunidade ou região, promovendo o consumo consciente e a circulação de bens parados.

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
Crie um arquivo `.env` na raiz de `santo-desapego-api` com as variáveis:
```
DB_USER=
DB_HOST=
DB_NAME=
DB_PASSWORD=
DB_PORT=5432
JWT_SECRET=
PORT=
FRONTEND_URL=
MP_ACCESS_TOKEN=
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_REDIRECT_URI=
MP_MARKETPLACE_FEE_PERCENT=5
```
Crie o banco de dados usando o script `schema.sql` e inicie o servidor:
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
```bash
cd santo-desapego
npm install
npm run dev
```

---
© 2026 - Bacharelado em Sistemas de Informação - Centro Universitário Senac