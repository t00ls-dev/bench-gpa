# Migração: Supabase (Auth) + SQLite (Dados)

## Motivação
Base de dados atual em 600 MB, acima do limite de 500 MB do free tier Supabase.
A maior parte (523 MB) é `sales_prod_daily_agg`. Manter apenas Auth + tabelas
minúsculas no Supabase; todo dado analítico move para SQLite via `bun:sqlite`.

---

## Stack final

| Camada | Tecnologia | Custo |
|---|---|---|
| Auth (login, JWT, users) | Supabase Auth | Free (50k MAU) |
| Admin (CRUD users) | Supabase `public.users` | Incluso no free |
| Dados analíticos | `bun:sqlite` (SQLite) | Zero — arquivo local |
| Driver | `bun:sqlite` | Nativo, sem dependências |

---

## O que fica no Supabase

### Auth
- `auth.users` — gerenciado pelo Supabase
- Validação JWT via `auth-middleware.ts` (inalterado)
- `auth-attacher.ts` (inalterado)

### Tabelas
- `public.users` (~48 kB) — `id, email, name, role, is_active, created_at`
  - Vinculada a `auth.users.id`
  - Usada por `admin.functions.ts` e `assertAdmin()`

### Server functions que **não** mudam
- `admin.functions.ts` — `listUsers, createUser, setUserRole, setUserActive, resetPassword`
  - Tudo via `supabaseAdmin.auth.admin.*` + `supabaseAdmin.from("users")`
- `src/lib/admin-utils.ts:assertAdmin()` — consulta `has_role` RPC no Supabase

### Middleware (inalterado)
- `src/integrations/supabase/auth-middleware.ts` — valida JWT, injeta `context.supabase` + `context.userId`
- `src/integrations/supabase/auth-attacher.ts` — anexa Bearer token às serverFn

---

## O que move para SQLite

### `src/data/analytics.db` (arquivo SQLite)

| Tabela | Schema SQLite | Origem |
|---|---|---|
| `sales_prod_daily_agg` | Ver schema abaixo | Supabase (~523 MB) |
| `sales_daily_agg` | Ver schema abaixo | Supabase (~65 MB) |
| `staging_sales` | Ver schema abaixo | Supabase (temporária) |
| `products` | Ver schema abaixo | Supabase (~8 MB) |
| `filter_hierarchy` | Ver schema abaixo | Supabase (~4 MB) |
| `stores` | Ver schema abaixo | Supabase (~64 kB) |
| `import_log` | Ver schema abaixo | Supabase (~24 kB) |

### Schema SQLite (`src/data/schema.sql`)

```sql
-- stores
CREATE TABLE IF NOT EXISTS stores (
  store_code TEXT PRIMARY KEY,
  store_name TEXT NOT NULL
);

-- products
CREATE TABLE IF NOT EXISTS products (
  prod_code TEXT PRIMARY KEY,
  prod_name TEXT NOT NULL,
  last_seen TEXT
);

-- import_log
CREATE TABLE IF NOT EXISTS import_log (
  sale_date TEXT PRIMARY KEY,
  row_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  imported_by TEXT
);

-- staging_sales (temporária durante import)
CREATE TABLE IF NOT EXISTS staging_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT,
  prod_code TEXT NOT NULL,
  prod_name TEXT NOT NULL,
  val_vda REAL NOT NULL
);

-- sales_daily_agg
CREATE TABLE IF NOT EXISTS sales_daily_agg (
  sale_date TEXT NOT NULL,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT,
  val_vda REAL NOT NULL,
  item_count INTEGER NOT NULL
);

-- sales_prod_daily_agg (tabela principal)
CREATE TABLE IF NOT EXISTS sales_prod_daily_agg (
  sale_date TEXT NOT NULL,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT,
  prod_code TEXT NOT NULL,
  prod_name TEXT NOT NULL,
  val_vda REAL NOT NULL,
  item_count INTEGER NOT NULL
);

-- filter_hierarchy (pré-computada)
CREATE TABLE IF NOT EXISTS filter_hierarchy (
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT
);
```

