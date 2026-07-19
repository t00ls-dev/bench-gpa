# Issues de Performance

> ⚠️ Todas as issues abaixo são **independentes da migração** — continuam válidas com MariaDB.
> A migração de RPCs PostgreSQL para queries MariaDB pode alterar a latência (ver notas).

---

## 🔴 Críticas

### Dashboard: 3 chamadas server function independentes

- `getDashboard` (2 RPCs internas), `getDashboardRankings`, `getFilterOptions`
- `getDashboard` já faz 2 chamadas RPC (`dashboard_metrics` para atual + anterior). Poderia ser 1 RPC que retorna ambos
- **Ganha**: ~1 round-trip de rede (∼50-150ms) + 1 parse de resposta
- **Migração**: ao converter para MariaDB, unificar em 1 stored procedure ou query

### `LastUpdateInfo` busca dados demais

- Chama `getImportedDates` que retorna **todas as datas importadas**
- Só precisa da mais recente (`latestDate`)
- **Ganha**: Endpoint dedicado `latest_import_date` reduz payload de centenas de datas para 1 registro
- **Migração**: criar query simples `SELECT MAX(sale_date) FROM import_log`

### Parse de XLSX na main thread

- `parseAnyWorkbook` roda no mesmo thread da UI
- Arquivos grandes (>10MB) congelam a tela por segundos
- **Ganha**: Web Worker descongela a UI durante import
- **Independente de backend**: mesma solução para Supabase ou MariaDB

---

## 🟡 Médias

### `filteredHierarchy` chamado 2x (ainda presente)

- Em `area.page.tsx` a função é chamada 2x com mesmos args
- **Ganha**: 1 execução a menos por render

### `gcTime` e `staleTime` sem política global

- `router.tsx` define default `staleTime: 60s`, `gcTime: 10min`
- `FilterBar` sobrescreve com `staleTime: 10min`, `gcTime: 30min`
- Outras queries usam valores variados
- **Ganha**: Definir `defaultStaleTime: 30s` no QueryClient, sobrescrever só quando necessário

### Duas sorts para achar o mais recente

- `LastUpdateInfo` faz `.sort()` duas vezes — para `latestSale` e `latestImport`
- **Ganha**: `reduce()` em O(n) em vez de O(2n log n)

### `dashboard_metrics` chamado duas vezes

- `getDashboard` chama `dashboard_metrics` para período atual e anterior (sequencial)
- **Ganha**: Unificar em 1 RPC que aceita ambos os períodos
- **Migração**: stored procedure MariaDB com ambos períodos em 1 chamada

---

## 🟢 Baixas

### `findSalesDate` varre todas as linhas

- Em `xlsx-parser.ts`, busca o marcador `DTA_VENDA` em cada célula de cada linha
- Poderia limitar às primeiras 10 linhas (o marcador está sempre no topo)
- **Ganha**: parse um pouco mais rápido

### `todayIso()` sem injeção

- `LastUpdateInfo` e `ImportCalendar` usam `new Date()` real
- **Ganha**: Aceitar `now` como prop permitiria testes e consistência

### Query keys não compartilhadas entre páginas

- Dashboard e Area chamam `getFilterOptions` com cache keys diferentes
- **Ganha**: Prefixo comum permitiria compartilhar cache entre páginas

### Componentes grandes sem memo

- `area.tsx` (773 linhas) com 8+ `useState` — re-renderiza inteiro a cada estado
- `produto.tsx` (349), `upload.tsx` (380), `admin.tsx` (432)
- **Ganha**: Extrair sub-componentes com `React.memo` onde apropriado

---

## Performance pós-migração (MariaDB)

| Hoje (Supabase RPC)                    | Amanhã (MariaDB)                   | Impacto esperado                             |
| -------------------------------------- | ---------------------------------- | -------------------------------------------- |
| RPC POST via REST (~50-150ms)          | Query direta via mysql2/PDO        | ✅ **-10 a 50ms** (sem HTTP overhead)        |
| Conexão TLS para nuvem                 | Localhost (se DB no mesmo VPS)     | ✅ **-5 a 20ms** (sem latência de rede)      |
| PostgreSQL `jsonb_agg` + `ORDER BY`    | Montar array no PHP                | ⚠️ **+10 a 30ms** (serialização extra)       |
| Índices GIN para busca textual         | `LOWER(col) LIKE LOWER('%termo%')` | ⚠️ **+20 a 100ms** (full scan em vez de GIN) |
| Pool de conexões gerenciado (Supabase) | mysql2 pool (Bun) ou PDO (PHP)     | ✅ **mesma performance**                     |
