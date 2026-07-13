# Plano: PHP API (Slim 4) + MariaDB

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Slim 4 (PSR-7/PSR-15) |
| Linguagem | PHP 8.3+ |
| Database | MariaDB 11+ |
| Server | PHP-FPM + Nginx (ou FrankenPHP) |
| Auth | API Key compartilhada frontend→API |
| HTTP Client (frontend) | `fetch()` nativo nas server functions |

---

## Arquitetura

```
                      ┌──────────────────────┐
                      │  Supabase Auth        │
                      │  (login, JWT token)   │
                      └──────────┬───────────┘
                                 │ valida token
                                 ▼
┌─────────────────────────────────────────────────┐
│           TanStack Start (Bun)                  │
│  Valida JWT → extrai userId + role              │
│  Chama PHP API com X-API-Key + headers de user  │
└───────────────────┬─────────────────────────────┘
                    │ HTTP (JSON)
                    ▼
┌─────────────────────────────────────────────────┐
│           PHP API (Slim 4)                      │
│  Middleware: valida API Key                      │
│  Middleware: CORS                                │
│  Controllers → Services → Repositories → MariaDB│
└───────────────────┬─────────────────────────────┘
                    │ SQL
                    ▼
┌─────────────────────────────────────────────────┐
│           MariaDB 11+                           │
│  sales_prod_daily_agg     (tabelão, ~523 MB)    │
│  sales_daily_agg          (dashboard, ~65 MB)   │
│  staging_sales / products / stores / import_log │
│  filter_hierarchy                               │
└─────────────────────────────────────────────────┘
```

---

## Estrutura do projeto PHP

```
php-api/
├── public/
│   └── index.php                    ← Entrypoint (Slim App)
├── src/
│   ├── Middleware/
│   │   ├── ApiKeyAuth.php           ← Valida X-API-Key
│   │   └── Cors.php                 ← CORS headers
│   ├── Controller/
│   │   ├── DashboardController.php  ← /api/dashboard/*
│   │   ├── FilterController.php     ← /api/filter-options
│   │   ├── ProductController.php    ← /api/products/*
│   │   ├── AreaController.php       ← /api/area/*
│   │   ├── ImportController.php     ← /api/import/*
│   │   └── StoreController.php      ← /api/stores
│   ├── Service/
│   │   ├── DashboardService.php     ← Lógica de métricas agregadas
│   │   ├── RankingService.php       ← Rankings hierárquicos
│   │   ├── AreaAnalysisService.php  ← Tabela paginada + sort
│   │   ├── ProductAnalysisService.php ← Análise de produto
│   │   ├── FilterService.php        ← Opções de filtro cascata
│   │   └── ImportService.php        ← Pipeline de importação
│   ├── Repository/
│   │   ├── SalesProdDailyAggRepository.php
│   │   ├── SalesDailyAggRepository.php
│   │   ├── ProductRepository.php
│   │   ├── StoreRepository.php
│   │   ├── ImportLogRepository.php
│   │   └── FilterHierarchyRepository.php
│   ├── DTO/
│   │   ├── DashboardMetrics.php
│   │   ├── DashboardRankings.php
│   │   ├── AreaAnalysisResult.php
│   │   ├── ProductAnalysisResult.php
│   │   └── FilterOptions.php
│   ├── Database/
│   │   └── ConnectionFactory.php    ← PDO singleton
│   └── Config/
│       └── Config.php               ← Env loader
├── config/
│   └── settings.php                 ← Slim settings
├── migrations/
│   ├── 001_create_stores.sql
│   ├── 002_create_products.sql
│   ├── 003_create_import_log.sql
│   ├── 004_create_staging_sales.sql
│   ├── 005_create_sales_daily_agg.sql
│   ├── 006_create_sales_prod_daily_agg.sql
│   └── 007_create_filter_hierarchy.sql
├── data/
│   └── seed.sql                     ← Dump inicial do Supabase (único)
├── .env.example
├── composer.json
├── Makefile
└── Dockerfile
```

---

## MariaDB Schema

