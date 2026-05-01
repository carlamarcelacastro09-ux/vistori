# Publicar o sistema (Vercel) e deixar automático

## 1) O que você vai precisar (contas)

- GitHub (para guardar o código)
- Vercel (para publicar o site)
- Neon (Postgres)

## 2) Publicar o site (Vercel)

1. Crie um repositório no GitHub e envie o projeto `vistori-app/` para ele.
2. No Vercel: **Add New → Project → Import Git Repository** e selecione o repositório.
3. No Vercel, em **Environment Variables**, cadastre:
   - `DATABASE_URL` = string do Neon
   - `SESSION_PASSWORD` = uma senha longa (mínimo 32 caracteres)
   - `ROBOT_API_KEY` = uma chave longa (mínimo 32 caracteres)
4. Clique em **Deploy**.

Quando terminar, você terá um link assim: `https://seu-projeto.vercel.app`

## 3) Preparar o banco e criar o usuário admin (uma vez)

No GitHub, abra **Actions** e rode o workflow **DB Setup (Push + Seed)**.

Antes disso, cadastre no GitHub (Settings → Secrets and variables → Actions → New repository secret):
- `DATABASE_URL`
- `SEED_ADMIN_EMAIL` (ex.: `admin@pissarro.local` ou seu e-mail)
- `SEED_ADMIN_PASSWORD` (crie uma senha forte)

## 4) Importação automática da planilha (ATENDIMENTO → banco)

O workflow **Import Sheets Cron** roda sozinho a cada 15 minutos e também pode ser executado manualmente.

Cadastre os secrets no GitHub:
- `DATABASE_URL`
- `SHEETS_CSV_URL`
- `IMPORT_USER_EMAIL` (o e-mail do usuário que “assina” as importações)

`SHEETS_CSV_URL` precisa ser um link CSV da aba ATENDIMENTO, por exemplo:
`https://docs.google.com/spreadsheets/d/SEU_ID/export?format=csv&gid=1111079458`

## 5) Robô automático (banco → prefeitura)

O workflow **Robot Cron** roda sozinho a cada 10 minutos e também pode ser executado manualmente.

Cadastre os secrets no GitHub:
- `APP_BASE_URL` = a URL publicada do Vercel (ex.: `https://seu-projeto.vercel.app`)
- `ROBOT_API_KEY` = a mesma do Vercel
- `PREFEITURA_LOGIN_URL`
- `PREFEITURA_EMISSAO_URL` (opcional)
- `PREFEITURA_USERNAME`
- `PREFEITURA_PASSWORD`
- `PREFEITURA_CNPJ`

## 5.1) Botão “Rodar agora” dentro do sistema (opcional, recomendado)

Para habilitar a tela **Automação** (disparar importação e robô sob demanda), configure no Vercel:

- `GITHUB_OWNER` = dono do repositório (usuário/organização no GitHub)
- `GITHUB_REPO` = nome do repositório
- `GITHUB_TOKEN` = token do GitHub com permissão de `actions:write`
- `GITHUB_REF` = branch (ex.: `main`)

Depois, no sistema (logado como ADMIN), acesse **Automação** e use os botões.

## 6) Criar acesso do seu esposo

1. Entre no sistema com o usuário admin.
2. Abra a tela **Usuários**.
3. Crie um usuário com o e-mail `agpissarro@gmail.com` e uma senha.
4. Ele entra pelo link do Vercel, de qualquer computador/qualquer rede.
