# Discrepâncias entre Documentação e Implementação

Gaps encontrados entre o que está documentado (AGENTS.md, docs antigos) e o código real.

---

## AGENTS.md vs Código

| Item | Documentado | Real | Gravidade |
|---|---|---|---|
| `src/hooks/use-theme.ts` | Existe (toggle light/dark) | **Arquivo não existe** | 🔴 ALTA |
| Dark mode | "script inline anti-flash no SSR shell" | `styles.css` **não tem variáveis `.dark`**; hook não existe | 🔴 ALTA |
| Env var name | `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_PUBLISHABLE_KEY` em `client.ts` | 🟡 MÉDIA |
| "Product filtering client-side" (área) | "busca tudo e filtra/ordena/pagina no cliente" | **Já é server-side** (paginação, sorting, search) | 🟡 MÉDIA (desatualizado) |
| RPC `products_in_decline` | Não mencionado | Existe no banco e types.ts, **sem UI** | 🟡 MÉDIA |
| `staging_sales` tabela | Não listada em "Tabelas Principais" | Existe e é usada no pipeline de import | 🟡 MÉDIA |
| `auth-attacher.ts` | Descrito como middleware | Confirmado, registrado em `start.ts` | ✅ OK |
| `error-capture.ts` / h3 detection | Não mencionado | Implementado e referenciado por `server.ts` | ✅ OK (não documentado) |
| `assertAdmin` | Mencionado como proteção server-side | Duplicado em 2 arquivos | 🟡 MÉDIA |

---

## Docs Antigos (`docs/improvements/` versão anterior) vs Realidade

### `otimizacao-carga.md`
- **#1 + #3: Paginação server-side na área** — documentado como crítico a implementar, mas **já está implementado** (RPC `area_analysis` com overloads paginados)
- **#2: Otimização `product_analysis`** — já implementado (60 dias, CTE consolidada)
- **#4: Hierarquia unificada** — já implementado (`getAreaFilterHierarchy` + cascata cliente)
- **#5: Dashboard chamada única** — ainda não implementado (faz 2 chamadas RPC)

### `global.md`
- `staleTime: 5min` para filter options — código usa `10 * 60_000` (10min)
- `use-theme.ts` mencionado como existente — não existe
- "ImportCalendar com cores hardcoded" — ainda verdadeiro

### `dashboard.md`
- Skeleton nos rankings: o problema não é no `RankingCard` (que trata skeleton corretamente), é no **pai** que não passa `isLoading=true` antes da primeira query

---

## Inconsistências Internas no Código

| Onde | Problema |
|---|---|
| `kpi-card.tsx` exporta `fmtBRL` | `ranking-card.tsx` importa de `kpi-card` em vez de `utils.ts` |
| `safeError` | Não preserva `error.cause` — stack trace original perdido |
| `repairAggregations` (admin) vs fallback em `finalizeImport` (upload) | Lógica de rebuild de agregações duplicada |
| `assertAdmin` | Cópia idêntica em `admin.functions.ts:6` e `upload.functions.ts:6` |
| `parseWorkbook` | É um alias de `parseAnyWorkbook` sem razão de existir |
| `getServerConfig` em `config.server.ts` | Só retorna `nodeEnv` e **não é usado em lugar nenhum** |
| `FilterBar` re-clampa datas | Efeito colateral silencioso, sem notificação ao usuário |
| `LastUpdateInfo` busca todas as datas | Só precisa da mais recente — RPC poderia expor endpoint dedicado |
