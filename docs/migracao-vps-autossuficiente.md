# Plano de Migração: VPS Autossuficiente

## Resumo

Migrar todo o ecossistema do Bench GPA para um **VPS próprio com Hestia + MariaDB**, eliminando dependências externas (Supabase, Cloudflare) e mantendo apenas o domínio Vercel se necessário.

| Hoje | Amanhã |
|---|---|
| Supabase DB (500 MB limit) | **MariaDB no VPS (~55 GB)** |
| Supabase Auth | **JWT + bcrypt** (próprio) |
| Supabase RPCs | **Stored Procedures MariaDB** |
| Cloudflare Workers | **VPS Node.js (PM2)** ou **Vercel SSR** |
| $25/mês (se for Pro) | **$0 extra** (já paga o VPS) |

---

## 1. Arquitetura

```
                    ┌──────────────────────────────────┐
                    │          VPS (Hestia)             │
                    │                                  │
  Usuário ──HTTPS──▶│  Nginx (443, SSL)                │
                    │    └── proxy reverso              │
                    │         └── :3000                 │
                    │              │                    │
                    │    API Node.js (PM2)              │
                    │    ├── Login / JWT / Auth         │
                    │    ├── Stored Procedures → Dados  │
                    │    └── Endpoints REST             │
                    │              │                    │
                    │    MariaDB :3306                  │
                    │    ├── sales_prod_daily_agg       │
                    │    ├── sales_daily_agg            │
                    │    ├── products / stores          │
                    │    ├── import_log / staging_sales │
                    │    ├── filter_hierarchy           │
                    │    └── users (auth próprio)       │
                    └──────────────────────────────────┘
```

### Se mantiver Vercel (domínio não bloqueado)

```
Usuário ──HTTPS──▶ Vercel (SSR)
                      │
                      └── HTTPS ──▶ api.seu-dominio.com (VPS)
                                        │
                                    Node.js API → MariaDB
```

Vercel só serve de fachada. Todo dado e auth no VPS.

---

## 2. Pré-requisitos

### Já tem (Hestia padrão)
- MariaDB rodando
- Nginx + Let's Encrypt
- Firewall
- Git

### Instalar no VPS
```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install nodejs -y

# PM2
npm install -g pm2

# Verificar
node -v     # v22.x
npm -v      # 10.x
pm2 -v      # 5.x
```

### MariaDB — criar database
```sql
CREATE DATABASE bench_gpa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bench_gpa'@'localhost' IDENTIFIED BY 'senha_segura';
GRANT ALL ON bench_gpa.* TO 'bench_gpa'@'localhost';
FLUSH PRIVILEGES;
```

---

## 3. Auth (JWT + bcrypt)

### Dependências
```json
{
  "dependencies": {
    "bcrypt": "^5.1",
    "jsonwebtoken": "^9.0"
  }
}
```

### Tabelas
```sql
CREATE TABLE users (
  id         VARCHAR(36) PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  name       VARCHAR(255),
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','user') DEFAULT 'user',
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Fluxo
```
Registrar:  email + senha → bcrypt.hash → INSERT → JWT → httpOnly cookie
Login:      email + senha → SELECT hash → bcrypt.compare → JWT → cookie
Validar:    cookie → jwt.verify → SELECT user → contexto
```

### Middleware (substitui `requireSupabaseAuth`)
```ts
import { createMiddleware } from "@tanstack/react-start";
import jwt from "jsonwebtoken";
import db from "./db";

const JWT_SECRET = process.env.JWT_SECRET!;

export const requireAuth = createMiddleware().server(async ({ next, request }) => {
  const cookie = parseCookie(request.headers.get("cookie") || "");
  const token = cookie.session;
  if (!token) throw new Error("Unauthorized");

  const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
  const [rows] = await db.query("SELECT id, role, is_active FROM users WHERE id = ?", [payload.userId]);
  if (!rows.length || !rows[0].is_active) throw new Error("Unauthorized");

  return next({ context: { user: rows[0] } });
});
```

---

## 4. Camada de Dados

### Conexão MariaDB
```ts
// src/lib/db.ts
import { createPool } from "mysql2/promise";

