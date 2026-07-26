# Plano de Migração: VPS Autossuficiente

> ✅ **Migração concluída** — deploy ativo em `gpa.t00ls.dev` (Hestia CP 1.9.6). Documento mantido como referência histórica.

> Domínio: `gpa.t00ls.dev` — servidor `sv1.t00ls.dev` (Hestia CP 1.9.6)

---

## Sumário

1. [Resumo Executivo](#1-resumo-executivo)
2. [Arquitetura](#2-arquitetura)
3. [Servidor](#3-servidor)
4. [Template nginx: `node-ssr`](#4-template-nginx-node-ssr)
5. [Criar subdomínio no Hestia](#5-criar-subdomínio-no-hestia)
6. [Schema MariaDB](#6-schema-mariadb)
7. [Conexão — `src/lib/db.ts`](#7-conexão--srclibdbts)
8. [Auth JWT](#8-auth-jwt)
9. [Stored Procedures](#9-stored-procedures)
10. [Server Functions — Antes/Depois](#10-server-functions)
11. [Rotas — Antes/Depois](#11-rotas)
12. [Componentes — Antes/Depois](#12-componentes)
13. [Start / Router — Antes/Depois](#13-start--router)
14. [Integrações Supabase — Remover](#14-integrações-supabase)
15. [Instalar Bun + PM2](#15-instalar-bun--pm2)
16. [Clonar e configurar o app](#16-clonar-e-configurar-o-app)
17. [Migrar dados do Supabase para MariaDB](#17-migrar-dados)
18. [Ordem de Implementação](#18-ordem-de-implementação)
19. [Checklist Completão](#19-checklist-completão)

---

## 1. Resumo Executivo

| Hoje                                      | Amanhã                                         |
| ----------------------------------------- | ---------------------------------------------- |
| Supabase Postgres (500 MB limit)          | **MariaDB 11.4 no VPS (8 GB livres)**          |
| Supabase Auth (14 chamadas auth)          | **JWT + bcrypt próprio**                       |
| Supabase RPCs (15 stored procedures)      | **Stored Procedures MariaDB**                  |
| Vercel (SSR)                              | **VPS (Bun + PM2, proxy nginx)**               |
| Supabase Admin (service role key exposta) | **Nada — queries diretas com permissão admin** |
| Dependência: `@supabase/supabase-js`      | **Dependência removida**                       |
| Custo DB extra se estourar: $25/mês       | **$0 extra**                                   |

### Arquivos a modificar/criar/remover

- **Criar** (6): `src/lib/db.ts`, `src/lib/auth-middleware.ts`, `src/lib/auth-api.ts`, `ecosystem.config.js`, `scripts/deploy.sh`, `scripts/migrate-schema.sql`
- **Modificar** (19): `src/lib/*.functions.ts` (5), `src/lib/admin-utils.ts`, `src/lib/rpc-utils.ts`, `src/routes/*` (6), `src/start.ts`, `src/router.tsx`, `src/components/admin-gate.tsx`, `package.json`, `vite.config.ts`
- **Remover** (5): `src/integrations/supabase/` (diretório inteiro), `@supabase/supabase-js` do `package.json`, SUPABASE\_\* do `.env`

---

## 2. Arquitetura

```
Usuário ──HTTPS──▶ Hestia nginx (:80/:443)
                    └── proxy reverso (:3000)
                         └── Bun SSR (PM2)
                              └── MariaDB 11.4 (:3306, localhost)
```

- Apache não envolvido (template `node-ssr` bypassa Apache)
- MariaDB local (latência zero, sem SSL necessário)
- Auth JWT próprio via cookie HttpOnly
- Turnstile Cloudflare mantido no login

---

## 3. Servidor

| Item       | Valor                    |
| ---------- | ------------------------ |
| OS         | Debian 12 (bookworm)     |
| CPU        | 1 vCPU                   |
| RAM        | 1.9 GB + 4 GB swap       |
| Disco      | 20 GB (~8 GB livres)     |
| IP         | `192.99.246.57`          |
| Panel      | Hestia CP 1.9.6          |
| MariaDB    | 11.4.12 (localhost:3306) |
| Node.js    | v22.23.1                 |
| nginx      | 1.30.2 (Hestia gerencia) |
| **Falta:** | Bun, PM2                 |

---

## 4. Template nginx: `node-ssr`

Criar no servidor via SSH.

### `/usr/local/hestia/data/templates/web/nginx/node-ssr.tpl`

```nginx
server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

    location ~ /\.(?!well-known\/|file) {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /error/ {
        alias %home%/%user%/web/%domain%/document_errors/;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
```

### `/usr/local/hestia/data/templates/web/nginx/node-ssr.stpl`

```nginx
server {
    listen      %ip%:%proxy_ssl_port% ssl;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;

    if ($anti_replay = 307) { return 307 https://$host$request_uri; }
    if ($anti_replay = 425) { return 425; }

    include %home%/%user%/conf/web/%domain%/nginx.hsts.conf*;

    location ~ /\.(?!well-known\/|file) {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /error/ {
        alias %home%/%user%/web/%domain%/document_errors/;
    }

    proxy_hide_header Upgrade;

    include %home%/%user%/conf/web/%domain%/nginx.ssl.conf_*;
}
```

> 🔒 **IP real do usuário atrás do Cloudflare.** Com `X-Real-IP $remote_addr`,
> o app veria o IP da *edge* do Cloudflare, não o do usuário — e o primeiro
> salto do `X-Forwarded-For` é falsificável. O `getClientIp` já prioriza o
> `CF-Connecting-IP`, mas para esse header ser **confiável** a origem precisa
> aceitar tráfego só do Cloudflare. Passo a passo (allowlist de faixas do CF +
> módulo `realip` + mTLS opcional) em
> [`docs/seguranca-ip-e-cloudflare.md`](./seguranca-ip-e-cloudflare.md).

---

## 5. Criar subdomínio no Hestia

### CLI (SSH)

```bash
sudo /usr/local/hestia/bin/v-add-web-domain \
  admin "gpa.t00ls.dev" "192.99.246.57" \
  no \
  "" \
  "node-ssr"

sudo /usr/local/hestia/bin/v-add-letsencrypt-domain admin gpa.t00ls.dev
```

### Hestia Web UI

1. Acessar `https://sv1.t00ls.dev:8083`
2. **WEB** → **Add Web Domain**
3. Domain: `gpa.t00ls.dev`, IP: `192.99.246.57`, Template: **node-ssr**
4. **Save**
5. Após criar, **SSL** → **Let's Encrypt** → **Add**

---

## 6. Schema MariaDB

```sql
CREATE TABLE users (
  id         VARCHAR(36) PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stores (
  store_code VARCHAR(20) PRIMARY KEY,
  store_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(255) NOT NULL,
  sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, sale_date),
  INDEX idx_products_prod_code (prod_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staging_sales (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date    DATE NOT NULL,
  batch_id     VARCHAR(36) NOT NULL,
  store_code   VARCHAR(20) NOT NULL,
  store_name   VARCHAR(255),
  prod_code    VARCHAR(20) NOT NULL,
  prod_name    VARCHAR(255),
  depto        VARCHAR(100),
  secao        VARCHAR(100),
  grupo        VARCHAR(100),
  subgrupo     VARCHAR(100),
  val_vda      DECIMAL(15,2) NOT NULL DEFAULT 0,
  qty_vda      DECIMAL(15,4) NOT NULL DEFAULT 0,
  val_cus      DECIMAL(15,2) DEFAULT 0,
  qty_cus      DECIMAL(15,4) DEFAULT 0,
  val_dev      DECIMAL(15,2) DEFAULT 0,
  qty_dev      DECIMAL(15,4) DEFAULT 0,
  val_vda_liq  DECIMAL(15,2) DEFAULT 0,
  qty_vda_liq  DECIMAL(15,4) DEFAULT 0,
  val_cus_liq  DECIMAL(15,2) DEFAULT 0,
  qty_cus_liq  DECIMAL(15,4) DEFAULT 0,
  val_sld      DECIMAL(15,2) DEFAULT 0,
  qty_sld      DECIMAL(15,4) DEFAULT 0,
  per_mrg      DECIMAL(7,2) DEFAULT 0,
  INDEX idx_staging_batch (batch_id),
  INDEX idx_staging_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  qty_vda     DECIMAL(15,4) NOT NULL DEFAULT 0,
  val_cus     DECIMAL(15,2) DEFAULT 0,
  val_dev     DECIMAL(15,2) DEFAULT 0,
  val_sld     DECIMAL(15,2) DEFAULT 0,
  per_mrg     DECIMAL(7,2) DEFAULT 0,
  PRIMARY KEY (sale_date, store_code),
  INDEX idx_daily_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales_prod_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  prod_code   VARCHAR(20) NOT NULL,
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  qty_vda     DECIMAL(15,4) NOT NULL DEFAULT 0,
  val_cus     DECIMAL(15,2) DEFAULT 0,
  val_dev     DECIMAL(15,2) DEFAULT 0,
  val_sld     DECIMAL(15,2) DEFAULT 0,
  per_mrg     DECIMAL(7,2) DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, prod_code),
  INDEX idx_prod_daily_sale_date (sale_date),
  INDEX idx_prod_daily_prod_code (prod_code),
  INDEX idx_prod_daily_depto (depto),
  INDEX idx_prod_daily_secao (secao),
  INDEX idx_prod_daily_grupo (grupo),
  INDEX idx_prod_daily_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE import_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date   DATE NOT NULL UNIQUE,
  row_count   INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(36),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id    VARCHAR(36) NOT NULL,
  INDEX idx_import_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE filter_hierarchy (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  store_code  VARCHAR(20) NOT NULL,
  store_name  VARCHAR(255) NOT NULL,
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  INDEX idx_filter_store (store_code),
  INDEX idx_filter_depto (depto),
  INDEX idx_filter_secao (secao),
  INDEX idx_filter_grupo (grupo),
  INDEX idx_filter_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 7. Conexão — `src/lib/db.ts`

**Novo arquivo:**

```ts
import { createPool } from "mysql2/promise";

const pool = createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "+00:00",
});

export default pool;
```

> MariaDB é local (localhost) — sem SSL necessário. Se no futuro o DB for externo, adicionar `ssl: { rejectUnauthorized: true }`.

### .env

> **Banco de produção: `admin_gpa`** — gerenciado pelo Hestia (usuário `admin`),
> por isso entra no dump diário para o Backblaze. Um banco `bench_gpa` criado
> manualmente existiu no início, mas ficava **fora** dos backups do Hestia; os
> dados foram migrados para `admin_gpa` e o `bench_gpa` removido. Use sempre
> `admin_gpa` no `.env` e no `ecosystem.config.cjs`.

```env
# Banco
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="admin_gpa"
DB_USER="admin_gpa"
DB_PASS="<senha>"

# JWT
JWT_SECRET="<base64:64-chars>"
JWT_EXPIRY="604800"

# Turnstile (Cloudflare)
TURNSTILE_SECRET_KEY="<secret>"
VITE_TURNSTILE_SITE_KEY="<site_key>"
```

---

## 8. Auth JWT

### 8.1 Dependências

```json
{
  "dependencies": {
    "bcrypt": "^5.1",
    "jsonwebtoken": "^9.0",
    "cookie": "^0.6"
  }
}
```

### 8.2 Middleware — `src/lib/auth-middleware.ts`

Substitui `src/integrations/supabase/auth-middleware.ts`:

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import jwt from "jsonwebtoken";
import db from "./db";
import { parseCookie } from "cookie";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthContext {
  db: typeof db;
  userId: string;
  userRole: string;
  userEmail: string;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");

  const request = getRequest();
  const cookie = request?.headers?.get("cookie") || "";
  const parsed = parseCookie(cookie);
  const token = parsed["session"];
  if (!token) throw new Error("Unauthorized: no session cookie");

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
    };

    const [rows] = await db.query<any[]>("SELECT id, role, is_active FROM users WHERE id = ?", [
      payload.userId,
    ]);
    if (!rows.length || !rows[0].is_active) {
      throw new Error("Unauthorized: user inactive or not found");
    }

    return next({
      context: {
        db,
        userId: payload.userId,
        userRole: payload.role,
        userEmail: payload.email,
      } satisfies AuthContext,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unauthorized")) {
      throw err;
    }
    throw new Error("Unauthorized: invalid token");
  }
});
```

### 8.3 Rotas de Auth — `src/lib/auth-api.ts`

**Novo arquivo:**

```ts
import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";
import db from "./db";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET!;

function sessionCookie(token: string): string {
  return serialize("session", token, {
    httpOnly: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function clearSession(): string {
  return serialize("session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z
          .string()
          .email()
          .transform((e) => e.toLowerCase().trim()),
        password: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const [rows] = await db.query<any[]>(
      "SELECT id, email, name, password, role, is_active FROM users WHERE email = ?",
      [data.email],
    );
    if (!rows.length) {
      return { ok: false, error: "E-mail ou senha inválidos." };
    }
    const user = rows[0];
    if (!user.is_active) {
      return { ok: false, error: "Usuário inativo. Procure o administrador." };
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      return { ok: false, error: "E-mail ou senha inválidos." };
    }
    const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    return {
      ok: true,
      token,
      cookie: sessionCookie(token),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const request = (await import("@tanstack/react-start/server")).getRequest();
  const cookie = request?.headers?.get("cookie") || "";
  const parsed = parse(cookie);
  const token = parsed["session"];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
    };
    const [rows] = await db.query<any[]>(
      "SELECT id, email, name, role, is_active FROM users WHERE id = ?",
      [payload.userId],
    );
    if (!rows.length || !rows[0].is_active) return null;
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
  } catch {
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true, cookie: clearSession() };
});
```

> **Nota**: Em TanStack Start, server functions não podem setar cookies diretamente como headers de resposta. O login deve retornar o cookie como string e o front-end aplicá-lo via `document.cookie`. Alternativa futura: criar rota API dedicada com Hono/Express.

---

## 9. Stored Procedures

### 9.1 Lista completa

| #   | Nome                       | Parâmetros                                                                                                          | Tipo         |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `dashboard_metrics`        | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[]                                             | SELECT       |
| 2   | `dashboard_rankings`       | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[], limit                                      | SELECT       |
| 3   | `filter_options`           | date_from, date_to, stores[], deptos[], secoes[], grupos[]                                                          | SELECT       |
| 4   | `area_analysis`            | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[], page, page_size, search, sort_by, sort_dir | SELECT       |
| 5   | `area_filter_hierarchy`    | (nenhum)                                                                                                            | SELECT       |
| 6   | `product_search`           | q                                                                                                                   | SELECT       |
| 7   | `get_product_by_code`      | code                                                                                                                | SELECT       |
| 8   | `product_analysis`         | prod_code, store_code, ref_date                                                                                     | SELECT       |
| 9   | `upsert_products_bulk`     | rows[], sale_date                                                                                                   | INSERT       |
| 10  | `finalize_import`          | batch_id, sale_date, row_count, imported_by                                                                         | INSERT/MULTI |
| 11  | `imported_dates`           | (nenhum)                                                                                                            | SELECT       |
| 12  | `purge_old_aggs`           | days                                                                                                                | DELETE       |
| 13  | `db_health_check`          | (nenhum)                                                                                                            | SELECT       |
| 14  | `refresh_filter_hierarchy` | (nenhum)                                                                                                            | INSERT       |
| 15  | `has_role`                 | user_id, role                                                                                                       | SELECT       |

> **Todas as stored procedures devem ser criadas com SQL compatível com MariaDB 11.4.** Diferenças principais do PostgreSQL: `JSON_TABLE` vs `jsonb_to_recordset`, `ARRAY[]` vs `JSON`, `REF CURSOR` vs `SELECT`, tipos de timestamp.

### 9.2 Exemplo: `dashboard_metrics`

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
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY;

  INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value
    FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j
    WHERE JSON_LENGTH(p_stores) > 0;

  INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value
    FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j
    WHERE JSON_LENGTH(p_deptos) > 0;

  INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value
    FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j
    WHERE JSON_LENGTH(p_secoes) > 0;

  INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value
    FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j
    WHERE JSON_LENGTH(p_grupos) > 0;

  INSERT INTO tmp_filters (subgrupo)
    SELECT DISTINCT value
    FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j
    WHERE JSON_LENGTH(p_subgrupos) > 0;

  SELECT
    COALESCE(SUM(val_vda), 0) AS total,
    COUNT(DISTINCT prod_code) AS total_plus,
    COUNT(DISTINCT CASE WHEN val_vda > 0 THEN prod_code END) AS plus_with_sale,
    COUNT(DISTINCT CASE WHEN val_vda = 0 THEN prod_code END) AS plus_without_sale
  FROM sales_prod_daily_agg a
  WHERE a.sale_date BETWEEN p_date_from AND p_date_to
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL)
      OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL)
      OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL)
      OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL)
      OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL)
      OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//
DELIMITER ;
```

---

## 10. Server Functions — Antes/Depois

### 10.1 `dashboard.functions.ts`

| Função                 | Antes (Supabase RPC)                                       | Depois (db.query)                                                                                      |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getFilterOptions`     | `supabase.rpc("filter_options", {...})`                    | `db.query("CALL filter_options(?, ?, ?, ?, ?, ?)", [dateFrom, dateTo, JSON.stringify(stores), ...])`   |
| `getStores`            | `supabase.from("stores").select(...)`                      | `db.query("SELECT store_code, store_name FROM stores ORDER BY store_code")`                            |
| `getDashboard`         | `callMetrics(supabase, data)` → RPC `dashboard_metrics`    | `db.query("CALL dashboard_metrics(?, ?, ?, ?, ?, ?, ?)", [...])`                                       |
| `getLatestSaleInfo`    | `supabase.from("import_log").select(...).order().limit(1)` | `db.query("SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC LIMIT 1")` |
| `getDashboardRankings` | `supabase.rpc("dashboard_rankings", {...})`                | `db.query("CALL dashboard_rankings(?, ?, ?, ?, ?, ?, ?, ?)", [...])`                                   |

### 10.2 `area.functions.ts`

| Função                   | Antes                                   | Depois                                                                                          |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getAreaAnalysis`        | `supabase.rpc("area_analysis", {...})`  | `db.query("CALL area_analysis(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [...])`                     |
| `getAreaFilterHierarchy` | `supabase.rpc("area_filter_hierarchy")` | `db.query("SELECT * FROM filter_hierarchy ORDER BY store_code, depto, secao, grupo, subgrupo")` |

### 10.3 `product.functions.ts`

| Função               | Antes                                             | Depois                                                                                                                                     |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `searchProducts`     | `supabase.rpc("product_search", { p_q })`         | `db.query("SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_name LIKE ? OR prod_code LIKE ? LIMIT 20", [`%${q}%`, `%${q}%`])` |
| `getProductByCode`   | `supabase.rpc("get_product_by_code", { p_code })` | `db.query("SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_code = ? LIMIT 1", [code])`                                       |
| `getProductAnalysis` | `supabase.rpc("product_analysis", {...})`         | `db.query("CALL product_analysis(?, ?, ?)", [prodCode, storeCode, refDate])`                                                               |

### 10.4 `upload.functions.ts`

| Função             | Antes                                                             | Depois                                                                                         |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `beginImport`      | 3 chamadas: delete staging + upsert stores + upsert products bulk | 1 transação: `DELETE staging_sales`, INSERT/UPDATE stores, INSERT/UPDATE products              |
| `insertSalesChunk` | `supabase.from("staging_sales").insert(rows)`                     | `INSERT INTO staging_sales ... VALUES` com placeholders                                        |
| `getImportedDates` | `supabase.rpc("imported_dates")`                                  | `db.query("SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC")` |
| `finalizeImport`   | `supabase.rpc("finalize_import", {...})`                          | `db.query("CALL finalize_import(?, ?, ?, ?)", [batchId, saleDate, rowCount, userId])`          |

### 10.5 `admin.functions.ts`

| Função               | Antes                                                                    | Depois                                                                                                |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `listUsers`          | `supabaseAdmin.from("users").select(...)`                                | `db.query("SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC")` |
| `createUser`         | `supabaseAdmin.auth.admin.createUser(...)` + `from("users").insert(...)` | `bcrypt.hash(password, 12)` + `db.query("INSERT INTO users ...")`                                     |
| `setUserRole`        | `supabaseAdmin.from("users").update({ role }).eq("id", id)`              | `db.query("UPDATE users SET role = ? WHERE id = ?", [role, id])`                                      |
| `setUserActive`      | `supabaseAdmin.from("users").update({ is_active }).eq("id", id)`         | `db.query("UPDATE users SET is_active = ? WHERE id = ?", [isActive, id])`                             |
| `resetPassword`      | `supabaseAdmin.auth.admin.updateUserById(id, { password })`              | `bcrypt.hash(password, 12)` + `db.query("UPDATE users SET password = ? WHERE id = ?", [hash, id])`    |
| `countRows`          | `sa.from(table).select("*", { count: "exact", head: false })`            | `db.query("SELECT COUNT(*) as count FROM ??", [table])`                                               |
| `fetchDistinctDates` | `sa.from(table).select(column)`                                          | `db.query("SELECT DISTINCT ?? FROM ?? ORDER BY ??", [column, table, column])`                         |
| `purgeOldAggs`       | `supabaseAdmin.rpc("purge_old_aggs", { p_days: 28 })`                    | `db.query("CALL purge_old_aggs(?)", [28])`                                                            |
| `dbHealthCheck`      | `supabaseAdmin.rpc("db_health_check")`                                   | `db.query("SELECT VERSION() as version, NOW() as time")` + queries de tamanho                         |
| `diagnoseData`       | Chama `countRows` e `fetchDistinctDates`                                 | Mesmas funções adaptadas                                                                              |

### 10.6 `admin-utils.ts`

**`assertAdmin`**:

```ts
// Antes
const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });

// Depois
const [rows] = await ctx.db.query("SELECT role FROM users WHERE id = ?", [ctx.userId]);
if (!rows.length || rows[0].role !== "admin") {
  throw new Error("Apenas administradores podem realizar esta ação.");
}
```

---

## 11. Rotas — Antes/Depois

| Rota                           | Antes                                                                         | Depois                                            |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `__root.tsx:129`               | `supabase.auth.onAuthStateChange(...)`                                        | Remover listener                                  |
| `auth.tsx:17`                  | `supabase.auth.getUser()`                                                     | `getMe()`                                         |
| `auth.page.tsx:47`             | `supabase.auth.signInWithPassword(...)` + `from("users").select("is_active")` | `login()` do auth-api                             |
| `_authenticated/route.tsx:34`  | `supabase.auth.getUser()`                                                     | `getMe()`                                         |
| `_authenticated/route.tsx:88`  | `from("users").select("is_active, role")`                                     | `user.role` já no contexto                        |
| `_authenticated/route.tsx:103` | `supabase.auth.signOut()`                                                     | `document.cookie = "session=; Path=/; Max-Age=0"` |
| `_authenticated/admin.tsx:9`   | `supabase.rpc("has_role", ...)`                                               | `context.user.role === "admin"`                   |
| `_authenticated/upload.tsx:8`  | `supabase.rpc("has_role", ...)`                                               | `context.user.role === "admin"`                   |
| `router.tsx:25`                | `supabase.auth.signOut()`                                                     | `document.cookie = "session=; Path=/; Max-Age=0"` |

---

## 12. Componentes — Antes/Depois

| Componente          | Antes                                         | Depois                              |
| ------------------- | --------------------------------------------- | ----------------------------------- |
| `admin-gate.tsx:19` | `supabase.auth.getUser()` + `rpc("has_role")` | `getMe()` + `user.role === "admin"` |

---

## 13. Start / Router — Antes/Depois

### `src/start.ts`

```ts
// Antes
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth], // REMOVER
  requestMiddleware: [errorMiddleware],
}));

// Depois
export const startInstance = createStart(() => ({
  functionMiddleware: [], // vazio
  requestMiddleware: [errorMiddleware],
}));
```

### `src/router.tsx`

```ts
// queryCache onError — Antes
const { supabase } = await import("@/integrations/supabase/client");
await supabase.auth.signOut();

// Depois
document.cookie = "session=; Path=/; Max-Age=0";
```

---

## 14. Integrações Supabase — Remover

Após a migração:

```
src/integrations/supabase/
├── client.ts              → REMOVER
├── client.server.ts       → REMOVER
├── auth-middleware.ts     → REMOVER
├── auth-attacher.ts       → REMOVER
└── types.ts               → REMOVER
```

Do `package.json`:

```json
"@supabase/supabase-js": "^X.X.X"  // REMOVER
```

Do `.env`:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
VITE_SUPABASE_PUBLISHABLE_KEY → REMOVER todos
```

---

## 15. Instalar Bun + PM2

```bash
# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PM2
npm install -g pm2
```

---

## 16. Clonar e configurar o app

```bash
cd /home/admin/web/gpa.t00ls.dev

git clone https://github.com/pedrorodbit/bench-gpa.git public_html
cd public_html

bun install

# .env — ver seção 7.1 para valores
cat > .env << 'ENVEOF'
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="admin_gpa"
DB_USER="admin_gpa"
DB_PASS="<senha_segura>"
JWT_SECRET="<base64_random_64_chars>"
JWT_EXPIRY="604800"
TURNSTILE_SECRET_KEY="<secret>"
VITE_TURNSTILE_SITE_KEY="<site_key>"
ENVEOF

# Fazer checkout do branch/tag da migração
# git checkout feat/selfhost

bun run build

pm2 start "bun run start" --name bench-gpa
pm2 save
pm2 startup
```

### ecosystem.config.js

```js
module.exports = {
  apps: [
    {
      name: "bench-gpa",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        DB_HOST: "localhost",
        DB_USER: "admin_gpa",
        DB_PASS: "senha_segura",
        DB_NAME: "admin_gpa",
        JWT_SECRET: "segredo_aqui",
      },
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
```

### scripts/deploy.sh

```bash
#!/bin/bash
set -e
git pull origin main
bun install
bun run build
pm2 reload ecosystem.config.js
echo "✅ Deploy complete!"
```

---

## 17. Migração de Dados

### 17.1 Exportar do Supabase

```bash
pg_dump \
  --dbname="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  --data-only --column-inserts \
  -t stores -t products -t import_log -t staging_sales \
  -t sales_daily_agg -t sales_prod_daily_agg \
  -t filter_hierarchy -t users \
  > supabase_dump.sql
```

### 17.2 Converter PostgreSQL → MariaDB

```bash
#!/bin/bash
# scripts/convert-supabase-dump.sh
sed \
  -e 's/true/FALSE/g' -e 's/false/FALSE/g' \
  -e 's/::integer//g' -e 's/::text//g' \
  -e 's/::timestamp with time zone//g' -e 's/::date//g' \
  -e 's/uuid_d/VARCHAR(36)/g' \
  -e "s/'t'::boolean/TRUE/g" -e "s/'f'::boolean/FALSE/g" \
  -e 's/ON CONFLICT (.*) DO NOTHING/-- IGNORE/g' \
  -e 's/ON CONFLICT (.*) DO UPDATE SET/ON DUPLICATE KEY UPDATE/g' \
  supabase_dump.sql > mariadb_ready.sql
```

### 17.3 Importar

```bash
mysql -u admin_gpa -p admin_gpa < scripts/migrate-schema.sql
mysql -u admin_gpa -p admin_gpa < mariadb_ready.sql
```

### 17.4 Criar admin inicial

Criar senha bcrypt localmente e inserir:

```bash
HASH=$(node -e "const b=require('bcrypt');b.hash('senha123',12).then(console.log)")
mysql -u admin_gpa -p admin_gpa -e "
INSERT INTO users (id, email, name, password, role, is_active)
VALUES ('$(uuidgen)', 'admin@gpabr.com', 'Administrador', '$HASH', 'admin', TRUE);
"
```

---

## 18. Ordem de Implementação

### Fase 0: Infraestrutura (servidor)

- [ ] Template `node-ssr.tpl` + `node-ssr.stpl` criados
- [ ] Subdomínio `gpa.t00ls.dev` com template node-ssr
- [ ] SSL Let's Encrypt ativo
- [ ] Bun instalado
- [ ] PM2 instalado
- [ ] MariaDB: banco `admin_gpa` (gerenciado pelo Hestia) criado
- [ ] Schema SQL executado

### Fase 1: Build Config (1 commit)

| Arquivo               | Mudança                                          |
| --------------------- | ------------------------------------------------ |
| `vite.config.ts`      | Add `preset: "node-server"`                      |
| `ecosystem.config.js` | **Novo**                                         |
| `scripts/deploy.sh`   | **Novo**                                         |
| `package.json`        | Add `mysql2`, `bcrypt`, `jsonwebtoken`, `cookie` |

### Fase 2: Conexão + Stored Procedures (1 commit)

| Arquivo                      | Mudança                           |
| ---------------------------- | --------------------------------- |
| `src/lib/db.ts`              | **Novo** (mysql2 pool)            |
| `scripts/migrate-schema.sql` | **Novo** (schema + 15 procedures) |

### Fase 3: Server Functions — Leitura (1 commit)

Arquivos: `dashboard.functions.ts`, `area.functions.ts`, `product.functions.ts`, `rpc-utils.ts`

### Fase 4: Server Functions — Escrita (1 commit)

Arquivos: `upload.functions.ts`, `admin.functions.ts`, `admin-utils.ts`

### Fase 5: Auth JWT (1 commit)

Arquivos: `auth-middleware.ts` (novo), `auth-api.ts` (novo), `routes/auth.tsx`, `auth.page.tsx`, `__root.tsx`, `_authenticated/route.tsx`, `_authenticated/admin.tsx`, `_authenticated/upload.tsx`, `admin-gate.tsx`, `router.tsx`

### Fase 6: Cleanup (1 commit)

- Remover `src/integrations/supabase/`
- Remover `@supabase/supabase-js` do `package.json`
- Remover SUPABASE\_\* do `.env`
- Build + testar

### Fase 7: Deploy

- Clonar repo no VPS
- Rodar migration de dados
- Iniciar PM2
- Verificar health check, login, dashboard

---

## 19. Checklist Completão

### Fase 0 — Infraestrutura

- [ ] Template `node-ssr.tpl` + `node-ssr.stpl` no servidor
- [ ] Subdomínio `gpa.t00ls.dev` criado com template
- [ ] SSL Let's Encrypt ativo
- [ ] Bun instalado
- [ ] PM2 instalado
- [ ] MariaDB: banco + schema rodado
- [ ] Dados migrados do Supabase

### Fase 1 — Build Config

- [ ] `vite.config.ts` com preset `node-server`
- [ ] `ecosystem.config.js` criado
- [ ] `scripts/deploy.sh` criado
- [ ] `bun run build` funciona
- [ ] `pm2 start` + site acessível via nginx

### Fase 2 — Conexão + Schema

- [ ] `src/lib/db.ts` criado
- [ ] `scripts/migrate-schema.sql` com schema + 15 procedures
- [ ] Schema executado no MariaDB

### Fase 3 — Server Functions Leitura

- [ ] Dashboard, Área, Produto funcionando com dados do MariaDB

### Fase 4 — Server Functions Escrita

- [ ] Upload, Admin CRUD funcionando

### Fase 5 — Auth JWT

- [ ] Login funcionando (JWT → cookie HttpOnly)
- [ ] Logout funcionando
- [ ] Rotas autenticadas protegidas
- [ ] Admin routes verificando role

### Fase 6 — Cleanup

- [ ] `src/integrations/supabase/` removido
- [ ] `@supabase/supabase-js` removido
- [ ] SUPABASE\_\* removido do `.env`
- [ ] `bun run build` sem erros

### Fase 7 — Deploy Final

- [ ] Repositório clonado em `/home/admin/web/gpa.t00ls.dev/public_html`
- [ ] `.env` configurado
- [ ] Build passou no VPS
- [ ] App rodando com PM2 (porta 3000)
- [ ] nginx Hestia faz proxy para `127.0.0.1:3000`
- [ ] `https://gpa.t00ls.dev` responde
- [ ] Login com Turnstile funcional
- [ ] Dashboard com dados
- [ ] CSP nonce funcionando (verificar console)
- [ ] Cron jobs configurados (purge 03h — desde 2026-07-26 é a única cron; o
      import deixou de ser agendado e acontece pela tela `/upload` ou sob demanda)