### Índices SQLite

```sql
-- sales_prod_daily_agg
CREATE INDEX IF NOT EXISTS spda_date_idx       ON sales_prod_daily_agg(sale_date);
CREATE INDEX IF NOT EXISTS spda_date_prod_idx  ON sales_prod_daily_agg(sale_date, prod_code);
CREATE INDEX IF NOT EXISTS spda_date_store_idx ON sales_prod_daily_agg(sale_date, store_code);
CREATE INDEX IF NOT EXISTS spda_hier_idx       ON sales_prod_daily_agg(depto, secao, grupo, subgrupo);
CREATE INDEX IF NOT EXISTS spda_prod_idx       ON sales_prod_daily_agg(prod_code);

-- sales_daily_agg
CREATE INDEX IF NOT EXISTS sda_date_idx       ON sales_daily_agg(sale_date);
CREATE INDEX IF NOT EXISTS sda_date_store_idx ON sales_daily_agg(sale_date, store_code);
CREATE INDEX IF NOT EXISTS sda_hier_idx       ON sales_daily_agg(depto, secao, grupo, subgrupo);

-- filter_hierarchy
CREATE INDEX IF NOT EXISTS fh_store_idx       ON filter_hierarchy(store_code);
CREATE INDEX IF NOT EXISTS fh_depto_idx       ON filter_hierarchy(depto);
CREATE INDEX IF NOT EXISTS fh_secao_idx       ON filter_hierarchy(secao);
CREATE INDEX IF NOT EXISTS fh_grupo_idx       ON filter_hierarchy(grupo);
CREATE INDEX IF NOT EXISTS fh_subgrupo_idx    ON filter_hierarchy(subgrupo);

-- staging_sales
CREATE INDEX IF NOT EXISTS ss_batch_idx       ON staging_sales(batch_id);
CREATE INDEX IF NOT EXISTS ss_date_idx        ON staging_sales(sale_date);

-- products
CREATE INDEX IF NOT EXISTS products_name_idx  ON products(prod_name COLLATE NOCASE);
```

> Nota: SQLite não tem índices GIN para trigram search. A busca em `products`
> será via `LOWER(prod_name) LIKE LOWER('%termo%')` com `COLLATE NOCASE`
> no índice — performance aceitável para <50k produtos.

---

## Módulo de conexão

### `src/lib/db.ts`

```typescript
import { Database } from "bun:sqlite";
import path from "node:path";

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const dbPath = path.join(process.cwd(), "src/data/analytics.db");
    _db = new Database(dbPath);
    _db.run("PRAGMA journal_mode = WAL");
    _db.run("PRAGMA foreign_keys = ON");
  }
  return _db;
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null; }
}
```

**Uso nas server functions:**

```typescript
import { getDb } from "@/lib/db";

// Leitura
const db = getDb();
const rows = db.prepare("SELECT * FROM stores ORDER BY store_code").all() as StoreOption[];

// Com parâmetros
const stmt = db.prepare(
  "SELECT prod_code, prod_name FROM products " +
  "WHERE LOWER(prod_name) LIKE LOWER(?) OR prod_code LIKE ?"
);
const results = stmt.all(`%${q}%`, `%${q}%`);
```

---

## Conversão das server functions

Cada função em `src/lib/analytics.functions.ts` que chama `supabase.rpc(...)`
será reescrita para usar `getDb()` e SQL direto.

### Mapeamento RPC → SQLite

#### 1. `getStores`
**Antes:** `supabase.from("stores").select("store_code, store_name").order("store_code")`
**Depois:**
```typescript
const db = getDb();
return db.prepare("SELECT store_code, store_name FROM stores ORDER BY store_code").all();
```