const pool = createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
```

### Server functions: antes e depois

**Antes (Supabase RPC)**:
```ts
const { data } = await context.supabase.rpc("dashboard_metrics", {
  p_date_from: dateFrom, p_date_to: dateTo, p_stores: stores,
});
```

**Depois (MariaDB direto)**:
```ts
const [rows] = await db.query("CALL dashboard_metrics(?, ?, ?)", [dateFrom, dateTo, stores]);
```

---

## 5. Stored Procedures (14 RPCs)

Cada RPC do Supabase vira uma **stored procedure** no MariaDB.

### `dashboard_metrics`
```sql
DELIMITER //
CREATE PROCEDURE dashboard_metrics(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON
)
BEGIN
  SELECT COALESCE(SUM(val_vda), 0) as total
  FROM sales_prod_daily_agg
  WHERE sale_date BETWEEN p_date_from AND p_date_to
    AND (JSON_LENGTH(p_stores) = 0 OR store_code IN (
      SELECT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(50) PATH '$')) AS j
    ))
    AND (JSON_LENGTH(p_deptos) = 0 OR depto IN (
      SELECT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(50) PATH '$')) AS j
    ));
END//
DELIMITER ;
```

### Lista completa de RPCs

| RPC | Tipo | Descrição |
|-----|------|-----------|
| `dashboard_metrics` | SELECT | KPIs do dashboard + delta |
| `dashboard_rankings` | SELECT | Rankings por depto/secao/grupo/produto |
| `filter_options` | SELECT | Opções de filtro em cascata |
| `area_analysis` | SELECT | Análise de área paginada |
| `area_filter_hierarchy` | SELECT | Hierarquia para filtros de área |
| `product_search` | SELECT | Busca textual de produtos |
| `get_product_by_code` | SELECT | Produto por código |
| `product_analysis` | SELECT | Análise completa de um produto |
| `upsert_products_bulk` | INSERT | Upsert em lote de produtos |
| `finalize_import` | INSERT | Finalizar importação + agregar |
| `imported_dates` | SELECT | Datas já importadas |
| `purge_old_aggs` | DELETE | Limpar agregações antigas |
| `db_health_check` | SELECT | Saúde do banco |
| `refresh_filter_hierarchy` | INSERT | Refrescar tabela de hierarquia |

---

## 6. Nginx (Hestia)

No Hestia: **WEB → Editar domínio → Advanced**:
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

MariaDB **nunca exposto** — só `localhost:3306`.

---

## 7. Deploy

### PM2 config
```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: "bench-gpa",
    script: ".output/server/index.mjs",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      DB_HOST: "localhost",
      DB_USER: "bench_gpa",
      DB_PASS: "senha_segura",
      DB_NAME: "bench_gpa",
      JWT_SECRET: "segredo_aqui",
    }
  }]
};
```

### Script de deploy
```bash
#!/bin/bash
# deploy.sh
set -e
git pull origin main
npm ci
npm run build
pm2 reload ecosystem.config.js
```

### GitHub Actions (opcional)
```yaml
name: Deploy
on: push main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_KEY }}
          script: cd /app && ./deploy.sh
```

---

## 8. Build Preset

```ts
// vite.config.ts
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    preset: process.env.VERCEL ? "vercel" : "node-server",
  },
});
```

- **Com Vercel**: `preset: "vercel"`, SSR na Vercel, API no VPS
- **Sem Vercel**: `preset: "node-server"`, SSR + API no VPS (PM2)

---

## 9. Migração de Dados

```bash
# 1. Exportar do Supabase
pg_dump --data-only --inserts \
  -t stores -t products -t import_log -t filter_hierarchy \
  -t staging_sales -t sales_daily_agg -t sales_prod_daily_agg \
  postgresql://... > supabase_dump.sql

# 2. Exportar users (senhas já em bcrypt, portáveis)
psql -c "SELECT id, email, name, password, role, is_active, created_at FROM users;" > users.csv

# 3. Converter tipos PostgreSQL → MySQL
#    - ARRAY[] → JSON
#    - uuid → VARCHAR(36)
#    - timestamptz → timestamp

