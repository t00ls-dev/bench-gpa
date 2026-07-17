# Plano de Migração: VPS Autossuficiente

> ⚠️ **Instrução**: Para executar esta migração, crie uma branch `feat/selfhost` a partir da `main` e faça cada fase em um ou mais commits. Nunca commitar na `main` diretamente. Cada fase tem seu próprio checklist.

---

## Sumário

1. [Resumo Executivo](#1-resumo-executivo)
2. [Arquitetura](#2-arquitetura)
3. [Schema MariaDB](#3-schema-mariadb)
4. [Conexão — `src/lib/db.ts`](#4-conexão--srclibdbts)
5. [Auth JWT](#5-auth-jwt)
6. [Stored Procedures](#6-stored-procedures)
7. [Server Functions — Antes/Depois](#7-server-functions)
8. [Rotas — Antes/Depois](#8-rotas)
9. [Componentes — Antes/Depois](#9-componentes)
10. [Start / Router — Antes/Depois](#10-start--router)
11. [Integrações Supabase — Remover](#11-integrações-supabase)
12. [Nginx + PM2 + Deploy](#12-nginx--pm2--deploy)
13. [Script de Migração de Dados](#13-migração-de-dados)
14. [Ordem de Implementação](#14-ordem-de-implementação)
15. [Checklist Completão](#15-checklist-completão)

---

## 1. Resumo Executivo

| Hoje | Amanhã |
|---|---|
| Supabase Postgres (500 MB limit) | **MariaDB no VPS (55 GB livres)** |
| Supabase Auth (14 chamadas auth) | **JWT + bcrypt próprio** |
| Supabase RPCs (15 stored procedures) | **Stored Procedures MariaDB** |
| Vercel + Cloudflare Workers | **VPS (Node.js + PM2)** ou Vercel + VPS |
| Supabase Admin (service role key) | **Nada — queries diretas com permissão admin** |
| Dependência: `@supabase/supabase-js` | **Dependência removida** |
| Custo DB extra se estourar: $25/mês | **$0 extra** |

### Arquivos a modificar/criar/remover

- **Criar** (6): `src/lib/db.ts`, `src/lib/auth-middleware.ts`, `src/lib/auth-api.ts`, `ecosystem.config.js`, `scripts/deploy.sh`, `scripts/migrate-schema.sql`
- **Modificar** (19): `vite.config.ts`, `src/lib/*.functions.ts` (5), `src/lib/admin-utils.ts`, `src/lib/rpc-utils.ts`, `src/routes/*` (6), `src/start.ts`, `src/router.tsx`, `src/components/admin-gate.tsx`, `package.json`
- **Remover** (5): `src/integrations/supabase/` (diretório inteiro), `@supabase/supabase-js` do `package.json`

---

## 2. Arquitetura

### Opção A: Tudo no VPS (recomendado)

```
Usuário ──HTTPS──▶ Nginx (443, SSL)
                    └── proxy reverso :3000
                         └── Node.js App (PM2)
                              ├── SSR (TanStack Start)
                              ├── Auth API (JWT + bcrypt)
                              ├── Server Functions (db.query direto)
                              └── MariaDB :3306 (localhost)
```

### Opção B: Vercel SSR + VPS API

```
Usuário ──HTTPS──▶ Vercel (SSR TanStack)
                    └── HTTPS ──▶ api.seu-dominio.com (VPS)
                                     └── Node.js API → MariaDB
```

Em ambos os casos: **MariaDB nunca exposto externamente**.

---

## 3. Schema MariaDB

### 3.1 Tabelas

```sql
-- ============================================
-- Tabela: users (auth próprio)
-- ============================================
CREATE TABLE users (
  id         VARCHAR(36) PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  password   VARCHAR(255) NOT NULL,         -- bcrypt hash
  role       ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Tabela: stores
-- ============================================
CREATE TABLE stores (
  store_code VARCHAR(20) PRIMARY KEY,
  store_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Tabela: products
-- ============================================
CREATE TABLE products (
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(255) NOT NULL,
  sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, sale_date),
  INDEX idx_products_prod_code (prod_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Tabela: staging_sales (import temporário)
-- ============================================
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

-- ============================================
-- Tabela: sales_daily_agg (agregado por loja+dia)
-- ============================================
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

-- ============================================
-- Tabela: sales_prod_daily_agg (agregado por produto+loja+dia)
-- ============================================
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

-- ============================================
-- Tabela: import_log
-- ============================================
CREATE TABLE import_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date   DATE NOT NULL UNIQUE,
  row_count   INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(36),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id    VARCHAR(36) NOT NULL,
  INDEX idx_import_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Tabela: filter_hierarchy (cache de hierarquia)
-- ============================================
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

## 4. Conexão — `src/lib/db.ts`

**Novo arquivo:**

```ts
import { createPool } from "mysql2/promise";

const pool = createPool({
  host: process.env.DB_HOST || "localhost",
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

---

## 5. Auth JWT

### 5.1 Dependências

```json
// package.json
{
  "dependencies": {
    "bcrypt": "^5.1",
    "jsonwebtoken": "^9.0"
  }
}
```

Também precisamos de um parser de cookie. Como o projeto `@tanstack/react-start` já inclui acesso ao `Request`, podemos usar um parser simples inline (sem dependência extra) ou instalar `cookie`:

```json
{
  "dependencies": {
    "cookie": "^0.6"
  }
}
```

### 5.2 Middleware — `src/lib/auth-middleware.ts`

**Novo arquivo — substitui `src/integrations/supabase/auth-middleware.ts`:**

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import jwt from "jsonwebtoken";
import db from "./db";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthContext {
  supabase?: never;
  db: typeof db;
  userId: string;
  userRole: string;
  userEmail: string;
}

export const requireAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");

    const request = getRequest();
    const cookie = request?.headers?.get("cookie") || "";
    const token = parseCookieValue(cookie, "session");
    if (!token) throw new Error("Unauthorized: no session cookie");

    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        role: string;
        email: string;
      };

      const [rows] = await db.query<any[]>(
        "SELECT id, role, is_active FROM users WHERE id = ?",
        [payload.userId],
      );
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
  },
);

function parseCookieValue(cookie: string, name: string): string | null {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

> **Importante**: Para funções de admin, verificar `context.userRole === "admin"` dentro do handler em vez de chamar RPC `has_role`.

### 5.3 Rotas de Auth API — `src/lib/auth-api.ts`

**Novo arquivo — endpoints de login/logout/me:**

```ts
import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "./db";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function setCookieHeader(name: string, value: string, maxAgeMs: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

// POST /api/login
export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email().transform((e) => e.toLowerCase().trim()),
      password: z.string().min(1),
    }).parse(d),
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
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    return {
      ok: true,
      token,
      cookie: setCookieHeader("session", token, SESSION_AGE_MS),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

// GET /api/me
export const getMe = createServerFn({ method: "GET" })
  .handler(async ({ request }) => {
    const cookie = request?.headers?.get("cookie") || "";
    const token = parseCookieValue(cookie, "session");
    if (!token) return null;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string; email: string };
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

// POST /api/logout
export const logout = createServerFn({ method: "POST" })
  .handler(async () => {
    return { ok: true, cookie: clearCookieHeader("session") };
  });

function parseCookieValue(cookie: string, name: string): string | null {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

> **Nota**: Em TanStack Start, server functions não podem retornar cookies diretamente como headers de resposta. Será necessário adaptar a rota de login para usar o TanStack Router ou criar uma rota API separada. A forma mais simples é fazer o login via server function que retorna o token, e o front-end salva em cookie via `document.cookie` (HttpOnly não pode, então usamos cookie sem HttpOnly mas com SameSite e Secure, ou fazemos a troca via endpoint dedicado). Alternativa: usar uma rota API separada com o preset `node-server` que expõe `/api/login`, `/api/logout`, `/api/me` como endpoints HTTP normais via express/hono.

---

## 6. Stored Procedures

### 6.1 dashboard_metrics

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
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//
DELIMITER ;
```

> **Nota**: O SQL acima é uma aproximação para MariaDB. O RPC original do Supabase usa `refcursor` e retorna múltiplos registros (latestDate, stores, deptos, etc). A implementação final deve adaptar o retorno para algo que o `db.query()` consiga ler. Sugestão: criar procedures separadas ou retornar JSON.

### 6.2 Lista completa de RPCs com parâmetros

| # | Nome | Parâmetros | Tipo |
|---|------|-----------|------|
| 1 | `dashboard_metrics` | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[] | SELECT |
| 2 | `dashboard_rankings` | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[], limit | SELECT |
| 3 | `filter_options` | date_from, date_to, stores[], deptos[], secoes[], grupos[] | SELECT |
| 4 | `area_analysis` | date_from, date_to, stores[], deptos[], secoes[], grupos[], subgrupos[], page, page_size, search, sort_by, sort_dir | SELECT |
| 5 | `area_filter_hierarchy` | (nenhum) | SELECT |
| 6 | `product_search` | q | SELECT |
| 7 | `get_product_by_code` | code | SELECT |
| 8 | `product_analysis` | prod_code, store_code, ref_date | SELECT |
| 9 | `upsert_products_bulk` | rows[], sale_date | INSERT |
| 10 | `finalize_import` | batch_id, sale_date, row_count, imported_by | INSERT/MULTI |
| 11 | `imported_dates` | (nenhum) | SELECT |
| 12 | `purge_old_aggs` | days | DELETE |
| 13 | `db_health_check` | (nenhum) | SELECT |
| 14 | `refresh_filter_hierarchy` | (nenhum) | INSERT |
| 15 | `has_role` | user_id, role | SELECT |

> **Todas as stored procedures devem ser criadas com SQL compatível com MariaDB 10.11+.** As principais diferenças do PostgreSQL a considerar: `JSON_TABLE` vs `jsonb_to_recordset`, `ARRAY[]` vs `JSON`, `REF CURSOR` vs `SELECT`, tipos de timestamp.

---

## 7. Server Functions — Antes/Depois

### 7.1 `dashboard.functions.ts` (5 funções)

#### `getFilterOptions` — linha 29
**Antes**:
```ts
const { data: res, error } = await supabase.rpc("filter_options", {
  p_date_from: data.dateFrom || (null as unknown as string),
  p_date_to: data.dateTo || (null as unknown as string),
  p_stores: data.stores ?? [],
  p_deptos: data.deptos ?? [],
  p_secoes: data.secoes ?? [],
  p_grupos: data.grupos ?? [],
});
```
**Depois**:
```ts
const [rows] = await db.query("CALL filter_options(?, ?, ?, ?, ?, ?)", [
  data.dateFrom || null,
  data.dateTo || null,
  JSON.stringify(data.stores ?? []),
  JSON.stringify(data.deptos ?? []),
  JSON.stringify(data.secoes ?? []),
  JSON.stringify(data.grupos ?? []),
]);
// Ler resultado da procedure
const res = rows[0]; // MariaDB retorna múltiplos resultsets
```

#### `getStores` — linha 57
**Antes**:
```ts
const { data, error } = await supabase
  .from("stores")
  .select("store_code, store_name")
  .order("store_code", { ascending: true });
```
**Depois**:
```ts
const [rows] = await db.query("SELECT store_code, store_name FROM stores ORDER BY store_code ASC");
return rows;
```

#### `getDashboard` — linha 70
**Antes**: `callMetrics(supabase, data)` → RPC `dashboard_metrics` (em `rpc-utils.ts:164`)
**Depois**:
```ts
const [rows] = await db.query("CALL dashboard_metrics(?, ?, ?, ?, ?, ?, ?)", [
  data.dateFrom || null,
  data.dateTo || null,
  JSON.stringify(data.stores ?? []),
  JSON.stringify(data.deptos ?? []),
  JSON.stringify(data.secoes ?? []),
  JSON.stringify(data.grupos ?? []),
  JSON.stringify(data.subgrupos ?? []),
]);
// Processar rows[0]
```

#### `getLatestSaleInfo` — linha 88
**Antes**:
```ts
const { data, error } = await supabase
  .from("import_log")
  .select("sale_date, row_count, imported_at")
  .order("sale_date", { ascending: false })
  .limit(1)
  .maybeSingle();
```
**Depois**:
```ts
const [rows] = await db.query(
  "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC LIMIT 1",
);
return rows[0] || null;
```

#### `getDashboardRankings` — linha 103
**Antes**:
```ts
const { data: res, error } = await supabase.rpc("dashboard_rankings", {
  p_date_from: ..., p_date_to: ..., p_stores: ..., p_deptos: ...,
  p_secoes: ..., p_grupos: ..., p_subgrupos: ..., p_limit: ...,
});
```
**Depois**:
```ts
const [rows] = await db.query("CALL dashboard_rankings(?, ?, ?, ?, ?, ?, ?, ?)", [
  data.dateFrom || null, data.dateTo || null,
  JSON.stringify(data.stores ?? []), JSON.stringify(data.deptos ?? []),
  JSON.stringify(data.secoes ?? []), JSON.stringify(data.grupos ?? []),
  JSON.stringify(data.subgrupos ?? []), data.limit,
]);
```

### 7.2 `area.functions.ts` (2 funções)

#### `getAreaAnalysis` — linha 25
**Antes**:
```ts
const { data: res, error } = await supabase.rpc("area_analysis", {
  p_date_from: data.dateFrom, p_date_to: data.dateTo,
  p_stores: data.stores ?? [], p_deptos: data.deptos ?? [],
  p_secoes: data.secoes ?? [], p_grupos: data.grupos ?? [],
  p_subgrupos: data.subgrupos ?? [],
  p_page: data.page ?? null, p_page_size: data.pageSize,
  p_search: data.search, p_sort_by: data.sortBy, p_sort_dir: data.sortDir,
});
```
**Depois**:
```ts
const [rows] = await db.query("CALL area_analysis(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
  data.dateFrom, data.dateTo,
  JSON.stringify(data.stores ?? []), JSON.stringify(data.deptos ?? []),
  JSON.stringify(data.secoes ?? []), JSON.stringify(data.grupos ?? []),
  JSON.stringify(data.subgrupos ?? []),
  data.page ?? null, data.pageSize,
  data.search, data.sortBy, data.sortDir,
]);
```

#### `getAreaFilterHierarchy` — linha 73
**Antes**:
```ts
const { data: res, error } = await supabase.rpc("area_filter_hierarchy");
```
**Depois**:
```ts
const [rows] = await db.query("SELECT * FROM filter_hierarchy ORDER BY store_code, depto, secao, grupo, subgrupo");
// ou
const [rows] = await db.query("CALL area_filter_hierarchy()");
```

### 7.3 `product.functions.ts` (3 funções)

#### `searchProducts` — linha 23
**Antes**:
```ts
const { data: rows, error } = await supabase.rpc("product_search", { p_q: data.q.trim() });
```
**Depois**:
```ts
const [rows] = await db.query("CALL product_search(?)", [data.q.trim()]);
// ou query direta
const [rows] = await db.query(
  "SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_name LIKE ? OR prod_code LIKE ? LIMIT 20",
  [`%${data.q.trim()}%`, `%${data.q.trim()}%`],
);
```

#### `getProductByCode` — linha 33
**Antes**:
```ts
const { data: rows, error } = await supabase.rpc("get_product_by_code", {
  p_code: data.prodCode.trim(),
});
```
**Depois**:
```ts
const [rows] = await db.query(
  "SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_code = ? LIMIT 1",
  [data.prodCode.trim()],
);
return rows[0] || null;
```

#### `getProductAnalysis` — linha 54
**Antes**:
```ts
const { data: res, error } = await supabase.rpc("product_analysis", {
  p_prod_code: data.prodCode,
  p_store_code: data.storeCode || undefined,
  p_ref_date: data.referenceDate || undefined,
});
```
**Depois**:
```ts
const [rows] = await db.query("CALL product_analysis(?, ?, ?)", [
  data.prodCode, data.storeCode || null, data.referenceDate || null,
]);
```

### 7.4 `upload.functions.ts` (5 funções)

#### `beginImport` — linhas 26-49 (3 chamadas Supabase)
**Antes (3 chamadas)**:
```ts
// 1. Delete staging
await supabaseAdmin.from("staging_sales").delete().eq("sale_date", data.sale_date);
// 2. Upsert stores
await supabaseAdmin.from("stores").upsert(data.stores, { onConflict: "store_code" });
// 3. Upsert products bulk
await supabaseAdmin.rpc("upsert_products_bulk", { p_rows: data.products, p_sale_date: data.sale_date });
```
**Depois (1 chamada — procedure única)**:
```ts
await db.query("CALL begin_import(?, ?, ?, ?, ?)", [
  data.sale_date, data.batch_id, data.total_rows,
  JSON.stringify(data.stores), JSON.stringify(data.products),
]);
```
Ou queries diretas em transação:
```ts
const conn = await db.getConnection();
try {
  await conn.beginTransaction();
  await conn.query("DELETE FROM staging_sales WHERE sale_date = ?", [data.sale_date]);
  // upsert stores
  for (const s of data.stores) {
    await conn.query(
      "INSERT INTO stores (store_code, store_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)",
      [s.store_code, s.store_name],
    );
  }
  // upsert products
  for (const p of data.products) {
    await conn.query(
      "INSERT INTO products (prod_code, prod_name, sale_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE prod_name = VALUES(prod_name)",
      [p.prod_code, p.prod_name, data.sale_date],
    );
  }
  await conn.commit();
  conn.release();
} catch (err) {
  await conn.rollback();
  conn.release();
  throw err;
}
```

#### `insertSalesChunk` — linha 70
**Antes**:
```ts
await supabaseAdmin.from("staging_sales").insert(rows);
```
**Depois**:
```ts
const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
const values = rows.flatMap((r) => [
  r.sale_date, r.batch_id, r.store_code, r.store_name, r.prod_code, r.prod_name,
  r.depto, r.secao, r.grupo, r.subgrupo,
  r.val_vda, r.qty_vda, r.val_cus, r.qty_cus,
  r.val_dev, r.qty_dev, r.val_vda_liq, r.qty_vda_liq,
  r.val_cus_liq, r.qty_cus_liq, r.val_sld, r.qty_sld, r.per_mrg,
]);
await db.query(
  `INSERT INTO staging_sales (sale_date, batch_id, store_code, store_name, prod_code, prod_name,
    depto, secao, grupo, subgrupo,
    val_vda, qty_vda, val_cus, qty_cus,
    val_dev, qty_dev, val_vda_liq, qty_vda_liq,
    val_cus_liq, qty_cus_liq, val_sld, qty_sld, per_mrg) VALUES ${placeholders}`,
  values,
);
```

#### `getImportedDates` — linha 79
**Antes**:
```ts
const { data, error } = await supabase.rpc("imported_dates");
```
**Depois**:
```ts
const [rows] = await db.query(
  "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC",
);
return rows;
```

#### `finalizeImport` — linha 100
**Antes**:
```ts
await supabaseAdmin.rpc("finalize_import", {
  p_batch_id: ..., p_sale_date: ..., p_row_count: ..., p_imported_by: ...,
});
```
**Depois**:
```ts
await db.query("CALL finalize_import(?, ?, ?, ?)", [
  data.batch_id, data.sale_date, data.row_count, context.userId,
]);
```

### 7.5 `admin.functions.ts` (10 funções)

Todas as funções de admin que usam `supabaseAdmin`:

| Função | Chamada Supabase | Nova chamada |
|--------|-----------------|--------------|
| `listUsers` (L12) | `supabaseAdmin.from("users").select(...)` | `db.query("SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC")` |
| `createUser` (L37) | `supabaseAdmin.auth.admin.createUser(...)` + `supabaseAdmin.from("users").insert(...)` | `bcrypt.hash(...)` + `db.query("INSERT INTO users...")` |
| `setUserRole` (L71) | `supabaseAdmin.from("users").update({ role }).eq("id", id)` | `db.query("UPDATE users SET role = ? WHERE id = ?", [role, id])` |
| `setUserActive` (L91) | `supabaseAdmin.from("users").update({ is_active }).eq("id", id)` | `db.query("UPDATE users SET is_active = ? WHERE id = ?", [isActive, id])` |
| `resetPassword` (L108) | `supabaseAdmin.auth.admin.updateUserById(id, { password })` | `bcrypt.hash(password, 12)` + `db.query("UPDATE users SET password = ? WHERE id = ?", [hash, id])` |
| `countRows` (L128) | `sa.from(table).select("*", { count: "exact", head: false })` | `db.query("SELECT COUNT(*) as count FROM ??", [table])` |
| `fetchDistinctDates` (L138) | `sa.from(table).select(column)` | `db.query("SELECT DISTINCT ?? FROM ?? ORDER BY ??", [column, table, column])` |
| `purgeOldAggs` (L195) | `supabaseAdmin.rpc("purge_old_aggs", { p_days: 28 })` | `db.query("CALL purge_old_aggs(?)", [28])` |
| `dbHealthCheck` (L205) | `supabaseAdmin.rpc("db_health_check")` | `db.query("SELECT VERSION() as version, NOW() as time")` + queries de tamanho |
| `diagnoseData` (L150) | Chama `countRows` e `fetchDistinctDates` | Mesmas funções adaptadas |

**Exemplo — `createUser` depois**:
```ts
// Substitui createUser L33-57
.handler(async ({ data }) => {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(data.password, 12);
  await db.query(
    "INSERT INTO users (id, email, name, password, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
    [id, data.email.trim().toLowerCase(), data.name.trim(), hash, data.role],
  );
  return { ok: true, id };
});
```

### 7.6 `admin-utils.ts` (1 função)

#### `assertAdmin` — linha 4
**Antes**:
```ts
export async function assertAdmin(ctx: { supabase: any; userId: string }, label = "assertAdmin") {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _role: "admin",
  });
  if (error) throw safeError(label, error, undefined, true);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
```
**Depois**:
```ts
export async function assertAdmin(ctx: { db: any; userId: string }, label = "assertAdmin") {
  const [rows] = await ctx.db.query("SELECT role FROM users WHERE id = ?", [ctx.userId]);
  if (!rows.length || rows[0].role !== "admin") {
    throw new Error("Apenas administradores podem realizar esta ação.");
  }
}
```

---

## 8. Rotas — Antes/Depois

### 8.1 `__root.tsx` — linha 129
**Antes**:
```ts
const { data: sub } = supabase.auth.onAuthStateChange((event) => {
  if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
  router.invalidate();
  if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
});
return () => sub.subscription.unsubscribe();
```
**Depois**:
```ts
// Remover listener do Supabase Auth.
// O estado de autenticação agora é verificado via cookie em cada beforeLoad.
// A invalidação pode ser feita manualmente após login/logout.
```

### 8.2 `auth.tsx` (rota `/auth`) — linha 17
**Antes**:
```ts
const { data } = await supabase.auth.getUser();
if (data.user) { throw redirect({ to: "/" }); }
```
**Depois**:
```ts
// Importar e chamar getMe() do auth-api
import { getMe } from "@/lib/auth-api";
const user = await getMe();
if (user) { throw redirect({ to: "/" }); }
```

### 8.3 `auth.page.tsx` — linha 47 (login)
**Antes**:
```ts
const { data: signInData, error } = await supabase.auth.signInWithPassword({
  email: normalized, password,
});
if (error || !signInData.user) { ... }
const { data: u } = await supabase.from("users")
  .select("is_active").eq("id", signInData.user.id).maybeSingle();
if (!u || !u.is_active) { await supabase.auth.signOut(); ... }
```
**Depois**:
```ts
import { login } from "@/lib/auth-api";
const result = await login({ data: { email, password } });
if (!result.ok) { setLoading(false); toast.error(result.error); return; }
// Salvar cookie manualmente ou usar o header de resposta
document.cookie = result.cookie;
goNext();
```

### 8.4 `_authenticated/route.tsx` — linha 34 (beforeLoad)
**Antes**:
```ts
const { data, error } = await supabase.auth.getUser();
if (error || !data.user) { throw redirect({ to: "/auth" }); }
return { user: data.user };
```
**Depois**:
```ts
import { getMe } from "@/lib/auth-api";
const user = await getMe();
if (!user) { throw redirect({ to: "/auth" }); }
return { user };
```

### 8.5 `_authenticated/route.tsx` — linha 88 (carregar profile)
**Antes**:
```ts
const { data } = await supabase.from("users")
  .select("is_active, role").eq("id", user.id).maybeSingle();
if (!data || !data.is_active) { await supabase.auth.signOut(); ... }
setProfile({ isActive: true, isAdmin: data.role === "admin" });
```
**Depois**:
```ts
// user já tem role (retornado por getMe)
setProfile({ isActive: true, isAdmin: user.role === "admin" });
```

### 8.6 `_authenticated/route.tsx` — linha 103 (signOut)
**Antes**:
```ts
await supabase.auth.signOut();
```
**Depois**:
```ts
await fetch("/api/logout", { method: "POST" });
// ou chamar server function logout()
document.cookie = "session=; Path=/; Max-Age=0";
```

### 8.7 `_authenticated/admin.tsx` — linha 9 (beforeLoad admin)
**Antes**:
```ts
const { data: isAdmin } = await supabase.rpc("has_role", {
  _user_id: u.id, _role: "admin",
});
if (isAdmin !== true) throw redirect({ to: "/" });
```
**Depois**:
```ts
// user.role já está no contexto
if (context.user.role !== "admin") throw redirect({ to: "/" });
```

### 8.8 `_authenticated/upload.tsx` — linha 8 (beforeLoad admin)
**Antes**:
```ts
const { supabase } = await import("@/integrations/supabase/client");
const { data: isAdmin } = await supabase.rpc("has_role", {
  _user_id: u.id, _role: "admin",
});
if (isAdmin !== true) throw redirect({ to: "/" });
```
**Depois**:
```ts
if (context.user.role !== "admin") throw redirect({ to: "/" });
```

### 8.9 `router.tsx` — linha 25 (queryCache onError)
**Antes**:
```ts
const { supabase } = await import("@/integrations/supabase/client");
await supabase.auth.signOut();
window.location.href = "/auth";
```
**Depois**:
```ts
document.cookie = "session=; Path=/; Max-Age=0";
window.location.href = "/auth";
```

---

## 9. Componentes — Antes/Depois

### 9.1 `admin-gate.tsx` — linha 19
**Antes**:
```ts
import { supabase } from "@/integrations/supabase/client";
// ...
const { data: u } = await supabase.auth.getUser();
if (!u.user) return setState("deny");
const { data, error } = await supabase.rpc("has_role", {
  _user_id: u.user.id, _role: "admin",
});
setState(!error && data === true ? "allow" : "deny");
```
**Depois**:
```ts
import { getMe } from "@/lib/auth-api";
// ...
const user = await getMe();
if (!user) return setState("deny");
setState(user.role === "admin" ? "allow" : "deny");
```

---

## 10. Start / Router — Antes/Depois

### 10.1 `src/start.ts`
**Antes**:
```ts
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],  // ← REMOVER
  requestMiddleware: [errorMiddleware],
}));
```
**Depois**:
```ts
// Remover attachSupabaseAuth — auth agora é via cookie JWT
export const startInstance = createStart(() => ({
  functionMiddleware: [],  // ← vazio
  requestMiddleware: [errorMiddleware],
}));
```

### 10.2 `src/router.tsx`
**Antes**:
```ts
queryCache: new QueryCache({
  onError: async (error) => {
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("forbidden")) {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();   // ← REMOVER
      window.location.href = "/auth";
    }
  },
}),
```
**Depois**:
```ts
queryCache: new QueryCache({
  onError: async (error) => {
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("forbidden")) {
      document.cookie = "session=; Path=/; Max-Age=0";
      window.location.href = "/auth";
    }
  },
}),
```

---

## 11. Integrações Supabase — Remover

Após a migração, **remover completamente**:

```
src/integrations/supabase/
├── client.ts              → REMOVER
├── client.server.ts       → REMOVER
├── auth-middleware.ts     → REMOVER (substituído por src/lib/auth-middleware.ts)
├── auth-attacher.ts       → REMOVER
└── types.ts               → REMOVER
```

Também remover do `package.json`:
```json
"@supabase/supabase-js": "^X.X.X"  // REMOVER
```

E do `.env` (vazar service role key em git é inseguro):
```
SUPABASE_URL=             → REMOVER
SUPABASE_ANON_KEY=        → REMOVER
SUPABASE_SERVICE_ROLE_KEY= → REMOVER
SUPABASE_PUBLISHABLE_KEY= → REMOVER
VITE_SUPABASE_URL=        → REMOVER
VITE_SUPABASE_ANON_KEY=   → REMOVER
VITE_SUPABASE_PUBLISHABLE_KEY= → REMOVER
```

Adicionar ao `.env`:
```
DB_HOST=localhost
DB_USER=bench_gpa
DB_PASS=senha_segura
DB_NAME=bench_gpa
JWT_SECRET=segredo_aqui
```

---

## 12. Nginx + PM2 + Deploy

### 12.1 Nginx

```nginx
# /etc/nginx/sites-available/bench-gpa
server {
    listen 80;
    server_name 52.67.178.69;  # ou seu domínio

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

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (não depende do app)
    location /health {
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
```

### 12.2 PM2

```js
// ecosystem.config.js (na raiz do projeto)
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
    },
    // Reiniciar se memória > 512MB
    max_memory_restart: "512M",
    error_file: "logs/pm2-error.log",
    out_file: "logs/pm2-out.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
  }],
};
```

### 12.3 Script de deploy

```bash
#!/bin/bash
# scripts/deploy.sh
set -e

echo "⏳ Pulling latest..."
git pull origin main

echo "⏳ Installing dependencies..."
npm ci --production

echo "⏳ Building..."
npm run build

echo "⏳ Reloading PM2..."
pm2 reload ecosystem.config.js

echo "✅ Deploy complete!"
```

### 12.4 SSL (Let's Encrypt)

```bash
# Via Hestia (recomendado) ou manual:
apt install certbot python3-certbot-nginx -y
certbot --nginx -d seu-dominio.com
```

### 12.5 Comandos úteis (colocar no README ou docs)

```bash
# Iniciar app
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # reiniciar automaticamente após reboot

# Ver logs
pm2 logs bench-gpa
pm2 monit

# Reiniciar
pm2 reload bench-gpa

# Parar
pm2 stop bench-gpa
```

### 12.6 Cron jobs

```cron
# Importação horária
0 * * * * cd /root/bench-gpa && PATH=/root/.bun/bin:$PATH /root/.bun/bin/bun run cli:watch >> logs/cron.log 2>&1

# Code review diário 6h
0 6 * * * cd /root/bench-gpa && PATH=/root/.bun/bin:$PATH /root/.bun/bin/bun run cli:review >> logs/cron.log 2>&1
```

---

## 13. Migração de Dados

### 13.1 Exportar do Supabase

```bash
# Obter string de conexão do Supabase
# Settings → Database → Connection string (URI)

# Exportar tabelas como INSERTs
pg_dump \
  --dbname="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  --data-only \
  --column-inserts \
  -t stores \
  -t products \
  -t import_log \
  -t staging_sales \
  -t sales_daily_agg \
  -t sales_prod_daily_agg \
  -t filter_hierarchy \
  -t users \
  > supabase_dump.sql
```

### 13.2 Converter PostgreSQL → MariaDB

Principais diferenças de sintaxe:

| PostgreSQL | MariaDB |
|-----------|---------|
| `true`/`false` | `TRUE`/`FALSE` |
| `uuid` tipo | `VARCHAR(36)` |
| `timestamptz` | `TIMESTAMP` |
| `ARRAY[]` | `JSON` |
| `'string'::type` | `CAST('string' AS type)` |
| `SELECT 1::int` | `SELECT CAST(1 AS SIGNED)` |
| `jsonb_to_recordset` | `JSON_TABLE` |
| `ON CONFLICT (col) DO UPDATE` | `ON DUPLICATE KEY UPDATE` |

**Script de conversão automática** (criar `scripts/convert-supabase-dump.sh`):
```bash
#!/bin/bash
# Converte pg_dump para MariaDB
sed \
  -e 's/true/FALSE/g' \
  -e 's/false/FALSE/g' \
  -e 's/::integer//g' \
  -e 's/::text//g' \
  -e 's/::timestamp with time zone//g' \
  -e 's/::date//g' \
  -e 's/uuid_d/VARCHAR(36)/g' \
  -e "s/'t'::boolean/TRUE/g" \
  -e "s/'f'::boolean/FALSE/g" \
  -e 's/ON CONFLICT (.*) DO NOTHING/-- IGNORE/g' \
  -e 's/ON CONFLICT (.*) DO UPDATE SET/ON DUPLICATE KEY UPDATE/g' \
  supabase_dump.sql > mariadb_ready.sql
```

### 13.3 Importar para MariaDB

```bash
mysql -u bench_gpa -p bench_gpa < scripts/migrate-schema.sql
mysql -u bench_gpa -p bench_gpa < mariadb_ready.sql
```

### 13.4 Criar admin inicial

```bash
# Criar primeiro usuário admin
mysql -u bench_gpa -p bench_gpa -e "
INSERT INTO users (id, email, name, password, role, is_active)
VALUES (
  '$(uuidgen)',
  'admin@gpabr.com',
  'Administrador',
  '$(echo -n "senha123" | node -e "const b=require('bcrypt');process.stdin.on('data',d=>b.hash(d.toString().trim(),12).then(console.log))")',
  'admin',
  TRUE
);
"
```

---

## 14. Ordem de Implementação

### Fase 0: Infraestrutura (30 min)

```bash
# No VPS
apt install nginx mariadb-server -y
npm install -g pm2
```

```sql
-- Criar database
CREATE DATABASE bench_gpa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bench_gpa'@'localhost' IDENTIFIED BY 'senha';
GRANT ALL ON bench_gpa.* TO 'bench_gpa'@'localhost';
```

```bash
# Schema + stored procedures
mysql -u bench_gpa -p bench_gpa < scripts/migrate-schema.sql
```

### Fase 1: Build config (1 commit)

| Arquivo | Mudança |
|---|---|
| `vite.config.ts` | Add `preset: "node-server"` (ou `"vercel"` se SSR na Vercel) |
| `ecosystem.config.js` | **Novo** |
| `scripts/deploy.sh` | **Novo** |
| Nginx site config | Criar `/etc/nginx/sites-available/bench-gpa` + enable |

### Fase 2: Conexão + Stored Procedures (1 commit)

| Arquivo | Mudança |
|---|---|
| `src/lib/db.ts` | **Novo** (mysql2 pool) |
| `scripts/migrate-schema.sql` | **Novo** (schema + 15 procedures) |
| `package.json` | Add `mysql2` |

### Fase 3: Server Functions — Leitura (1 commit)

Substituir chamadas RPC em:

| Arquivo | Funções |
|---|---|
| `src/lib/dashboard.functions.ts` | `getFilterOptions`, `getStores`, `getDashboard`, `getLatestSaleInfo`, `getDashboardRankings` |
| `src/lib/area.functions.ts` | `getAreaAnalysis`, `getAreaFilterHierarchy` |
| `src/lib/product.functions.ts` | `searchProducts`, `getProductByCode`, `getProductAnalysis` |
| `src/lib/rpc-utils.ts` | `callMetrics` |

### Fase 4: Server Functions — Escrita (1 commit)

| Arquivo | Funções |
|---|---|
| `src/lib/upload.functions.ts` | `beginImport`, `insertSalesChunk`, `finalizeImport` |
| `src/lib/admin.functions.ts` | `createUser`, `setUserRole`, `setUserActive`, `resetPassword`, `listUsers`, `countRows`, `fetchDistinctDates`, `purgeOldAggs`, `dbHealthCheck` |
| `src/lib/admin-utils.ts` | `assertAdmin` |

### Fase 5: Auth JWT (1 commit)

| Arquivo | Mudança |
|---|---|
| `src/lib/auth-middleware.ts` | **Novo** |
| `src/lib/auth-api.ts` | **Novo** |
| `src/routes/auth.tsx` | `getUser()` → `getMe()` |
| `src/routes/auth.page.tsx` | `signInWithPassword` → `login()` |
| `src/routes/__root.tsx` | Remove `onAuthStateChange` |
| `src/routes/_authenticated/route.tsx` | `getUser` → `getMe`, `signOut` → cookie |
| `src/routes/_authenticated/admin.tsx` | `rpc("has_role")` → `context.user.role` |
| `src/routes/_authenticated/upload.tsx` | `rpc("has_role")` → `context.user.role` |
| `src/components/admin-gate.tsx` | Supabase → `getMe()` |
| `src/router.tsx` | `supabase.auth.signOut()` → cookie |
| `package.json` | Add `bcrypt`, `jsonwebtoken` |

### Fase 6: Cleanup (1 commit)

| Ação |
|---|
| Remover diretório `src/integrations/supabase/` |
| Remover `@supabase/supabase-js` do package.json |
| Remover SUPABASE_* do `.env` |
| Rodar `npm run build` e testar |

---

## 15. Checklist Completão

### Fase 0 — Infraestrutura

- [ ] MariaDB instalado e rodando
- [ ] Database `bench_gpa` criado
- [ ] Usuário `bench_gpa` com permissões
- [ ] Nginx instalado
- [ ] PM2 instalado globalmente
- [ ] Node.js 22+ instalado

### Fase 1 — Build Config

- [ ] `vite.config.ts` com preset `node-server`
- [ ] `ecosystem.config.js` criado
- [ ] `scripts/deploy.sh` criado
- [ ] Nginx configurado e ativo
- [ ] `npm run build` funciona
- [ ] `pm2 start` e site acessível via IP

### Fase 2 — Conexão + Schema

- [ ] `src/lib/db.ts` criado com mysql2 pool
- [ ] `scripts/migrate-schema.sql` com schema + stored procedures
- [ ] Schema executado no MariaDB
- [ ] `mysql2` no package.json

### Fase 3 — Server Functions Leitura

- [ ] `dashboard.functions.ts` sem Supabase
- [ ] `area.functions.ts` sem Supabase
- [ ] `product.functions.ts` sem Supabase
- [ ] `rpc-utils.ts` sem Supabase
- [ ] Dashboard funcionando com dados do MariaDB
- [ ] Área funcionando
- [ ] Produto funcionando

### Fase 4 — Server Functions Escrita

- [ ] `upload.functions.ts` sem Supabase
- [ ] `admin.functions.ts` sem Supabase
- [ ] `admin-utils.ts` sem Supabase
- [ ] Importação funcionando
- [ ] Admin CRUD funcionando

### Fase 5 — Auth JWT

- [ ] `src/lib/auth-middleware.ts` criado
- [ ] `src/lib/auth-api.ts` criado
- [ ] Login funcionando (campo e senha → JWT → cookie)
- [ ] Logout funcionando
- [ ] Rotas autenticadas protegidas
- [ ] Admin routes verificando role
- [ ] AdminGate componente funcionando
- [ ] `bcrypt` e `jsonwebtoken` no package.json

### Fase 6 — Cleanup

- [ ] `src/integrations/supabase/` removido
- [ ] `@supabase/supabase-js` removido do package.json
- [ ] SUPABASE_* removido do `.env`
- [ ] `npm run build` sem erros
- [ ] `git push` só com o necessário
- [ ] Todos os dados migrados para MariaDB
- [ ] Primeiro admin criado
- [ ] Teste completo: dashboard, área, produto, import, admin, docs

---

## Apêndice: Mapa completo de imports

### Arquivos que importam `@supabase/supabase-js`

| Arquivo | O que fazer |
|---|---|
| `src/integrations/supabase/client.ts` | Remover |
| `src/integrations/supabase/client.server.ts` | Remover |
| `src/integrations/supabase/auth-middleware.ts` | Remover |
| `src/lib/rpc-utils.ts` (type only) | Remover o type |

### Arquivos que importam `supabase` do client

| Arquivo | Substituir por |
|---|---|
| `src/routes/__root.tsx:15` | Remover `onAuthStateChange` |
| `src/routes/auth.tsx:3` | `getMe()` do `auth-api` |
| `src/routes/auth.page.tsx:3` | `login()` do `auth-api` |
| `src/routes/_authenticated/route.tsx:9` | `getMe()` + cookie logout |
| `src/routes/_authenticated/admin.tsx:3` | `context.user.role` |
| `src/components/admin-gate.tsx:2` | `getMe()` |
| `src/router.tsx:25` (dinâmico) | Cookie → `signOut` |
| `src/routes/_authenticated/upload.tsx:8` (dinâmico) | `context.user.role` |

### Arquivos que importam `requireSupabaseAuth`

| Arquivo | Substituir por |
|---|---|
| `src/lib/dashboard.functions.ts:2` | `requireAuth` do `auth-middleware` |
| `src/lib/upload.functions.ts:2` | `requireAuth` |
| `src/lib/admin.functions.ts:2` | `requireAuth` |
| `src/lib/area.functions.ts:2` | `requireAuth` |
| `src/lib/product.functions.ts:2` | `requireAuth` |

### Arquivos que importam `attachSupabaseAuth`

| Arquivo | O que fazer |
|---|---|
| `src/start.ts:4` | Remover |

---

> **Fim do documento.** Para executar, siga a [Ordem de Implementação](#14-ordem-de-implementação) numerada e marque cada item no [Checklist Completão](#15-checklist-completão).