#### 2. `getFilterOptions`
**Antes:** `supabase.rpc("filter_options", {...})` — CTE em cascata no PostgreSQL
**Depois:** lógica em TypeScript + queries individuais no SQLite:
```typescript
const db = getDb();

// availableDates
const avail = db.prepare(
  "SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date"
).all().map((r: any) => r.sale_date);

// latestDate
const row = db.prepare("SELECT MAX(sale_date) AS d FROM import_log").get() as any;
const latest = row?.d ?? null;

// stores
const stores = db.prepare(
  "SELECT DISTINCT store_code, store_name FROM filter_hierarchy ORDER BY store_code"
).all() as StoreOption[];

// deptos (respeitando filtros atuais)
const deptos = db.prepare(buildFilterSQL("depto", stores, deptos, secoes, grupos))
  .all(...params).map((r: any) => r.depto);
// ... similar para secoes, grupos, subgrupos
```

Um helper `buildFilterSQL` monta WHERE dinamicamente:
```typescript
function buildFilterSQL(
  col: string, stores: string[], deptos: string[], secoes: string[], grupos: string[]
) {
  const conds: string[] = [];
  const params: string[] = [];
  if (stores.length) { conds.push(`store_code IN (${stores.map(() => '?').join(',')})`); params.push(...stores); }
  if (deptos.length) { conds.push(`depto IN (${deptos.map(() => '?').join(',')})`); params.push(...deptos); }
  if (secoes.length) { conds.push(`secao IN (${secoes.map(() => '?').join(',')})`); params.push(...secoes); }
  if (grupos.length) { conds.push(`grupo IN (${grupos.map(() => '?').join(',')})`); params.push(...grupos); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return { sql: `SELECT DISTINCT ${col} FROM filter_hierarchy ${where} ORDER BY ${col}`, params };
}
```

#### 3. `getDashboard` / `callMetrics`

`dashboard_metrics` RPC (PostgreSQL):
```sql
-- Faz 3 agregações: venda total, por loja, por depto, por data
-- em `sales_daily_agg` filtrada por período + filtros
```

Tradução SQLite:
```typescript
function callMetrics(dateFrom: string, dateTo: string, filters: Filters) {
  const db = getDb();
  const { sql, params } = buildAggSQL("sales_daily_agg", dateFrom, dateTo, filters);

  const total = (db.prepare(`SELECT COALESCE(SUM(val_vda), 0) AS v FROM sales_daily_agg ${sql}`)
    .get(...params) as any).v;

  const byStore = db.prepare(
    `SELECT store_code AS code, store_name AS name, SUM(val_vda) AS val
     FROM sales_daily_agg ${sql}
     GROUP BY store_code, store_name
     ORDER BY val DESC`
  ).all(...params) as CodeNameVal[];

  const byDepto = db.prepare(
    `SELECT depto AS name, SUM(val_vda) AS val
     FROM sales_daily_agg ${sql}
     GROUP BY depto ORDER BY val DESC`
  ).all(...params) as NameVal[];

  const byDate = db.prepare(
    `SELECT sale_date AS date, SUM(val_vda) AS val
     FROM sales_daily_agg ${sql}
     GROUP BY sale_date ORDER BY sale_date`
  ).all(...params) as DateVal[];

  return { total, byStore, byDepto, byDate };
}
```

#### 4. `searchProducts`

**Antes:** `supabase.rpc("product_search", { p_q })` — índice GIN trigram no PostgreSQL
**Depois:**
```typescript
const db = getDb();
const q = data.q.trim();
return db.prepare(
  "SELECT prod_code, prod_name FROM products " +
  "WHERE LOWER(prod_name) LIKE LOWER(?) OR prod_code LIKE ? " +
  "ORDER BY last_seen DESC LIMIT 20"
).all(`%${q}%`, `%${q}%`);
```

#### 5. `getProductAnalysis`