```sql
-- stores
CREATE TABLE stores (
  store_code VARCHAR(10) NOT NULL PRIMARY KEY,
  store_name VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- products
CREATE TABLE products (
  prod_code VARCHAR(20) NOT NULL PRIMARY KEY,
  prod_name VARCHAR(300) NOT NULL,
  last_seen DATE DEFAULT NULL,
  FULLTEXT INDEX ft_products_name (prod_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- import_log
CREATE TABLE import_log (
  sale_date DATE NOT NULL PRIMARY KEY,
  row_count INT NOT NULL,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_by VARCHAR(36) DEFAULT NULL
) ENGINE=InnoDB;

-- staging_sales
CREATE TABLE staging_sales (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(36) NOT NULL,
  sale_date DATE NOT NULL,
  store_code VARCHAR(10) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  depto VARCHAR(100) DEFAULT NULL,
  secao VARCHAR(100) DEFAULT NULL,
  grupo VARCHAR(100) DEFAULT NULL,
  subgrupo VARCHAR(100) DEFAULT NULL,
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(300) NOT NULL,
  val_vda DECIMAL(15,2) NOT NULL,
  INDEX idx_ss_batch (batch_id),
  INDEX idx_ss_date (sale_date)
) ENGINE=InnoDB;

-- sales_daily_agg
CREATE TABLE sales_daily_agg (
  sale_date DATE NOT NULL,
  store_code VARCHAR(10) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  depto VARCHAR(100) DEFAULT NULL,
  secao VARCHAR(100) DEFAULT NULL,
  grupo VARCHAR(100) DEFAULT NULL,
  subgrupo VARCHAR(100) DEFAULT NULL,
  val_vda DECIMAL(15,2) NOT NULL DEFAULT 0,
  item_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, depto(50), secao(50), grupo(50), subgrupo(50)),
  INDEX idx_sda_date (sale_date),
  INDEX idx_sda_date_store (sale_date, store_code),
  INDEX idx_sda_hier (depto, secao, grupo, subgrupo)
) ENGINE=InnoDB;

-- sales_prod_daily_agg (tabela principal)
CREATE TABLE sales_prod_daily_agg (
  sale_date DATE NOT NULL,
  store_code VARCHAR(10) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  depto VARCHAR(100) DEFAULT NULL,
  secao VARCHAR(100) DEFAULT NULL,
  grupo VARCHAR(100) DEFAULT NULL,
  subgrupo VARCHAR(100) DEFAULT NULL,
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(300) NOT NULL,
  val_vda DECIMAL(15,2) NOT NULL DEFAULT 0,
  item_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, prod_code),
  INDEX idx_spda_date (sale_date),
  INDEX idx_spda_date_prod (sale_date, prod_code),
  INDEX idx_spda_date_store (sale_date, store_code),
  INDEX idx_spda_hier (depto, secao, grupo, subgrupo),
  INDEX idx_spda_prod (prod_code)
) ENGINE=InnoDB;

-- filter_hierarchy
CREATE TABLE filter_hierarchy (
  store_code VARCHAR(10) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  depto VARCHAR(100) DEFAULT NULL,
  secao VARCHAR(100) DEFAULT NULL,
  grupo VARCHAR(100) DEFAULT NULL,
  subgrupo VARCHAR(100) DEFAULT NULL,
  INDEX idx_fh_store (store_code),
  INDEX idx_fh_depto (depto),
  INDEX idx_fh_secao (secao),
  INDEX idx_fh_grupo (grupo),
  INDEX idx_fh_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## API Endpoints

| Método | Rota | Controller | Descrição |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| GET | `/api/stores` | `StoreController` | Lista lojas ordenadas por código |
| POST | `/api/filter-options` | `FilterController` | Opções de filtro cascata |
| POST | `/api/dashboard/metrics` | `DashboardController` | KPIs + top lojas + evolução |
| POST | `/api/dashboard/rankings` | `DashboardController` | Rankings por hierarquia |
| POST | `/api/products/search` | `ProductController` | Busca textual (≥3 chars) |
| POST | `/api/products/analysis` | `ProductController` | Análise completa de um produto |
| POST | `/api/area/analysis` | `AreaController` | Tabela paginada com filtros/sort |
| GET | `/api/area/hierarchy` | `AreaController` | Hierarquia para filtros |
| GET | `/api/import/dates` | `ImportController` | Datas importadas |
| POST | `/api/import/begin` | `ImportController` | Iniciar importação |
| POST | `/api/import/chunk` | `ImportController` | Inserir lote de linhas |
| POST | `/api/import/finalize` | `ImportController` | Finalizar importação |

---

## Autenticação (API Key)

A chave é configurada via variável de ambiente nos dois lados.

### Frontend (`.env`)
```env
API_PHP_URL="https://php-api.exemplo.com"
API_PHP_KEY="a3f8c9d1e2b4..."
```

### PHP API (`.env`)
```env
API_KEY="a3f8c9d1e2b4..."
```

### Fluxo da request

O frontend envia em toda requisição:
```
X-API-Key: a3f8c9d1e2b4...
X-User-Id: <uuid-do-usuario>
X-User-Role: admin|user
```

O middleware `ApiKeyAuth.php` verifica se `X-API-Key` bate com a configurada.
Os headers `X-User-Id` e `X-User-Role` são **confiados** (o frontend já validou via Supabase JWT)
— a API não valida autenticidade deles.

### ApiKeyAuth.php

```php
<?php
namespace App\Middleware;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response;

class ApiKeyAuth
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $key = $request->getHeaderLine('X-API-Key');

        if ($key !== Config::get('API_KEY')) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'error' => 'Unauthorized',
            ]));
            return $response
                ->withStatus(401)
                ->withHeader('Content-Type', 'application/json');
        }

        return $handler->handle($request);
    }
}
```

---

## Exemplo de controller: DashboardController

```php
<?php
namespace App\Controller;

use App\Service\DashboardService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DashboardController
{
    public function __construct(
        private DashboardService $service,
    ) {}

    public function metrics(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();

        $result = $this->service->metrics(
            dateFrom: $body['dateFrom'] ?? '',
            dateTo: $body['dateTo'] ?? '',
            stores: $body['stores'] ?? [],
            deptos: $body['deptos'] ?? [],
            secoes: $body['secoes'] ?? [],
            grupos: $body['grupos'] ?? [],
            subgrupos: $body['subgrupos'] ?? [],
        );

        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
```

---

## Exemplo de service: DashboardService

```php
<?php
namespace App\Service;

use App\Database\ConnectionFactory;
use App\DTO\DashboardMetrics;

class DashboardService
{
    public function metrics(
        string $dateFrom,
        string $dateTo,
        array $stores,
        array $deptos,
        array $secoes,
        array $grupos,
        array $subgrupos,
    ): DashboardMetrics {
        $pdo = ConnectionFactory::get();

        [$where, $params] = $this->buildWhere(
            $dateFrom, $dateTo,
            $stores, $deptos, $secoes, $grupos, $subgrupos,
        );

        // Total
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(val_vda), 0) AS v FROM sales_daily_agg {$where}"
        );
        $stmt->execute($params);
        $total = (float) $stmt->fetchColumn();

        // Por loja
        $stmt = $pdo->prepare(
            "SELECT store_code AS code, store_name AS name, SUM(val_vda) AS val
             FROM sales_daily_agg {$where}
             GROUP BY store_code, store_name
             ORDER BY val DESC"
        );
        $stmt->execute($params);
        $byStore = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        // Por departamento
        $stmt = $pdo->prepare(
            "SELECT depto AS name, SUM(val_vda) AS val
             FROM sales_daily_agg {$where}
             GROUP BY depto ORDER BY val DESC"
        );
        $stmt->execute($params);
        $byDepto = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        // Por data
        $stmt = $pdo->prepare(
            "SELECT sale_date AS date, SUM(val_vda) AS val
             FROM sales_daily_agg {$where}
             GROUP BY sale_date ORDER BY sale_date"
        );
        $stmt->execute($params);
        $byDate = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return new DashboardMetrics(
            total: $total,
            byStore: $byStore,
            byDepto: $byDepto,
            byDate: $byDate,
        );
    }

    private function buildWhere(
        string $dateFrom, string $dateTo,
        array $stores, array $deptos,
        array $secoes, array $grupos,
        array $subgrupos,
    ): array {
        $conds = [];
        $params = [];

        $conds[] = 'sale_date BETWEEN ? AND ?';
        $params[] = $dateFrom;
        $params[] = $dateTo;

        if ($stores) {
            $placeholders = implode(',', array_fill(0, count($stores), '?'));
            $conds[] = "store_code IN ({$placeholders})";
            $params = array_merge($params, $stores);
        }
        if ($deptos) {
            $placeholders = implode(',', array_fill(0, count($deptos), '?'));
            $conds[] = "depto IN ({$placeholders})";
            $params = array_merge($params, $deptos);
        }
        if ($secoes) {
            $placeholders = implode(',', array_fill(0, count($secoes), '?'));
            $conds[] = "secao IN ({$placeholders})";
            $params = array_merge($params, $secoes);
        }
        if ($grupos) {
            $placeholders = implode(',', array_fill(0, count($grupos), '?'));
            $conds[] = "grupo IN ({$placeholders})";
            $params = array_merge($params, $grupos);
        }
        if ($subgrupos) {
            $placeholders = implode(',', array_fill(0, count($subgrupos), '?'));
            $conds[] = "subgrupo IN ({$placeholders})";
            $params = array_merge($params, $subgrupos);
        }

        return ['WHERE ' . implode(' AND ', $conds), $params];
    }
}
```

---

## Exemplo de service: ImportService

```php
<?php
namespace App\Service;

