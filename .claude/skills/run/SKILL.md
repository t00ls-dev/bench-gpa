---
name: run
description: Launch Bench GPA (TanStack Start SSR app) locally, dev server or production build, with a real MariaDB-backed login, to visually confirm a change works. Use whenever asked to run, start, or screenshot the app, or to verify a change beyond lint/typecheck/test.
---

# Rodando o Bench GPA localmente

TanStack Start (SSR) + React 19 + Vite 7 + MariaDB. Rodar de verdade
exige runtime `bun`, um MariaDB com o schema carregado, e um `.env`
preenchido: sem isso o server nem sobe (falha cedo em `src/lib/db.ts`
/ `JWT_SECRET` ausente).

## 1. Runtime (bun)

O projeto roda em `bun`, não em `node`/`npm` puro (scripts como
`scripts/create-test-admin.ts` usam `bun`-isms como `import.meta.dir`).
Se `bun` não estiver instalado:

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"   # ou: source ~/.bashrc
bun --version   # confirmar
```

CI usa `bun-version: "1.3.14"` (`.github/workflows/ci.yml`). Qualquer
1.3.x recente serve para rodar local.

```bash
bun install --frozen-lockfile
```

## 2. Banco de dados

Precisa de um MariaDB acessível com o schema de
`scripts/migrate-schema.sql` carregado. Neste ambiente o MariaDB já
roda como serviço systemd (`systemctl status mariadb`). Se não estiver:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS bench_gpa_dev;"
mysql -u root bench_gpa_dev < scripts/migrate-schema.sql
mysql -u root -e "CREATE USER IF NOT EXISTS 'bench_gpa'@'localhost' IDENTIFIED BY 'devpass123';
  GRANT ALL PRIVILEGES ON bench_gpa_dev.* TO 'bench_gpa'@'localhost';"
```

Se o schema/usuário já existirem de uma sessão anterior, é seguro
reusar. Só resetar a senha se ela for desconhecida:

```bash
mysql -u root -e "ALTER USER 'bench_gpa'@'localhost' IDENTIFIED BY 'devpass123';"
```

## 3. `.env`

Não existe `.env` versionado (está no `.gitignore`, corretamente).
Criar a partir de `.env.example`, com Turnstile em modo bypass para não
depender de uma chave real:

```bash
cat > .env <<'EOF'
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="bench_gpa_dev"
DB_USER="bench_gpa"
DB_PASS="devpass123"

JWT_SECRET="<gerar: openssl rand -base64 48 | tr -d '\n'>"

TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"
TURNSTILE_BYPASS="true"
VITE_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
VITE_TURNSTILE_BYPASS="true"

TEST_ADMIN_EMAIL="test@gpabr.com"
TEST_ADMIN_PASSWORD="devpass123"
TEST_APP_URL="http://localhost:3000"
EOF
```

**Apagar o `.env` ao terminar** (`rm .env`), nunca deixar sobrar em
disco com segredos de teste, mesmo sendo dev-only.

## 4. Criar um usuário de teste

`scripts/create-test-admin.ts` insere um admin usando as credenciais
hardcoded no próprio script (`test@gpabr.com` / `Gpa@Test1970`). Lê
`DB_*` do `.env` carregado no processo `bun`:

```bash
bun run scripts/create-test-admin.ts
# idempotente? não. Se já existir, apaga antes:
# mysql -u bench_gpa -pdevpass123 bench_gpa_dev -e "DELETE FROM users WHERE email='test@gpabr.com';"
```

## 5. Subir o dev server

```bash
bun run dev
```

- Porta default 3000; se ocupada, Vite sobe em 3001+ automaticamente
  (log mostra `Port 3000 is in use, trying another one...`). Sempre
  ler a porta real no log, não assumir 3000.
- **Cold-start gotcha:** a primeira navegação após o boot dispara
  `Re-optimizing dependencies` / `optimized dependencies changed,
  reloading` no Vite, que recarrega o bundle client no meio da
  requisição. Uma primeira tentativa de login pode travar no spinner
  sem erro nenhum. Isso não é bug do app: espere a otimização assentar
  (deixe o server rodando de 5 a 10s após o primeiro `curl`/`goto`, ou
  simplesmente tente de novo) antes de confiar em uma falha de login.

## 6. Dirigir de verdade (login e screenshot)

O projeto já tem um script de referência em Puppeteer,
`scripts/test-production.mjs`, que faz login e navega o dashboard.
`puppeteer` já é dependência do projeto e usa
`executablePath: "/usr/bin/chromium"` (confirmar que existe:
`which chromium`). Para uma checagem rápida sem rodar o script inteiro
(que também testa layout mobile/dropdowns), o essencial é:

```js
import puppeteer from "puppeteer";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
await page.goto("http://localhost:3001/auth", { waitUntil: "domcontentloaded" });
await page.waitForSelector("input[type=email]");
await page.type("input[type=email]", "test@gpabr.com");
await page.type("input[type=password]", "Gpa@Test1970"); // ou TEST_ADMIN_PASSWORD do .env
await page.click('button[type="submit"]');
await page.waitForSelector(".kpi-card", { timeout: 30000 });
await page.screenshot({ path: "/tmp/dashboard.png", fullPage: true });
await browser.close();
```

**Importante:** salve esse script dentro de `scripts/` (ou rode via
`bun run <arquivo>`) para que a resolução de módulos encontre
`node_modules/puppeteer`. Um `.mjs` solto em `/tmp` falha com
`ERR_MODULE_NOT_FOUND`. Apague o arquivo temporário depois (não
commitar scripts de teste ad-hoc).

Sinal de sucesso: `.kpi-card` aparece, `page.url()` muda de `/auth`
para `/`, e o rodapé do dashboard mostra `commit <hash> (há N minutos)`,
confirmando que build info e dados reais do banco (mesmo vazios) estão
sendo lidos.

Para dashboard com dados reais (não "Sem dados"), rodar
`bun run cli:import` sobre um XLSX de exemplo antes do login (ver
`docs/*` sobre o formato esperado, fora do escopo deste skill).

## 7. Alternativa: build de produção local

```bash
bun run build
NODE_ENV=production PORT=3000 node .output/server/index.mjs
# ou, replicando o systemd/pm2 real:
bash scripts/start-prod.sh   # lê .env e roda .output/server/index.mjs
```

Útil para reproduzir bugs específicos de SSR/produção (o dev server
usa HMR e não passa pelo mesmo pipeline de build do Nitro).

## 8. Limpeza

```bash
pkill -f "vite dev"          # ou: kill o PID do bun run dev
rm -f .env                   # nunca deixar segredos de teste em disco
rm -f scripts/__*.mjs        # qualquer script de teste ad-hoc criado
```

`git status` deve voltar limpo: nada deste fluxo deve sobrar staged
ou untracked além de artefatos esperados (`coverage/`, `.output/`, já
no `.gitignore`).