Equivalente ao RPC `product_analysis` — 4 agregações em `sales_prod_daily_agg`:
- Produto info: `SELECT depto, secao, grupo, subgrupo FROM products WHERE prod_code = ?`
- Valor ref: data mais recente com venda
- `byStore`: agrupado por loja no período
- `evolution`: série diária
- `lastFourSameWeekday`: último 4 mesmo dia da semana
- `lastFourAll`: últimos 4 dias

Tudo vira queries SQLite com prepared statements.

#### 6. `getAreaAnalysis`

Equivalente ao RPC `area_analysis` — o mais complexo:
- CTE `cur_agg` → agrega `sales_prod_daily_agg` por produto
- CTE `universe` → produtos sem venda no período mas no filtro hierárquico
- CTE `joined` → FULL OUTER JOIN dos dois
- CTE `last_sale_all` → última data de venda de cada produto
- Paginação + ordenação + busca

SQLite não tem FULL OUTER JOIN nem `jsonb_agg`. A tradução:

```sql
-- cur_agg
SELECT prod_code, MIN(prod_name) AS prod_name, MIN(depto) AS depto,
       MIN(secao) AS secao, MIN(grupo) AS grupo, MIN(subgrupo) AS subgrupo,
       SUM(val_vda) AS val, SUM(item_count) AS qty
FROM sales_prod_daily_agg
WHERE sale_date BETWEEN ? AND ?
  AND ...filtros...
GROUP BY prod_code
```

```sql
-- FULL OUTER JOIN simulado via LEFT JOIN + UNION
SELECT COALESCE(c.prod_code, u.prod_code) AS prod_code, ...
FROM cur_agg c LEFT JOIN universe u ON u.prod_code = c.prod_code
UNION
SELECT COALESCE(c.prod_code, u.prod_code) AS prod_code, ...
FROM universe u LEFT JOIN cur_agg c ON c.prod_code = u.prod_code
WHERE c.prod_code IS NULL
```

Ou mais simples: executar as duas queries e fazer o merge em TypeScript.

```sql
-- last_sale_all
SELECT s.prod_code, MAX(s.sale_date) AS last_sale_date
FROM sales_prod_daily_agg s
WHERE s.prod_code IN (SELECT prod_code FROM joined)
  AND s.sale_date <= ?
GROUP BY s.prod_code
```

```sql
-- Página ordenada
SELECT * FROM joined
WHERE LOWER(prod_code) LIKE LOWER(?) OR LOWER(prod_name) LIKE LOWER(?)
ORDER BY
  CASE WHEN ? = 'val' AND ? = 'desc' THEN val END DESC,
  CASE WHEN ? = 'val' AND ? = 'asc' THEN val END ASC,
  ...
LIMIT ? OFFSET ?
```

> Nota: `CASE WHEN` em ORDER BY funciona no SQLite igual no PostgreSQL.

#### 7. `getAreaFilterHierarchy`

```typescript
const db = getDb();
const hierarchy = db.prepare(
  "SELECT store_code, store_name, depto, secao, grupo, subgrupo " +
  "FROM filter_hierarchy ORDER BY store_code, depto, secao, grupo, subgrupo"
).all() as AreaHierarchyItem[];

const avail = db.prepare(
  "SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date"
).all().map((r: any) => r.sale_date);

const row = db.prepare("SELECT MAX(sale_date) AS d FROM import_log").get() as any;
const latest = row?.d ?? null;

return { latestDate: latest, hierarchy, availableDates: avail };
```

#### 8. `getImportedDates` / `getLatestSaleInfo`

```typescript
const db = getDb();
return db.prepare(
  "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date"
).all();
```

#### 9. `getDashboardRankings`

Equivalente ao RPC `dashboard_rankings` — agrega `sales_prod_daily_agg`
para cada nível hierárquico. Mesmo padrão dos outros:

```typescript
function buildRankingSQL(hierLevel: string, dateFrom: string, dateTo: string, filters: Filters, limit: number) {
  const cols = hierLevel === 'produto'
    ? `${hierLevel === 'produto' ? 'prod_code AS code, prod_name AS name' : `${hierLevel} AS name`}`
    : `${hierLevel} AS name`;
  const groupBy = hierLevel === 'produto' ? 'prod_code, prod_name' : hierLevel;
  const { sql, params } = buildFilterSQLFull("sales_prod_daily_agg", dateFrom, dateTo, filters);
  return {
    sql: `SELECT ${cols}, SUM(val_vda) AS val FROM sales_prod_daily_agg ${sql} GROUP BY ${groupBy} ORDER BY val DESC LIMIT ${limit}`,
    params
  };
}
```

---

## Import pipeline

### `src/lib/upload.functions.ts`

Toda a lógica que hoje usa `supabaseAdmin` será convertida para SQLite:

#### `beginImport`
```typescript
const db = getDb();
// Limpa staging anterior para esta data
db.run("DELETE FROM staging_sales WHERE sale_date = ?", [data.sale_date]);
// Upsert stores
for (const s of data.stores) {
  db.run("INSERT OR REPLACE INTO stores (store_code, store_name) VALUES (?, ?)", [s.store_code, s.store_name]);
}
// Upsert products
for (const p of data.products) {
  db.run("INSERT OR REPLACE INTO products (prod_code, prod_name, last_seen) VALUES (?, ?, ?)",
    [p.prod_code, p.prod_name, data.sale_date]);
}
```

#### `insertSalesChunk`
```typescript
const db = getDb();
const stmt = db.prepare(
  "INSERT INTO staging_sales (batch_id, sale_date, store_code, store_name, " +
  "depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda) " +
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const tx = db.transaction((rows) => {
  for (const r of rows) {
    stmt.run(r.batch_id, r.sale_date, r.store_code, r.store_name,
      r.depto, r.secao, r.grupo, r.subgrupo, r.prod_code, r.prod_name, r.val_vda);
  }
});
tx(data.rows);
```

#### `finalizeImport`
```typescript
const db = getDb();
const tx = db.transaction(() => {
  // 1. Deleta aggs antigas para esta data
  db.run("DELETE FROM sales_daily_agg WHERE sale_date = ?", [data.sale_date]);
  db.run("DELETE FROM sales_prod_daily_agg WHERE sale_date = ?", [data.sale_date]);

  // 2. Popula sales_daily_agg a partir de staging
  db.run(`
    INSERT INTO sales_daily_agg (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, val_vda, item_count)
    SELECT sale_date, store_code, store_name, depto, secao, grupo, subgrupo, SUM(val_vda), COUNT(*)
    FROM staging_sales WHERE sale_date = ? AND batch_id = ?
    GROUP BY sale_date, store_code, store_name, depto, secao, grupo, subgrupo
  `, [data.sale_date, data.batch_id]);

  // 3. Popula sales_prod_daily_agg
  db.run(`
    INSERT INTO sales_prod_daily_agg (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda, item_count)
    SELECT sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, SUM(val_vda), COUNT(*)
    FROM staging_sales WHERE sale_date = ? AND batch_id = ?
    GROUP BY sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name
  `, [data.sale_date, data.batch_id]);

  // 4. Atualiza filter_hierarchy
  db.run("DELETE FROM filter_hierarchy WHERE store_code IN (SELECT DISTINCT store_code FROM staging_sales WHERE sale_date = ?)", [data.sale_date]);
  db.run(`
    INSERT OR IGNORE INTO filter_hierarchy (store_code, store_name, depto, secao, grupo, subgrupo)
    SELECT DISTINCT store_code, store_name, depto, secao, grupo, subgrupo
    FROM staging_sales WHERE sale_date = ?
  `, [data.sale_date]);

  // 5. Limpa staging
  db.run("DELETE FROM staging_sales WHERE sale_date = ?", [data.sale_date]);

  // 6. Loga importação
  db.run(
    "INSERT OR REPLACE INTO import_log (sale_date, row_count, imported_at, imported_by) VALUES (?, ?, datetime('now'), ?)",
    [data.sale_date, data.row_count, data.imported_by]
  );
});
tx();
```

