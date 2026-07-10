# Melhorias Pendentes

Consolidadas por criticidade e área. Baseado exclusivamente em análise do código real.

---

## 🔴 Alta Prioridade

### 1. Dark Mode não funcional
- `src/hooks/use-theme.ts` **não existe**
- `styles.css` não tem variáveis `.dark`
- **Afeta**: KpiCard (delta badge OKLCH hardcoded), ImportCalendar (cores emerald/amber), LastUpdateInfo (banner stale), todos os gráficos
- **Onde**: `src/styles.css`, `src/hooks/`, componentes com cores hardcoded
- **Impacto**: Experiência quebrada se dark mode for ativado

### 2. RPC `products_in_decline` sem UI
- RPC existe no banco e em `types.ts` — classifica produtos como crítico/alerta/atenção
- **Nenhuma página ou componente consome esses dados**
- **Onde**: Nova rota `/declinio` ou widget no dashboard
- **Impacto**: Baixo esforço, alto valor de negócio
- **Referência**: `04-novas-analises.md`

### 3. Dashboard: período anterior não exibido
- `getDashboard` retorna `data.previous.byDate` mas o gráfico de evolução só mostra o período atual
- **Onde**: `src/routes/_authenticated/index.tsx`
- **Impacto**: Funcionalidade já implementada no backend, só falta frontend

### 4. `assertAdmin` duplicado
- Cópia idêntica em `admin.functions.ts:6` e `upload.functions.ts:6`
- **Onde**: Extrair para `src/lib/admin-utils.ts` ou `safe-error.ts`
- **Impacto**: Manutenção propensa a divergência

### 5. Duplicação de lógica de rebuild de agregações
- `repairAggregations` em `admin.functions.ts` e fallback em `upload.functions.ts:finalizeImport`
- **Onde**: Extrair para função compartilhada
- **Impacto**: Duas implementações que podem divergir

---

## 🟡 Média Prioridade

### Dashboard
- **Unificar `getDashboard`**: hoje faz 2 chamadas RPC (atual + anterior). Poderia ser 1 RPC que retorna ambos
- **`placeholderData: keepPreviousData`**: evitar flash ao trocar filtros
- **Skeleton nos rankings**: pai não passa `isLoading=true` antes da 1ª query
- **Click-through**: rankings e top lojas deveriam navegar para `/area` ou `/produto`
- **Filtros ativos como chips**: exibir seleção atual acima do conteúdo
- **Exportar**: PDF (jsPDF já é dependência) e XLSX (SheetJS já é dependência)

### Produto
- **Multi-loja**: store selector permite apenas 1 loja ou "todas". Usar MultiSelect para comparar
- **`placeholderData: keepPreviousData`**: evitar flash ao trocar loja
- **Exportar tabela histórica**: CSV/XLSX
- **Histórico de buscas**: salvar últimos 5-10 produtos no localStorage
- **Linha de tendência**: média móvel 7/30 dias no gráfico de evolução

### Área
- **Componentizar**: 773 linhas é grande demais — extrair tabela sortável, paginação, PDF
- **`filteredHierarchy` chamado 2x**: linhas 138 e 156 com mesmos args — computação duplicada
- **PDF com colunas vazias**: "QTD" e "VALIDADE" sempre vazias — ocupam espaço
- **PDF com KPIs**: exportar também os cards de KPI, não só a tabela
- **Nome de arquivo descritivo**: incluir loja, departamento, período

### Upload
- **Web Worker para parse**: `parseAnyWorkbook` roda na main thread, congela UI em arquivos grandes
- **Validação de schema antecipada**: verificar colunas esperadas antes de processar tudo
- **Remover/reordenar arquivos**: permitir na fila antes de importar
- **Retry automático**: se chunk falhar, tentar novamente
- **Cancelar importação**: sem botão para cancelar processo em andamento
- **Log detalhado**: mostrar linhas rejeitadas, warnings

### Admin
- **Confirmação em ações destrutivas**: AlertDialog para desativar, mudar role, resetar senha
- **Loading inline no Switch**: feedback visual enquanto requisição não completa
- **Filtros na lista**: buscar por nome/email, filtrar por role/status
- **Paginação**: quando houver muitos usuários
- **Audit log**: registrar quem criou/alterou/desativou cada usuário

### Auth
- **Esqueci minha senha**: sem fluxo de recuperação
- **Auto-focus no email**: ao carregar a página
- **Rate limiting**: sem proteção contra brute force
- **Sessão expirada**: redirecionar para `/auth?next=/rota-atual`
- **Placeholder genérico**: mostra email real de pessoa (`uilton.leite@gpabr.com`) — risco de privacy

---

## 🟢 Baixa Prioridade

### Globais
- **Error boundaries por widget**: hoje um erro derruba a página inteira
- **`safeError` preservar stack trace**: usar `error.cause` para não perder a origem
- **Atalhos de teclado**: navegação entre páginas (1-Dashboard, 2-Produto, etc.)
- **Internacionalização**: algumas strings de erro do Supabase podem vir em inglês
- **ARIA labels**: vários botões de ação sem `aria-label` (MultiSelect, comparison pills, presets)
- **MultiSelect sem navegação por teclado**: apenas mouse/touch
- **AdminGate sem tratamento de erro**: erro de rede cai em "deny" permanentemente
- **`getServerConfig` morto**: função exportada mas nunca chamada
- **`parseWorkbook` alias morto**: poderia ser removido
- **`fmtBRL` em local errado**: exportado de `kpi-card.tsx` em vez de `utils.ts`
- **`LastUpdateInfo` ineficiente**: busca todas as datas importadas só para achar a mais recente
- **Nenhum teste**: unitários para utils (shiftPeriod, computePreset, parsers), integração para server functions
