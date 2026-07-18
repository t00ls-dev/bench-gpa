# Melhorias Pendentes

Consolidadas por criticidade e área. Atualizado pós-migração Supabase → MariaDB.

---

## 🔴 Alta Prioridade

### 1. Dark Mode inativo (código pronto, mas não ativado)
- `.dark` CSS existe em `styles.css`, mas usuário não pode alternar (tema travado em light)
- **Afeta**: KpiCard, ImportCalendar, LastUpdateInfo ainda com cores hardcoded que podem quebrar em dark
- **Onde**: Falta ativar toggle, ajustar hardcoded colors
- **Impacto**: Experiência incompleta (dark mode não disponível)
- **Nota**: `.dark` block adicionado como preparação; reativar toggle é o passo restante

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

### 6. `.env` versionado com `SUPABASE_SERVICE_ROLE_KEY`
- Chave com permissão total no banco exposta no repositório
- **Resolvido na migração**: ao remover Supabase, a chave deixa de existir
- **Temporário**: enquanto não migra, manter como está (decisão do usuário)

---

## 🟡 Média Prioridade

### Dashboard
- **Unificar `getDashboard`**: hoje faz 2 chamadas RPC (atual + anterior). Poderia ser 1 RPC que retorna ambos
- **`placeholderData: keepPreviousData`**: evitar flash ao trocar filtros
- **Skeleton nos rankings**: pai não passa `isLoading=true` antes da 1ª query
- **Click-through**: rankings e top lojas deveriam navegar para `/area` ou `/produto`
- **Filtros ativos como chips**: exibir seleção atual acima do conteúdo
- **Exportar XLSX**: PDF já implementado, falta XLSX (SheetJS já é dependência)

### Produto
- **Multi-loja**: store selector permite apenas 1 loja ou "todas". Usar MultiSelect para comparar
- **`placeholderData: keepPreviousData`**: evitar flash ao trocar loja
- **Exportar tabela histórica**: XLSX (PDF já implementado)
- **Histórico de buscas**: salvar últimos 5-10 produtos no localStorage
- **Linha de tendência**: média móvel 7/30 dias no gráfico de evolução

### Área
- **`filteredHierarchy` chamado 2x**: computação duplicada
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

### Auth (pós-migração)
- **Esqueci minha senha**: sem fluxo de recuperação — implementar endpoint `PUT /api/auth/forgot-password`
- **Rate limiting**: já implementado (tier Auth: 5/min IP, 20/min global), ajustar para JWT
- **Sessão expirada**: redirecionar para `/auth?next=/rota-atual`
- **Cookie HttpOnly**: garantir que JWT seja armazenado com `Secure; SameSite=Lax`

---

## 🟢 Baixa Prioridade

### Globais
- **Error boundaries por widget**: hoje um erro derruba a página inteira
- **`safeError` preservar stack trace**: usar `error.cause` para não perder a origem
- **Internacionalização**: algumas strings de erro do Supabase podem vir em inglês
- **ARIA labels**: vários botões de ação sem `aria-label` (MultiSelect, comparison pills, presets)
- **MultiSelect sem navegação por teclado**: apenas mouse/touch
- **AdminGate sem tratamento de erro**: erro de rede cai em "deny" permanentemente
- **`getServerConfig` morto**: função exportada mas nunca chamada
- **`parseWorkbook` alias morto**: poderia ser removido
- **`fmtBRL` em local errado**: exportado de `kpi-card.tsx` em vez de `utils.ts`
- **`LastUpdateInfo` ineficiente**: busca todas as datas importadas só para achar a mais recente
- **Nenhum teste**: unitários para utils (shiftPeriod, computePreset, parsers), integração para server functions

### Migração
- **Remover `@supabase/supabase-js`** do `package.json` após migração completa
- **Remover `src/integrations/supabase/`** — diretório inteiro
- **Remover `client.ts` + `client.server.ts`** — não serão mais necessários
- **Atualizar `auth-middleware.ts`** para validar JWT local com `jsonwebtoken`
- **Atualizar `auth-attacher.ts`** para ler token do cookie/localStorage
- **Configurar Nginx** no VPS com template `node-ssr`