---

## Plano de migração

### Fase 1 — Setup SQLite (1-2 dias)

- [ ] Criar `src/data/schema.sql` com schema + índices
- [ ] Criar `src/lib/db.ts` com singleton da conexão
- [ ] Criar `src/scripts/init-db.ts` (cria DB, roda schema, opcional: seed)
- [ ] Adicionar `src/data/analytics.db` ao `.gitignore`
- [ ] Criar script de dump `src/scripts/dump-supabase-to-sqlite.ts`:
  - Conecta Supabase com service_role
  - Lê todas as tabelas (sales_prod_daily_agg, sales_daily_agg, stores, products, filter_hierarchy, import_log)
  - Insere no SQLite via `bun:sqlite` (batch INSERT em transação)

### Fase 2 — Migração gradual das server functions (3-5 dias)

Ordem sugerida (da mais simples para a mais complexa):

- [ ] `getStores` — trivial
- [ ] `getImportedDates` / `getLatestSaleInfo` — trivial
- [ ] `getAreaFilterHierarchy` — médio
- [ ] `searchProducts` — médio
- [ ] `getFilterOptions` — médio (lógica de cascata em TS)
- [ ] `getDashboard` / `callMetrics` — complexo (3 agregações)
- [ ] `getDashboardRankings` — complexo (múltiplos níveis hierárquicos)
- [ ] `getProductAnalysis` — complexo (múltiplas queries)
- [ ] `getAreaAnalysis` — muito complexo (paginação, ordenação, FULL OUTER JOIN)

Cada server function:
1. Comentar a chamada `supabase.rpc()`
2. Escrever a lógica SQLite equivalente no handler
3. Verificar tipos de retorno (já existem, não mudam)
4. Rodar `bun run lint` + teste manual na UI

### Fase 3 — Upload pipeline (1-2 dias)

- [ ] `beginImport` — SQLite inserts
- [ ] `insertSalesChunk` — SQLite batch com transação
- [ ] `finalizeImport` — SQLite transação multi-step
- [ ] Remover dependência de `supabaseAdmin` do `upload.functions.ts`

### Fase 4 — Cleanup (1 dia)

- [ ] Remover `client.server.ts` se não for mais usado
- [ ] Verificar se `auth-middleware.ts` ainda precisa de `createClient` (sim, só para validar JWT)
- [ ] Remover importações não usadas
- [ ] Verificar que `bun run lint` passa limpo
- [ ] Testar fluxo completo: login → dashboard → filtros → área → produto → upload

---

## Riscos e considerações

| Risco | Mitigação |
|---|---|
| `bun:sqlite` é síncrono — queries bloqueiam o event loop | SQLite é rápido (microssegundos por query em 1.3M linhas indexadas); queries de analytics são leves |
| Concorrência durante import (admin importa enquanto usuários navegam) | SQLite WAL mode permite leitura concorrente com escrita; import é transação curta (<5s) |
| Perda de dados se o arquivo `.db` corromper | Backup diário via cron (`cp analytics.db analytics-$(date +%F).db`) |
| Deploy em serverless (Vercel/Netlify) sem disco persistente | Migrar para Turso/LibSQL (SQLite remoto gerenciado) — mesma API `bun:sqlite` |
| Busca textual em produtos sem índice trigram | `COLLATE NOCASE` + `LIKE` é suficiente para <50k produtos; se necessário, SQLite FTS5 |
| Perda de `jsonb_agg` | Retorno das server functions é montado em TS (JSON arrays), não no SQL |
| Migração dos dados existentes | Script único `dump-supabase-to-sqlite.ts` que lê do Supabase e escreve no SQLite |
