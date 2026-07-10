# Observações Arquiteturais

---

## Duplicações de Código

| O quê | Onde | Problema |
|---|---|---|
| `assertAdmin` | `admin.functions.ts:6-10` e `upload.functions.ts:6-10` | Cópia exata. Extrair para shared util |
| Rebuild agregações | `admin.functions.ts:repairAggregations` e `upload.functions.ts:finalizeImport` (fallback manual) | Mesma lógica de iterar datas, deletar, reinserir |
| `fmtBRL` | `kpi-card.tsx` exporta, `ranking-card.tsx` importa de lá | Deveria estar em `lib/utils.ts` |
| `parseWorkbook` | `xlsx-parser.ts:125-127` — alias para `parseAnyWorkbook` | Morto, remover |
| `getServerConfig` | `config.server.ts` — função que só retorna `nodeEnv` | **Nunca é chamada** em lugar nenhum |

---

## Padrões e Boas Práticas

### ✅ Bem feitos
- **Dynamic import** de `supabaseAdmin` em todas as admin functions — evita bundle client-side da service role key
- **Atomic swap** no pipeline de import (staging → finalize_import RPC) — previne dados corrompidos
- **Defense-in-depth** em admin routes: `beforeLoad` + `<AdminGate>` + `assertAdmin` server-side
- **Defensive parsing** em `analytics.functions.ts` (`asRecord`/`asArray`/`num()`/`str()`) — tolerante a null inesperado
- **Proxy lazy singleton** em ambos clients Supabase — evita init até o primeiro uso
- **Security headers** em `server.ts`: CSP, X-Frame-Options, nosniff, Referrer-Policy
- **Zod validation** em todas as server functions — inputs sanitizados antes de chegar ao banco

### ❌ Problemas
- **`safeError` não preserva stack trace original**: usa `new Error(msg)` sem `error.cause`. Dificulta debug
- **Admin auto-disable**: server-side tem proteção, mas frontend não dá feedback visual — usuário só descobre quando o server rejeita
- **`safeError` inconsistente**: `analytics.functions.ts` nunca usa o 3º argumento (custom message), `upload.functions.ts` sempre usa
- **Nenhum teste** no projeto — unitários, integração ou e2e
- **Componentes muito grandes**: `area.tsx` (773 linhas), `produto.tsx` (349), `upload.tsx` (380), `admin.tsx` (432) — todos poderiam ser decompostos
- **Estados de loading inconsistentes**: mistura `isLoading` e `isFetching` sem padrão claro entre páginas
- **`gcTime` e `staleTime` variados**: `30 * 60_000` em alguns lugares, `5 * 60_000` em outros, default em outros. Sem política global

---

## Segurança

### OK
- CSP com `frame-ancestors 'none'` (anti-clickjacking)
- `X-Frame-Options: DENY` (fallback legacy)
- Token JWT validado em toda server function via `requireSupabaseAuth`
- Admin functions validam role antes de qualquer operação
- `safeError` não vaza detalhes internos para o cliente
- `sanitizeNext()` na auth previne open redirect

### Ausente / Frágil
- **Rate limiting**: nenhuma proteção contra brute force no login
- **CSRF**: além do que Supabase PKCE provê, não há proteção adicional
- **Sessão em localStorage**: vulnerável a XSS (padrão da indústria, mas relevante)
- **Token blacklisting**: sem mecanismo de revogação de sessão
- **AdminGate sem fallback de erro de rede**: se a RPC `has_role` falhar (timeout), o usuário vê "Acesso restrito" permanentemente

---

## Observações de Design

### Filtro cascata com re-clamping silencioso
O `FilterBar` tem um `useEffect` que re-clampa o date range se ele cair fora de `availableDates` após mudança de filtros pai. Isso é bom, mas **silencioso** — o usuário não é notificado que o período foi ajustado.

### Comparação de períodos
Os presets de comparação (`prev_period`, `prev_week`, `prev_month`) são passados para o RPC `dashboard_metrics` que calcula o shift. A lógica `shiftPeriod` em `analytics.functions.ts` lida com comprimentos diferentes (se o período atual tem 7 dias, o anterior também tem 7). Bom design.

### `placeholderData` disponível apenas em uma rota
Apenas `area.tsx` usa `placeholderData: (prev) => prev`. Dashboard, produto e upload não usam — então qualquer mudança de filtro causa flash de loading.