use App\Database\ConnectionFactory;

class ImportService
{
    public function begin(string $saleDate, string $batchId, array $stores, array $products): void
    {
        $pdo = ConnectionFactory::get();
        $pdo->beginTransaction();
        try {
            // 1. Limpa staging anterior para esta data
            $pdo->prepare("DELETE FROM staging_sales WHERE sale_date = ?")
               ->execute([$saleDate]);

            // 2. Upsert stores
            $stmt = $pdo->prepare(
                "INSERT INTO stores (store_code, store_name)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)"
            );
            foreach ($stores as $s) {
                $stmt->execute([$s['store_code'], $s['store_name']]);
            }

            // 3. Upsert products
            $stmt = $pdo->prepare(
                "INSERT INTO products (prod_code, prod_name, last_seen)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE prod_name = VALUES(prod_name), last_seen = VALUES(last_seen)"
            );
            foreach ($products as $p) {
                $stmt->execute([$p['prod_code'], $p['prod_name'], $saleDate]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public function insertChunk(array $rows): int
    {
        $pdo = ConnectionFactory::get();
        $stmt = $pdo->prepare(
            "INSERT INTO staging_sales
             (batch_id, sale_date, store_code, store_name,
              depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $count = 0;
        foreach ($rows as $r) {
            $stmt->execute([
                $r['batch_id'], $r['sale_date'],
                $r['store_code'], $r['store_name'],
                $r['depto'] ?? null, $r['secao'] ?? null,
                $r['grupo'] ?? null, $r['subgrupo'] ?? null,
                $r['prod_code'], $r['prod_name'], $r['val_vda'],
            ]);
            $count++;
        }
        return $count;
    }

    public function finalize(string $batchId, string $saleDate, int $rowCount, string $importedBy): void
    {
        $pdo = ConnectionFactory::get();
        $pdo->beginTransaction();
        try {
            // 1. Deleta aggs antigas para esta data
            $pdo->prepare("DELETE FROM sales_daily_agg WHERE sale_date = ?")
               ->execute([$saleDate]);
            $pdo->prepare("DELETE FROM sales_prod_daily_agg WHERE sale_date = ?")
               ->execute([$saleDate]);

            // 2. Popula sales_daily_agg
            $pdo->prepare("
                INSERT INTO sales_daily_agg
                    (sale_date, store_code, store_name,
                     depto, secao, grupo, subgrupo,
                     val_vda, item_count)
                SELECT sale_date, store_code, store_name,
                       depto, secao, grupo, subgrupo,
                       SUM(val_vda), COUNT(*)
                FROM staging_sales
                WHERE sale_date = ? AND batch_id = ?
                GROUP BY sale_date, store_code, store_name,
                         depto, secao, grupo, subgrupo
            ")->execute([$saleDate, $batchId]);

            // 3. Popula sales_prod_daily_agg
            $pdo->prepare("
                INSERT INTO sales_prod_daily_agg
                    (sale_date, store_code, store_name,
                     depto, secao, grupo, subgrupo,
                     prod_code, prod_name,
                     val_vda, item_count)
                SELECT sale_date, store_code, store_name,
                       depto, secao, grupo, subgrupo,
                       prod_code, prod_name,
                       SUM(val_vda), COUNT(*)
                FROM staging_sales
                WHERE sale_date = ? AND batch_id = ?
                GROUP BY sale_date, store_code, store_name,
                         depto, secao, grupo, subgrupo,
                         prod_code, prod_name
            ")->execute([$saleDate, $batchId]);

            // 4. Atualiza filter_hierarchy
            $pdo->prepare("
                DELETE FROM filter_hierarchy
                WHERE store_code IN (
                    SELECT DISTINCT store_code
                    FROM staging_sales
                    WHERE sale_date = ?
                )
            ")->execute([$saleDate]);
            $pdo->prepare("
                INSERT IGNORE INTO filter_hierarchy
                    (store_code, store_name, depto, secao, grupo, subgrupo)
                SELECT DISTINCT store_code, store_name,
                       depto, secao, grupo, subgrupo
                FROM staging_sales
                WHERE sale_date = ?
            ")->execute([$saleDate]);

            // 5. Limpa staging
            $pdo->prepare("DELETE FROM staging_sales WHERE sale_date = ?")
               ->execute([$saleDate]);

            // 6. Registra log
            $pdo->prepare("
                INSERT INTO import_log (sale_date, row_count, imported_at, imported_by)
                VALUES (?, ?, NOW(), ?)
                ON DUPLICATE KEY UPDATE
                    row_count = VALUES(row_count),
                    imported_at = NOW(),
                    imported_by = VALUES(imported_by)
            ")->execute([$saleDate, $rowCount, $importedBy]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
```

---

## Como o frontend consome a API

Cada server function em `src/lib/analytics.functions.ts` troca `supabase.rpc(...)` por `fetch(...)`.

### Exemplo: getFilterOptions

```typescript
export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(/* ... */)
  .handler(async ({ data, context }): Promise<FilterOptionsResult> => {
    const apiUrl = process.env.API_PHP_URL!;
    const apiKey = process.env.API_PHP_KEY!;

    const res = await fetch(`${apiUrl}/api/filter-options`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-User-Id": context.userId,
        "X-User-Role": (context.claims as any)?.role ?? "user",
      },
      body: JSON.stringify({
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        stores: data.stores,
        deptos: data.deptos,
        secoes: data.secoes,
        grupos: data.grupos,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw safeError("getFilterOptions", err);
    }

    return res.json();
  });
```

### Exemplo: getStores

```typescript
export const getStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreOption[]> => {
    const apiUrl = process.env.API_PHP_URL!;
    const apiKey = process.env.API_PHP_KEY!;

    const res = await fetch(`${apiUrl}/api/stores`, {
      headers: {
        "X-API-Key": apiKey,
        "X-User-Id": context.userId,
        "X-User-Role": (context.claims as any)?.role ?? "user",
      },
    });

    if (!res.ok) throw safeError("getStores", "API error");

    return res.json();
  });
```

### Novas variáveis de ambiente

```env
# .env
API_PHP_URL="https://php-api.exemplo.com"
API_PHP_KEY="a3f8c9d1e2b4..."
```

---

## Routing (Slim 4)

```php
<?php
// config/routes.php

use App\Controller\{
    StoreController,
    FilterController,
    DashboardController,
    ProductController,
    AreaController,
    ImportController,
};

return function (Slim\App $app) {
    $api = $app->group('/api', function (Slim\Routing\RouteCollectorProxy $api) {
        $api->get('/health', function ($req, $res) {
            $res->getBody()->write(json_encode(['status' => 'ok']));
            return $res->withHeader('Content-Type', 'application/json');
        });

        // Stores
        $api->get('/stores', [StoreController::class, 'list']);

        // Filters
        $api->post('/filter-options', [FilterController::class, 'options']);

        // Dashboard
        $api->post('/dashboard/metrics', [DashboardController::class, 'metrics']);
        $api->post('/dashboard/rankings', [DashboardController::class, 'rankings']);

        // Products
        $api->post('/products/search', [ProductController::class, 'search']);
        $api->post('/products/analysis', [ProductController::class, 'analysis']);

        // Area
        $api->post('/area/analysis', [AreaController::class, 'analysis']);
        $api->get('/area/hierarchy', [AreaController::class, 'hierarchy']);

        // Import
        $api->get('/import/dates', [ImportController::class, 'dates']);
        $api->post('/import/begin', [ImportController::class, 'begin']);
        $api->post('/import/chunk', [ImportController::class, 'chunk']);
        $api->post('/import/finalize', [ImportController::class, 'finalize']);
    })->add(new App\Middleware\ApiKeyAuth())
      ->add(new App\Middleware\Cors());
};
```

---

## Entrypoint (index.php)

```php
<?php
// public/index.php

use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();
$app->addErrorMiddleware(true, true, true);

require __DIR__ . '/../config/routes.php';

$app->run();
```

---

## DTOs (readonly, PHP 8.3)

```php
<?php
// src/DTO/DashboardMetrics.php

namespace App\DTO;

readonly class DashboardMetrics
{
    public function __construct(
        public float  $total,
        public array  $byStore,   // CodeNameVal[]
        public array  $byDepto,   // NameVal[]
        public array  $byDate,    // DateVal[]
    ) {}
}
```

```php
<?php
// src/DTO/FilterOptions.php

namespace App\DTO;

readonly class FilterOptions
{
    public function __construct(
        public ?string $latestDate,
        public array   $stores,
        public array   $deptos,
        public array   $secoes,
        public array   $grupos,
        public array   $subgrupos,
        public array   $availableDates,
    ) {}
}
```

---

## Script de migração dos dados existentes

Para popular o MariaDB com os dados atuais do Supabase:

```php
<?php
// data/seed-from-supabase.php

// 1. Conecta no Supabase (service_role)
// 2. Para cada tabela, faz SELECT * e insere no MariaDB
// 3. Tabelas: stores, products, import_log,
//    sales_daily_agg, sales_prod_daily_agg, filter_hierarchy

$supabaseUrl = getenv('SUPABASE_URL');
$serviceKey = getenv('SUPABASE_SERVICE_ROLE_KEY');
$pdo = new PDO(getenv('DB_DSN'), getenv('DB_USER'), getenv('DB_PASS'));

$tables = [
    'stores', 'products', 'import_log',
    'sales_daily_agg', 'sales_prod_daily_agg', 'filter_hierarchy',
];

foreach ($tables as $table) {
    echo "Migrando {$table}...\n";

    $json = file_get_contents("{$supabaseUrl}/rest/v1/{$table}?select=*", false,
        stream_context_create(['http' => [
            'header' => "Authorization: Bearer {$serviceKey}\r\napikey: {$serviceKey}\r\n",
        ]])
    );
    $rows = json_decode($json, true);
    if (empty($rows)) continue;

    // Gera colunas
    $cols = implode(', ', array_keys($rows[0]));
    $placeholders = ':' . implode(', :', array_keys($rows[0]));

    $stmt = $pdo->prepare("INSERT INTO {$table} ({$cols}) VALUES ({$placeholders})");

    $pdo->beginTransaction();
    foreach ($rows as $r) {
        $stmt->execute($r);
    }
    $pdo->commit();

    echo "  {$table}: " . count($rows) . " linhas\n";
}
```

---

## Deploy

### Opção A: Servidor único (mais barato)

Tudo em um VPS DigitalOcean $12/mo (2 GB RAM, 2 vCPU, 50 GB SSD):

```
Nginx (proxy reverso)
├── /api/*  → PHP-FPM (unix socket)
├── /*      → Bun (porta 3000)
└── localhost:3306 → MariaDB
```

Nginx config:
```nginx
server {
    listen 80;
    server_name benchgpa.app;

    location /api/ {
        proxy_pass http://unix:/var/run/php/php8.3-fpm.sock;
        include proxy_params;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### Opção B: Serviços separados

| Componente | Infra | Custo |
|---|---|---|
| PHP API | DigitalOcean App Platform | $12/mo |
| MariaDB | DigitalOcean Managed DB (1 GB, 10 GB) | $15/mo |
| Frontend | Vercel (free) ou DO mesmo VPS | $0-12/mo |
| **Total** | | **~$27/mo** |

### Docker Compose (Opção C)

```yaml
services:
  mariadb:
    image: mariadb:11
    volumes:
      - db_data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PW}
      MYSQL_DATABASE: benchgpa

  php-api:
    build: ./php-api
    depends_on:
      - mariadb
    environment:
      DB_HOST: mariadb
      DB_PORT: 3306
      DB_NAME: benchgpa
      DB_USER: root
      DB_PASS: ${DB_ROOT_PW}
      API_KEY: ${API_PHP_KEY}

  frontend:
    build: .
    depends_on:
      - php-api
    ports:
      - "80:3000"
    environment:
      API_PHP_URL: "http://php-api:8080"
      API_PHP_KEY: ${API_PHP_KEY}
      SUPABASE_URL: ${VITE_SUPABASE_URL}
      SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}

volumes:
  db_data:
```

---

## Plano de execução

### Fase 1 — Setup (1 dia)

- [ ] Criar repositório `benchgpa-api`
- [ ] `composer init` com `slim/slim:^4`, `slim/psr7`, `php-di/slim-bridge`
- [ ] Estrutura de diretórios (Controllers, Services, Repositories, DTO)
- [ ] `public/index.php` + `config/routes.php`
- [ ] Middleware `ApiKeyAuth` + `Cors`
- [ ] `Database/ConnectionFactory.php` + `Config/Config.php`
- [ ] `migrations/` — arquivos SQL do schema
- [ ] Script `migrate.php` que executa os .sql em ordem
- [ ] Dockerfile + docker-compose.yaml

### Fase 2 — Endpoints analíticos (3-4 dias)

- [ ] `GET /api/stores` — trivial
- [ ] `GET /api/health` — trivial
- [ ] `POST /api/filter-options` — cascata com buildWhere dinâmico
- [ ] `POST /api/dashboard/metrics` — 3 agregações
- [ ] `POST /api/dashboard/rankings` — 5 agregações hierárquicas
- [ ] `POST /api/products/search` — FULLTEXT + LIKE fallback
- [ ] `POST /api/products/analysis` — mais complexa, múltiplas queries
- [ ] `POST /api/area/analysis` — paginação + sort + search
- [ ] `GET /api/area/hierarchy` — simples
- [ ] `GET /api/import/dates` — simples

### Fase 3 — Import pipeline (1-2 dias)

- [ ] `POST /api/import/begin`
- [ ] `POST /api/import/chunk`
- [ ] `POST /api/import/finalize` — transação multi-step

### Fase 4 — Integração frontend (2-3 dias)

- [ ] Adicionar `API_PHP_URL` + `API_PHP_KEY` ao `.env`
- [ ] Converter `getStores` — trocar `supabase.from("stores")` por `fetch()`
- [ ] Converter `getFilterOptions`
- [ ] Converter `getDashboard` (+ `callMetrics`)
- [ ] Converter `getDashboardRankings`
- [ ] Converter `searchProducts`
- [ ] Converter `getProductAnalysis`
- [ ] Converter `getAreaAnalysis`
- [ ] Converter `getAreaFilterHierarchy`
- [ ] Converter `getImportedDates` / `getLatestSaleInfo`
- [ ] Converter `beginImport` / `insertSalesChunk` / `finalizeImport`
- [ ] Rodar `bun run lint` + testar fluxo completo

### Fase 5 — Seed + Go live (1 dia)

- [ ] Rodar `data/seed-from-supabase.php` para migrar dados existentes
- [ ] Configurar Nginx reverso (se VPS único)
- [ ] Configurar variáveis de ambiente em produção
- [ ] Testar: login → dashboard → filtros → área → produto → upload
- [ ] Monitorar logs (Slim error middleware)

---

## Diferenças do PostgreSQL para MariaDB

| PostgreSQL | MariaDB | Observação |
|---|---|---|
| `jsonb_agg(obj ORDER BY col)` | Montar array no PHP | MariaDB não tem `jsonb_agg` |
| `ARRAY[...]` / `= ANY(...)` | `IN (?,?,?)` com placeholders dinâmicos | Gerar `?` no PHP |
| `ILIKE '%termo%'` | `LOWER(col) LIKE LOWER('%termo%')` | MariaDB LIKE é case-insensitive se collation for `utf8mb4_unicode_ci` |
| `FULL OUTER JOIN` | `LEFT JOIN` + `UNION` + `LEFT JOIN` | Simular com 2 queries |
| `NULLS LAST` | Padrão ANSI | MariaDB já coloca NULL por último em DESC |
| `DATE + integer` | `DATE_ADD(date, INTERVAL n DAY)` | Sintaxe diferente |
| `GIN trigram` | `FULLTEXT` | MariaDB FULLTEXT é suficiente |
| `jsonb_build_object(...)` | `JSON_OBJECT(...)` | MariaDB 11+ suporta |
| `CREATE OR REPLACE FUNCTION` | Procedures | Funções não escaláveis, lógica vai pro PHP |

---

## Comparação com SQLite

| Aspecto | SQLite (bun:sqlite) | PHP + MariaDB |
|---|---|---|
| **Custo** | Zero | $12-27/mo |
| **Latência** | 0 ms (local) | ~5-20 ms (HTTP) |
| **Complexidade** | Baixa (1 service) | Média (2 services, deploy separado) |
| **Manutenção** | Mínima | PHP deployment, MariaDB tuning |
| **Concorrência** | WAL mode (boa) | Multiprocesso nativo ✅ |
| **Serverless** | ❌ (precisa Turso) | ✅ (API separada) |
| **Backup** | `cp .db` | `mysqldump` |
| **Escalabilidade** | Vertical | Horizontal (read replicas) |
| **Fulltext search** | LIKE NOCASE | FULLTEXT index ✅ |
| **Tamanho max** | Ilimitado (disco) | 10 GB no plano mínimo DO |

---

## Apêndice: Supabase Zero (migrar Auth + Admin)

Eliminar 100% do Supabase — Auth e toda lógica de usuários vão para a PHP API.
A aplicação inteira roda sem depender de serviços externos.

### O que muda

| Componente | Hoje (Supabase) | Depois (PHP API) |
|---|---|---|
| Login / senha | `supabase.auth.signInWithPassword()` | `POST /api/auth/login` |
| JWT | Supabase gera e valida | PHP gera (`firebase/php-jwt`) |
| Validação token (serverFn) | `auth-middleware.ts` → Supabase `getClaims()` | Bun + `jsonwebtoken` com mesmo `JWT_SECRET` |
| Cadastro de usuário | `supabaseAdmin.auth.admin.createUser()` | `POST /api/admin/users` |
| Reset senha | `supabaseAdmin.auth.admin.updateUserById()` | `PUT /api/admin/users/:id/password` |
| Tabela `auth.users` | Gerenciada pelo Supabase | Vai para MariaDB |
| RPC `has_role` | PostgreSQL function | Query direta no PHP |

### Schema adicional no MariaDB

```sql
-- users (substitui auth.users + public.users do Supabase)
CREATE TABLE users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Novos endpoints de Auth

| Método | Rota | Controller | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | `AuthController` | Login email+senha → JWT |
| POST | `/api/auth/logout` | `AuthController` | (stateless, só descarta token no client) |
| GET | `/api/auth/me` | `AuthController` | Dados do usuário atual (via token) |
| PUT | `/api/auth/password` | `AuthController` | Trocar própria senha |
| GET | `/api/admin/users` | `AdminController` | Listar usuários |
| POST | `/api/admin/users` | `AdminController` | Criar usuário |
| PUT | `/api/admin/users/{id}` | `AdminController` | Editar role/ativo |
| PUT | `/api/admin/users/{id}/password` | `AdminController` | Resetar senha de outro usuário |

### Fluxo de Login

```
Cliente (Browser)           Bun (serverFn)              PHP API
      │                          │                        │
      │ POST /api/auth/login     │                        │
      │ email+senha ────────────►│ POST /api/auth/login   │
      │                          │ email+senha ──────────►│
      │                          │                        ├─ SELECT * FROM users WHERE email=?
      │                          │                        ├─ password_verify(senha, hash)
      │                          │                        ├─ Gera JWT (firebase/php-jwt)
      │                          │    { jwt, user }       │
      │                          │◄───────────────────────│
      │    { jwt, user }         │                        │
      │◄─────────────────────────│                        │
      │ Guarda JWT em memória    │                        │
      │ (ou httpOnly cookie)     │                        │
```

### JWT

```env
# Compartilhado entre Bun + PHP
JWT_SECRET="base64:kX7m...long-random-secret..."
JWT_EXPIRY="24h"
```

**Payload do JWT:**
```json
{
  "sub": "uuid-do-usuario",
  "email": "user@gpabr.com",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700086400
}
```

### PHP: AuthController (login)

```php
<?php
namespace App\Controller;

use App\Database\ConnectionFactory;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    public function login(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        $email = $body['email'] ?? '';
        $password = $body['password'] ?? '';

        if (!$email || !$password) {
            return $this->json($response, ['error' => 'Email e senha obrigatórios'], 400);
        }

        $pdo = ConnectionFactory::get();
        $stmt = $pdo->prepare(
            "SELECT id, email, name, password_hash, role, is_active
             FROM users WHERE email = ?"
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            return $this->json($response, ['error' => 'Email ou senha inválidos'], 401);
        }

        if (!$user['is_active']) {
            return $this->json($response, ['error' => 'Conta desativada'], 403);
        }

        $now = time();
        $payload = [
            'sub'   => $user['id'],
            'email' => $user['email'],
            'name'  => $user['name'],
            'role'  => $user['role'],
            'iat'   => $now,
            'exp'   => $now + 86400, // 24h
        ];

        $jwt = JWT::encode($payload, Config::get('JWT_SECRET'), 'HS256');

        return $this->json($response, [
            'token' => $jwt,
            'user'  => [
                'id'       => $user['id'],
                'email'    => $user['email'],
                'name'     => $user['name'],
                'role'     => $user['role'],
                'isActive' => (bool) $user['is_active'],
            ],
        ]);
    }

    public function me(Request $request, Response $response): Response
    {
        // Token já validado pelo middleware JwtAuth
        $claims = $request->getAttribute('jwt_claims');

        $pdo = ConnectionFactory::get();
        $stmt = $pdo->prepare(
            "SELECT id, email, name, role, is_active, created_at
             FROM users WHERE id = ?"
        );
        $stmt->execute([$claims->sub]);
        $user = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$user) {
            return $this->json($response, ['error' => 'Usuário não encontrado'], 404);
        }

        return $this->json($response, ['user' => [
            'id'        => $user['id'],
            'email'     => $user['email'],
            'name'      => $user['name'],
            'role'      => $user['role'],
            'isActive'  => (bool) $user['is_active'],
            'createdAt' => $user['created_at'],
        ]]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json');
    }
}
```

### PHP: JwtAuth middleware

```php
<?php
namespace App\Middleware;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response;

class JwtAuth
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $header = $request->getHeaderLine('Authorization');

        if (!str_starts_with($header, 'Bearer ')) {
            $response = new Response();
            $response->getBody()->write(json_encode(['error' => 'Token não fornecido']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }

        $token = substr($header, 7);

        try {
            $decoded = JWT::decode($token, new Key(Config::get('JWT_SECRET'), 'HS256'));
            $request = $request->withAttribute('jwt_claims', $decoded);
            $request = $request->withAttribute('user_id', $decoded->sub);
            $request = $request->withAttribute('user_role', $decoded->role);
            return $handler->handle($request);
        } catch (\Throwable $e) {
            $response = new Response();
            $response->getBody()->write(json_encode(['error' => 'Token inválido ou expirado']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }
    }
}
```

### PHP: AdminController

```php
<?php
namespace App\Controller;

use App\Database\ConnectionFactory;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AdminController
{
    // GET /api/admin/users
    public function list(Request $request, Response $response): Response
    {
        $pdo = ConnectionFactory::get();
        $stmt = $pdo->query(
            "SELECT id, email, name, role, is_active, created_at
             FROM users ORDER BY created_at DESC"
        );
        $users = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode(
            array_map(fn($u) => [
                'id'        => $u['id'],
                'email'     => $u['email'],
                'name'      => $u['name'],
                'role'      => $u['role'],
                'isActive'  => (bool) $u['is_active'],
                'createdAt' => $u['created_at'],
            ], $users)
        ));
        return $response->withHeader('Content-Type', 'application/json');
    }

    // POST /api/admin/users
    public function create(Request $request, Response $response): Response
    {
        $body = $request->getParsedBody();
        $email = strtolower(trim($body['email'] ?? ''));
        $name  = trim($body['name'] ?? '');
        $password = $body['password'] ?? '';
        $role  = $body['role'] ?? 'user';

        // Validações...
        if (!preg_match('/^[a-z0-9._-]+@gpabr\.com$/', $email)) {
            return $this->json($response, ['error' => 'Email deve ser @gpabr.com'], 400);
        }
        if (strlen($password) < 8) {
            return $this->json($response, ['error' => 'Senha deve ter 8+ caracteres'], 400);
        }

        $pdo = ConnectionFactory::get();
        $id = $body['id'] ?? bin2hex(random_bytes(16));
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        try {
            $stmt = $pdo->prepare(
                "INSERT INTO users (id, email, name, password_hash, role, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)"
            );
            $stmt->execute([$id, $email, $name, $hash, $role]);
        } catch (\PDOException $e) {
            if ($e->getCode() == 23000) {
                return $this->json($response, ['error' => 'Email já cadastrado'], 409);
            }
            throw $e;
        }

        return $this->json($response, ['id' => $id], 201);
    }

    // PUT /api/admin/users/{id}
    public function update(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $body = $request->getParsedBody();

        $sets = [];
        $params = [];
        if (isset($body['role'])) {
            $sets[] = 'role = ?';
            $params[] = $body['role'];
        }
        if (isset($body['is_active'])) {
            $sets[] = 'is_active = ?';
            $params[] = $body['is_active'] ? 1 : 0;
        }
        if (empty($sets)) {
            return $this->json($response, ['error' => 'Nada para atualizar'], 400);
        }

        $params[] = $id;
        $pdo = ConnectionFactory::get();
        $pdo->prepare(
            "UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?"
        )->execute($params);

        return $this->json($response, ['ok' => true]);
    }

    // PUT /api/admin/users/{id}/password
    public function resetPassword(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $body = $request->getParsedBody();
        $password = $body['password'] ?? '';

        if (strlen($password) < 8) {
            return $this->json($response, ['error' => 'Senha deve ter 8+ caracteres'], 400);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $pdo = ConnectionFactory::get();
        $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
           ->execute([$hash, $id]);

        return $this->json($response, ['ok' => true]);
    }

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json');
    }
}
```

### Routing dos novos endpoints

```php
// Adicionar ao config/routes.php

use App\Controller\AuthController;
use App\Controller\AdminController;
use App\Middleware\JwtAuth;

// Auth (públicos — sem ApiKeyAuth)
$app->post('/api/auth/login', [AuthController::class, 'login']);

// Auth (autenticados)
$app->group('/api/auth', function (Slim\Routing\RouteCollectorProxy $api) {
    $api->get('/me', [AuthController::class, 'me']);
    $api->put('/password', [AuthController::class, 'changePassword']);
})->add(new JwtAuth());

// Admin (JwtAuth + role check)
$app->group('/api/admin', function (Slim\Routing\RouteCollectorProxy $api) {
    $api->get('/users', [AdminController::class, 'list']);
    $api->post('/users', [AdminController::class, 'create']);
    $api->put('/users/{id}', [AdminController::class, 'update']);
    $api->put('/users/{id}/password', [AdminController::class, 'resetPassword']);
})->add(new \App\Middleware\RequireAdmin())
  ->add(new JwtAuth());
```

### Como o frontend muda

#### 1. Login (`src/routes/auth.tsx`)

**Antes:**
```tsx
const { data, error } = await supabase.auth.signInWithPassword({
  email, password,
});
```

**Depois:**
```tsx
const res = await fetch(`${apiUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { token, user } = await res.json();
// Guarda token (ex: localStorage ou context)
localStorage.setItem("auth_token", token);
```

#### 2. `auth-attacher.ts`

**Antes:** Anexa token do Supabase às serverFn
**Depois:** Anexa token do PHP JWT (mesmo header `Authorization: Bearer ...`)

```typescript
// Quase igual — só muda de onde lê o token
const token = localStorage.getItem("auth_token");
// ou: const { data: session } = await supabase.auth.getSession();
```

#### 3. `auth-middleware.ts` (Bun server-side)

**Antes:** Valida JWT no Supabase via `supabase.auth.getClaims(token)`
**Depois:** Valida JWT localmente com o segredo compartilhado

```typescript
import jwt from "jsonwebtoken";

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const token = // ... extrai do header Authorization

    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

    return next({
      context: {
        supabase: null,  // não precisa mais
        userId: decoded.sub,
        claims: decoded,
      },
    });
  },
);
```

> Dependência: `npm install jsonwebtoken @types/jsonwebtoken`

#### 4. `admin.functions.ts`

Todas as chamadas a `supabaseAdmin.from("users")` e `supabaseAdmin.auth.admin.*` viram `fetch()` para a PHP API com token JWT de admin.

### Migração dos usuários existentes

Script único para migrar `auth.users` + `public.users` do Supabase para MariaDB:

```php
<?php
// data/migrate-users.php

$supabaseUrl = getenv('SUPABASE_URL');
$serviceKey = getenv('SUPABASE_SERVICE_ROLE_KEY');
$pdo = new PDO(getenv('DB_DSN'), getenv('DB_USER'), getenv('DB_PASS'));

// 1. Busca auth.users via Admin API
$json = file_get_contents("{$supabaseUrl}/auth/v1/admin/users", false,
    stream_context_create(['http' => [
        'header' => "Authorization: Bearer {$serviceKey}\r\napikey: {$serviceKey}\r\n",
    ]])
);
$supaUsers = json_decode($json, true)['users'] ?? [];

// 2. Busca public.users
$json2 = file_get_contents("{$supabaseUrl}/rest/v1/users?select=*", false,
    stream_context_create(['http' => [
        'header' => "Authorization: Bearer {$serviceKey}\r\napikey: {$serviceKey}\r\n",
    ]])
);
$pubUsers = json_decode($json2, true) ?? [];
$pubIndex = [];
foreach ($pubUsers as $u) $pubIndex[$u['id']] = $u;

// 3. Para cada auth.user, cria no MariaDB com password_hash dummy
//    (senha original é hash do Supabase — não recuperável)
//    Usuários precisam redefinir senha via "Esqueci minha senha"
//    ou admin define nova senha.
$stmt = $pdo->prepare(
    "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         role = VALUES(role),
         is_active = VALUES(is_active)"
);

foreach ($supaUsers as $au) {
    $pub = $pubIndex[$au['id']] ?? [];
    $stmt->execute([
        $au['id'],
        $au['email'],
        $pub['name'] ?? $au['email'],
        // Hash dummy — usuário precisa resetar senha
        password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT),
        $pub['role'] ?? 'user',
        $pub['is_active'] ?? true,
        $au['created_at'],
    ]);
}
```

### Custo final (sem Supabase)

| Componente | Custo |
|---|---|
| VPS (2 GB, 2 vCPU, 50 GB SSD) | $12/mo |
| MariaDB (embutido no VPS) | $0 |
| **Total** | **$12/mo** |
| vs. antes (Supabase free + DO) | $12/mo (igual) |
| **Economia vs. plano pago Supabase Pro** | **$13/mo** ($25 Pro → $12 VPS) |

### Linha do tempo adicional

Adicionar às fases existentes:

**Fase 0 — Auth (2-3 dias, antes da Fase 1)**
- [ ] Tabela `users` no MariaDB + migration
- [ ] `POST /api/auth/login` — JWT com `firebase/php-jwt`
- [ ] `GET /api/auth/me` — dados do usuário
- [ ] Middleware `JwtAuth` (PHP)
- [ ] Middleware `RequireAdmin` (PHP)
- [ ] `PUT /api/auth/password`
- [ ] `GET/POST /api/admin/users`
- [ ] `PUT /api/admin/users/{id}`
- [ ] `PUT /api/admin/users/{id}/password`
- [ ] Atualizar `auth-middleware.ts` (Bun) para validar JWT local com `jsonwebtoken`
- [ ] Atualizar `auth-attacher.ts` para ler token do localStorage
- [ ] Atualizar `src/routes/auth.tsx` — login via PHP em vez de Supabase
- [ ] Atualizar `admin.functions.ts` — chamar PHP em vez de Supabase Admin
- [ ] Remover `admin-utils.ts:assertAdmin` → validar role no PHP
- [ ] Script `data/migrate-users.php`
- [ ] Rodar script para migrar usuários existentes
- [ ] Testar: login → admin → CRUD usuários

### Checklist final: tudo que sai do Supabase

| Item | Saiu? |
|---|---|
| Auth (login, JWT) | ✅ PHP |
| `auth.users` | ✅ MariaDB |
| `public.users` | ✅ MariaDB |
| `stores` | ✅ MariaDB |
| `products` | ✅ MariaDB |
| `import_log` | ✅ MariaDB |
| `staging_sales` | ✅ MariaDB |
| `sales_daily_agg` | ✅ MariaDB |
| `sales_prod_daily_agg` | ✅ MariaDB |
| `filter_hierarchy` | ✅ MariaDB |
| `dashboard_metrics` RPC | ✅ PHP Service |
| `dashboard_rankings` RPC | ✅ PHP Service |
| `filter_options` RPC | ✅ PHP Service |
| `product_analysis` RPC | ✅ PHP Service |
| `product_search` RPC | ✅ PHP Service |
| `area_analysis` RPC | ✅ PHP Service |
| `area_filter_hierarchy` RPC | ✅ PHP Service |
| `imported_dates` RPC | ✅ PHP Service |
| `finalize_import` RPC | ✅ PHP Service |
| `upsert_products_bulk` RPC | ✅ PHP Service |
| `has_role` RPC | ✅ PHP Query |
| `is_active_user` check | ✅ PHP Query |
| Supabase client libraries | ❌ Removido |
| `client.ts` | ❌ Removido |
| `client.server.ts` | ❌ Removido |
| `auth-middleware.ts` (validação Supabase) | ❌ Rewrite para `jsonwebtoken` |
| `auth-attacher.ts` (anexar token) | ❌ Rewrite para ler token local |