# 4. Importar
mysql -u bench_gpa -p bench_gpa < mariadb_dump.sql
mysql -u bench_gpa -p bench_gpa -e "LOAD DATA LOCAL INFILE 'users.csv' INTO TABLE users FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"
```

---

## 10. Cron Jobs (locais)

```cron
0 * * * * cd /app && node scripts/import-watch.js
0 6 * * * cd /app && node scripts/code-review.js
```

Ambos já usam a conexão MariaDB — sem Supabase.

---

## 11. Ordem de Implementação

| Fase | Tarefa | Tempo |
|------|--------|-------|
| 1 | Instalar Node.js + PM2 no VPS | 10 min |
| 2 | Criar database + tabelas no MariaDB | 10 min |
| 3 | Implementar auth (JWT + bcrypt + middleware) | 1 dia |
| 4 | Criar `src/lib/db.ts` (mysql2 pool) | 15 min |
| 5 | Migrar 14 RPCs para stored procedures MariaDB | 2 dias |
| 6 | Reescrever server functions (Supabase → MariaDB) | 2 dias |
| 7 | Configurar Nginx proxy reverso | 10 min |
| 8 | Trocar build preset | 5 min |
| 9 | Testar no VPS + deploy | 1 dia |
| 10 | Migrar dados do Supabase | 1 dia |
| **Total** | | **~7 dias** |

---

## 12. Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/lib/db.ts` | **Novo** — Pool mysql2 |
| `src/lib/auth-middleware.ts` | **Novo** — JWT + bcrypt |
| `src/lib/auth-api.ts` | **Novo** — Endpoints /login, /logout, /me |
| `scripts/migrate-schema.sql` | **Novo** — Schema MariaDB + stored procedures |
| `ecosystem.config.js` | **Novo** — PM2 config |
| `scripts/deploy.sh` | **Novo** — Deploy script |
| `vite.config.ts` | **Modificar** — Preset |
| `src/lib/dashboard.functions.ts` | **Modificar** — RPC → MariaDB |
| `src/lib/area.functions.ts` | **Modificar** — RPC → MariaDB |
| `src/lib/product.functions.ts` | **Modificar** — RPC → MariaDB |
| `src/lib/upload.functions.ts` | **Modificar** — RPC → MariaDB |
| `src/lib/admin.functions.ts` | **Modificar** — Auth + RPC → MariaDB |
| `src/lib/admin-utils.ts` | **Modificar** — has_role → MariaDB |
| `src/components/admin-gate.tsx` | **Modificar** — has_role → fetch |
| `src/routes/auth.page.tsx` | **Modificar** — Supabase Auth → fetch |
| `src/routes/__root.tsx` | **Modificar** — onAuthStateChange → cookie |
| `src/routes/_authenticated/route.tsx` | **Modificar** — getUser → cookie |
| `src/router.tsx` | **Modificar** — signOut → fetch |
| `src/start.ts` | **Modificar** — remove attachSupabaseAuth |
| `src/integrations/supabase/` | **Remover** — todo o diretório |

---

## 13. O Que NÃO Muda

- Componentes React (JSX puro, sem Supabase)
- Estilos / Tailwind
- Roteamento (TanStack Router)
- Lazy loading das rotas
- Virtualização da tabela
- Scripts de import (só trocam a conexão de banco)
- Crontab (horários)
- AGENTS.md
- Code review

---

## 14. Comparativo Final

| Aspecto | Hoje | Amanhã |
|---------|------|--------|
| DB | Supabase Postgres (500 MB) | **MariaDB (55 GB livres)** |
| Auth | Supabase Auth | **JWT + bcrypt próprio** |
| Custo DB | $0 (estourando) → $25/mês | **$0 extra** |
| Deploy | Cloudflare Workers | **VPS (PM2) ou Vercel** |
| Armazenamento | limitado a 500 MB | **55 GB** |
| Dependências | Supabase, Cloudflare | **VPS só** |
| Manutenção | Controlada por terceiros | **Total** |
| Velocidade | HTTP para Supabase (rede) | **localhost** |
| Controle de dados | Limitado | **Total** |
