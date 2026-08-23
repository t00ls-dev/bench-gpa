# Auditoria completa de UI/UX, 19/08/2026

## Escopo e método

Auditoria realizada sobre o commit `e612acb`, sem alterar a interface ou o
comportamento da aplicação.

O trabalho combinou:

- inspeção de todas as 12 páginas e dos componentes visuais compartilhados;
- revisão dos fluxos de autenticação, navegação, análise, importação,
  administração e documentação;
- revisão de estados de carregamento, atualização, vazio, erro e sucesso;
- revisão estática de semântica, foco, teclado, ARIA, contraste, responsividade,
  persistência de estado e performance percebida;
- execução local com MariaDB e dados sintéticos, sem alterar produção;
- navegação automatizada por 38 estados em 1440 x 900, 768 x 1024 e
  390 x 844;
- abertura e inspeção de drawer mobile, diálogo administrativo,
  calendário, filtros, tabelas e telas públicas.

Os scripts temporários, servidor local e dados sintéticos foram removidos ao
final. As conclusões abaixo se baseiam no código e no comportamento observado,
não em preferência visual isolada.

### Escala usada

| Prioridade | Critério |
|---|---|
| Crítico | Risco de segurança grave, perda de dados ou bloqueio essencial |
| Alto | Pode induzir decisão errada, quebrar tarefa central ou excluir usuários |
| Médio | Prejudica eficiência, clareza, acessibilidade ou uso em parte relevante dos casos |
| Baixo | Incômodo localizado, inconsistência menor ou melhoria preventiva |

| Esforço | Estimativa |
|---|---|
| Pequeno | Até 1 dia |
| Médio | 1 a 3 dias |
| Grande | Mais de 3 dias |

## Resumo executivo

A interface atual é funcional, sóbria e coerente com uma ferramenta interna de
análise operacional. A navegação principal é previsível, as rotas são carregadas
separadamente, os filtros em cascata evitam combinações inválidas e as tabelas
mais volumosas já usam paginação e virtualização. Não há justificativa para uma
reescrita visual ou troca do sistema de componentes.

Os principais problemas não são de aparência. Eles se concentram em quatro
áreas:

1. **Integridade do contexto exibido:** Produto, Área e Previsão podem manter
   dados da seleção anterior sob filtros ou identificação novos. As exportações
   de Área e Previsão podem combinar conteúdo antigo e metadados novos.
2. **Fluxos operacionais:** a importação pode ser abandonada ao navegar, a
   confirmação em lote não identifica cada substituição e a área anuncia drag
   and drop sem implementá-lo.
3. **Acessibilidade:** rankings, pesquisa de produto, tabelas virtualizadas,
   tabs, calendário e vários estados assíncronos não oferecem semântica ou
   operação equivalente por teclado e leitor de tela. Alguns tokens de estado
   falham em contraste WCAG AA.
4. **Performance percebida:** busca de Área consulta o servidor a cada tecla,
   skeletons não preservam o layout final, PDF pode bloquear a thread principal
   com dezenas de milhares de produtos e o multiselect não escala para listas
   grandes.

Não foi identificado problema crítico puramente visual. Foi identificado um
risco crítico de segurança no fluxo de primeiro acesso, registrado em seção
separada porque sua correção muda autenticação e exige decisão explícita.

## Diagnóstico geral

### Hierarquia e densidade

Os títulos, descrições, filtros, KPIs e resultados seguem uma ordem clara. A
densidade é adequada para desktop e não deve ser reduzida apenas para deixar a
tela mais vazia. A repetição de `kpi-card` em métricas, filtros, tabelas, erros,
dropzone, ajuda e rodapé, porém, faz superfícies com funções diferentes terem a
mesma hierarquia. Foram encontradas 58 ocorrências do padrão.

O hover com elevação aplicado globalmente a `kpi-card` também sugere
interatividade em blocos que não respondem a clique. Isso é uma oportunidade de
refino, não um bloqueio funcional.

### Desktop

O desktop aproveita bem a largura máxima de 1400 px, mantém navegação lateral
estável e organiza filtros e rankings sem excesso de etapas. As maiores falhas
estão na sinalização de atualização e na possibilidade de interagir ou exportar
dados antigos durante uma troca de contexto.

### Tablet

Em 768 px a aplicação já troca para sidebar desktop. O conteúdo permanece
utilizável, mas perde muita largura útil para filtros e tabelas. A tela de
administração depende de rolagem horizontal para alcançar colunas e ações. O
breakpoint não é tecnicamente inválido, mas a experiência em tablet retrato é
mais próxima de desktop comprimido do que de um layout próprio.

### Smartphone

A barra inferior oferece as quatro tarefas analíticas principais e o drawer
concentra ações administrativas, o que é adequado. Filtros empilhados continuam
operáveis, tabelas largas têm rolagem interna e o conteúdo reserva espaço para a
barra inferior.

Os problemas específicos são alvos de toque pequenos no calendário e em botões
de fechar, diálogos sem limite de altura para teclado virtual, tabelas
administrativas que escondem ações fora da primeira área visível e falta de
safe area inferior em PWA.

### Aparência e consistência

A aparência é profissional e não depende de gradientes, badges ou animações
decorativas em excesso. O ponto mais genérico é a composição quase universal
por cards brancos arredondados com sombra. Isso reduz a distinção entre
controle, conteúdo principal, aviso e metadado técnico.

As stacks `Plus Jakarta Sans`, `Inter` e `JetBrains Mono` são declaradas, mas não
há fontes carregadas. Na prática, títulos e corpo normalmente usam fontes do
sistema. Isso não prejudica a tarefa e não justifica adicionar dependência
externa sem avaliar CSP e peso.

## Achado transversal crítico

### C-01. Primeiro acesso usa apenas um identificador como prova de identidade

**Classificação:** problema objetivo de segurança descoberto durante a revisão
do fluxo. Não é uma correção apenas de UI/UX.

**Evidência:** `src/routes/first-access.page.tsx:77-128` e
`src/lib/auth-api.ts:213-305` permitem definir a senha inicial informando somente
usuário ou matrícula, além do Turnstile. O comentário no backend registra isso
como decisão de produto. Um plano anterior exigia usuário e matrícula juntos em
`docs/plano-refatoracao-auth-username-matricula-2026-08-05.md:74-84`.

**Impacto:** quem conhecer um identificador pode assumir uma conta com senha
nula. Rate limit e Turnstile limitam automação, mas não comprovam identidade.

**Recomendação:** abrir decisão específica de segurança antes de qualquer
implementação. A solução mais forte é token de ativação único e expirável. Uma
alternativa menor é exigir dois dados independentes. Não alterar silenciosamente
o fluxo atual porque isso envolve auth, banco e operação de cadastro.

**Prioridade:** crítico. **Esforço:** grande. **Risco de regressão:** alto.

## Problemas de prioridade alta

### H-01. Dados anteriores permanecem sob uma identificação nova

**Classificação:** problema objetivo de integridade da informação.

**Evidência:**

- `src/routes/_authenticated/product.page.tsx:100-113,237-251` usa
  `placeholderData` ao trocar produto ou lojas. O chip já mostra o produto novo,
  enquanto KPIs e gráficos ainda podem pertencer ao anterior.
- `src/routes/_authenticated/forecast.page.tsx:69-114` mantém a previsão
  anterior ao trocar loja, data ou hierarquia. O PDF usa os dados antigos com
  `storeLabel` e `targetDate` novos.
- `src/hooks/use-area-products-view.ts:203-240` mantém resultados anteriores.
  `src/hooks/use-area-pdf-export.ts:59-79` busca a lista nova, mas pode receber
  KPIs antigos da página.

**Impacto:** o usuário pode ler ou exportar números atribuídos ao produto, loja,
data ou hierarquia errados.

**Recomendação:** reaproveitar dados anteriores apenas em paginação ou ordenação
do mesmo contexto. Em mudança de entidade ou filtro estrutural, bloquear
interação e exportação até a resposta correspondente à chave atual. Dados e
metadados do PDF devem vir da mesma resposta confirmada.

**Esforço:** pequeno a médio. **Risco:** baixo.

### H-02. Drill-down de rankings pode abrir uma hierarquia diferente

**Classificação:** problema objetivo de navegação e correção analítica.

**Evidência:** `src/routes/_authenticated/index.page.tsx:58-89` resolve o
departamento com o primeiro item cujo nome de seção, grupo ou subgrupo coincide.
Os rankings agregam por nome, portanto nomes repetidos em caminhos distintos
podem ser somados e depois direcionados ao primeiro caminho encontrado.

**Impacto:** o valor clicado e a tela de destino podem representar conjuntos
diferentes.

**Recomendação:** preservar o caminho hierárquico no contrato do ranking ou
detectar ambiguidades e pedir escolha, sem selecionar silenciosamente o primeiro
resultado.

**Esforço:** médio. **Risco:** médio, pois toca contrato e procedure.

### H-03. Navegar durante importação abandona o fluxo

**Classificação:** problema objetivo de prevenção de acidente.

**Evidência:** `src/routes/_authenticated/upload.page.tsx:94-100,260-287` não
possui bloqueio do roteador nem aviso de `beforeunload` enquanto
`processing.busy` está ativo.

**Impacto:** sidebar, atalhos, voltar, recarregar ou fechar a aba deixam staging
e lease ativos até expirar. O operador pode bloquear novas importações sem
entender o motivo.

**Recomendação:** confirmar navegação, cancelar a lease antes da navegação
interna e usar `beforeunload` como última barreira para fechamento ou recarga.

**Esforço:** médio. **Risco:** médio.

### H-04. Confirmação de lote não identifica substituições e duplicatas

**Classificação:** problema objetivo de prevenção de ação destrutiva.

**Evidência:** `src/routes/_authenticated/upload.page.tsx:290-294,387-431`
reduz todas as datas a um booleano `hasExistingData`. Em lote misto, não informa
quais datas serão substituídas e não impede duas planilhas da mesma data.

**Impacto:** dados existentes podem ser substituídos sem identificação clara. Em
duplicata, o último arquivo processado prevalece.

**Recomendação:** agrupar por data, tratar duplicatas antes da execução e listar
cada arquivo como novo ou substituição. Usar ação destrutiva quando aplicável.

**Esforço:** médio. **Risco:** baixo.

### H-05. Falhas de consulta parecem zero ou ausência de dados

**Classificação:** problema objetivo de feedback e confiança.

**Evidência:** Dashboard e Produto não tratam `isError` em
`src/routes/_authenticated/index.page.tsx:95-152` e
`src/routes/_authenticated/product.page.tsx:64-113,206-263`. A administração
mostra o erro no cabeçalho e também “Nenhum usuário cadastrado” em
`src/routes/_authenticated/admin.index.page.tsx:22-40,76`.

**Impacto:** indisponibilidade pode ser interpretada como venda zero, produto sem
histórico ou ausência de usuários.

**Recomendação:** estados de erro exclusivos, com nova tentativa, sem renderizar
zero ou vazio quando a consulta falhou.

**Esforço:** médio. **Risco:** baixo.

### H-06. Rankings clicáveis não funcionam por teclado

**Classificação:** problema objetivo de acessibilidade.

**Evidência:** `src/components/ranking-card.tsx:33-50` aplica `onClick` ao
`<tr>`, sem link, botão, `tabIndex` ou teclado.

**Impacto:** usuários de teclado não conseguem executar o principal drill-down
do Dashboard.

**Recomendação:** colocar link real na célula principal e manter a linha como
área visual, sem transformar toda a estrutura tabular em botão improvisado.

**Esforço:** pequeno. **Risco:** baixo.

### H-07. Busca de produto não implementa um combobox acessível

**Classificação:** problema objetivo de acessibilidade e produtividade.

**Evidência:** `src/components/product-search.tsx:38-120` não oferece
`combobox`, `listbox`, `aria-activedescendant`, setas, Enter ou Escape. Busca
vazia também não produz mensagem.

**Impacto:** o fluxo principal de Produto exige várias tabulações e não comunica
relação, quantidade ou seleção a leitores de tela.

**Recomendação:** implementar o padrão WAI-ARIA de combobox, preservando debounce
e seleção controlada.

**Esforço:** médio. **Risco:** médio.

### H-08. Tabelas virtualizadas não expõem estrutura tabular

**Classificação:** problema objetivo de acessibilidade.

**Evidência:** `src/components/area-table.tsx:201-279` e
`src/components/production-table.tsx:224-307` usam `div` para cabeçalhos,
linhas e células sem os papéis tabulares completos.

**Impacto:** leitores de tela não recebem relação confiável entre produto,
coluna e valor.

**Recomendação:** usar tabela compatível com virtualização ou os papéis
`table`, `rowgroup`, `row`, `columnheader` e `cell`, incluindo índices e
contagens.

**Esforço:** médio. **Risco:** médio.

### H-09. Busca da Área consulta a procedure a cada tecla

**Classificação:** problema objetivo de performance percebida e capacidade.

**Evidência:** `src/components/area-table.tsx:140-158` atualiza `search`
diretamente, e `src/hooks/use-area-products-view.ts:203-240` inclui esse valor na
query sem debounce.

**Impacto:** digitação gera várias chamadas caras, mantém a tabela em atualização
e aumenta concorrência no MariaDB.

**Recomendação:** separar texto digitado e valor consultado com debounce de 250 a
500 ms. Resetar página imediatamente, mas consultar somente o valor estabilizado.

**Esforço:** pequeno. **Risco:** baixo.

### H-10. PDF pode bloquear a thread principal com até 50 mil produtos

**Classificação:** problema objetivo de responsividade da aplicação.

**Evidência:** `src/hooks/use-area-pdf-export.ts:59-190` monta matriz, mede e
trunca células e gera blob no main thread. O limite do schema chega a 50 mil
produtos. `src/hooks/use-production-pdf-export.ts:47-141` usa o mesmo modelo.

**Impacto:** interface congelada, spinner parado e risco de encerramento da aba,
principalmente em mobile.

**Recomendação:** medir volumes reais antes da escolha. Preferir worker ou
geração no servidor. Como mitigação imediata, impor limite operacional explícito
e oferecer formato alternativo para conjuntos maiores.

**Esforço:** grande. **Risco:** médio.

### H-11. Cores semânticas não atingem contraste AA em usos de texto

**Classificação:** problema objetivo de acessibilidade.

**Evidência:** tokens em `src/styles.css:63-87,127-151` ficam aproximadamente
entre 1,9:1 e 4,4:1 em vários pares de warning, success, destructive e primary.
São usados em texto pequeno em componentes administrativos, calendário e avisos.

**Impacto:** estados operacionais e de segurança podem ser difíceis de ler,
especialmente no tema escuro.

**Recomendação:** separar tokens de superfície e tokens de texto, validando cada
par em claro e escuro para mínimo 4,5:1.

**Esforço:** pequeno a médio. **Risco:** baixo.

### H-12. Dropzone anuncia uma interação inexistente

**Classificação:** problema objetivo de expectativa e prevenção de perda de
contexto.

**Evidência:** `src/components/upload-dropzone.tsx:53-75` diz “Arraste arquivos”,
mas não há handlers de drop ou prevenção do comportamento padrão.

**Impacto:** soltar a planilha pode abrir o arquivo no navegador e tirar o
operador da aplicação.

**Recomendação:** implementar drop real com a mesma validação do input ou remover
a instrução de arrastar.

**Esforço:** pequeno. **Risco:** baixo.

## Problemas de prioridade média

| ID | Problema objetivo e evidência | Impacto | Recomendação | Esforço | Risco |
|---|---|---|---|---|---|
| M-01 | Labels de filtros não se associam aos controles. `filter-field.tsx:13-17`, `multi-select.tsx:178-185` | Leitores de tela ouvem “Todos” ou “Selecione” sem saber o campo | Usar ids e `aria-labelledby`, separando nome e placeholder | Pequeno | Baixo |
| M-02 | Loading, progresso e conclusão não usam `aria-busy`, `role=status` ou `aria-live`. Botões substituem texto por spinner | Operações sensíveis ficam silenciosas e botões perdem nome | Preservar texto, anunciar estados e tornar a barra uma progressbar | Médio | Baixo |
| M-03 | Tabs de Upload e Administração são botões comuns. `upload.page.tsx:307-328`, `admin.index.page.tsx:43-74` | Estado e relação com painel não são comunicados | Usar Radix Tabs ou padrão ARIA completo | Pequeno | Baixo |
| M-04 | Calendário usa `role=grid` incompleto e dias de 21 x 21 px. `import-calendar.tsx:90-129` | Semântica inválida e alvos menores que WCAG 2.2 | Completar grid, nomes de dias e `aria-selected`; ampliar alvo | Médio | Baixo |
| M-05 | Existem dois landmarks `<main>`. `sidebar.tsx:314-327`, `_authenticated/route.tsx:279-302` | Leitores de tela recebem landmarks principais ambíguos | Manter um único main com `id=main-content` | Pequeno | Baixo |
| M-06 | Diálogos administrativos não usam form, cancelam autofocus e têm close em inglês e 16 px. `create-user-dialog.tsx`, `edit-user-identifiers-dialog.tsx`, `ui/dialog.tsx` | Enter não envia, foco inicial ruim e alvo pequeno | Form com submit, foco deliberado, descrição e close “Fechar” com área 32 px | Médio | Baixo |
| M-07 | Drawer mobile não possui título próprio. `mobile-nav.tsx:85-152` | É anunciado genericamente como diálogo | Adicionar `DrawerTitle`, visível ou `sr-only` | Pequeno | Baixo |
| M-08 | Diálogos não limitam altura útil nem reservam margem lateral. `ui/dialog.tsx`, `ui/alert-dialog.tsx` | Teclado virtual pode esconder campos e ações | `max-height` com `100dvh`, rolagem interna e margem segura | Pequeno | Baixo |
| M-09 | Movimento ignora `prefers-reduced-motion`. `styles.css:206-217,347-354` e overlays | Pessoas sensíveis não conseguem reduzir pulse, spin, slide e view transition | Regra global de redução e utilitários `motion-reduce` | Pequeno | Baixo |
| M-10 | Skeletons não correspondem ao layout final no Dashboard e Produto | Cards e conteúdo mudam de altura; ranking antigo recebe skeleton extra | Skeleton estrutural equivalente; com dados anteriores, usar overlay em vez de acrescentar linhas | Pequeno | Baixo |
| M-11 | Worker XLSX clona o buffer e todo o resultado. `upload-dropzone.tsx:18-36`, `xlsx-worker.ts` | Pico de memória e pausas, sobretudo em mobile | Transferir o ArrayBuffer; avaliar manter lotes no worker | Médio a grande | Médio |
| M-12 | MultiSelect renderiza todas as opções e repete buscas lineares. `multi-select.tsx:48-259` | Abertura e digitação degradam em milhares de produtos | Virtualizar acima de um limite e usar Set/Map | Médio | Médio |
| M-13 | Tema escuro só é aplicado após hidratação e pode não ser aplicado em Trocar senha | Flash claro e tema incorreto em acesso direto | Resolver tema na raiz antes da primeira pintura, compatível com CSP | Médio | Médio |
| M-14 | Turnstile não reserva altura. `auth.page.tsx:112`, `first-access.page.tsx:118` | Botão se desloca depois que a tela parece pronta | Reservar espaço e mostrar carregamento | Pequeno | Baixo |
| M-15 | Filtros persistidos são globais por navegador e restaurados após a primeira pintura. `use-persistent-state.ts:21-66` | Troca de conta herda contexto; filtros piscam e iniciam query descartável | Vincular ao usuário ou limpar no logout; expor hidratação; usar URL para visão navegável | Médio | Médio |
| M-16 | Importações não aparecem na trilha de auditoria e o histórico omite responsável | Investigação de substituição exige consulta ao banco | Auditar conclusão, substituição, cancelamento e responsável | Médio | Baixo |
| M-17 | Cancelar diálogo de confirmação limpa fila, mas mantém itens “Aguardando” e o input não é resetado | Estado órfão e reseleção do mesmo arquivo pode não disparar | Remover itens cancelados ou oferecer retomada; limpar input | Pequeno | Baixo |
| M-18 | Falha de PDF não gera feedback visível. Hooks usam `try/finally` sem tratamento | Botão para de carregar sem explicar resultado | Toast ou mensagem persistente com erro de domínio | Pequeno | Baixo |
| M-19 | Histórico paginado de Produto não limita a página após trocar os dados. `paginated-history.tsx:12-51` | Lista pode ficar vazia apesar de haver registros | Resetar ou limitar página quando rows mudar | Pequeno | Baixo |
| M-20 | Troca voluntária de senha não oferece voltar; backend aceita a mesma senha como nova | Beco sem saída em PWA e política de expiração contornável | Mostrar Voltar quando não for fluxo forçado; rejeitar senha igual se a política for mantida | Pequeno | Baixo |
| M-21 | Redirecionamentos de autenticados em `/auth` e `/first-access` são capturados pelo próprio catch. `auth.tsx`, `first-access.tsx` | Usuário autenticado continua em tela pública e pode trocar de conta sem intenção | Relançar `redirect` com `isRedirect` | Pequeno | Baixo |
| M-22 | `getImportedDates` não chama `assertAdmin`. `upload.functions.ts:82-102` | Usuário comum pode consultar metadados administrativos diretamente | Aplicar guard ou documentar e mover o dado para domínio comum | Pequeno | Baixo |
| M-23 | Tabela de usuários mantém sete colunas em mobile e tablet retrato | Identidade e ações ficam fora da primeira área visível, exigindo rolagem horizontal sem pista clara | Tornar primeira coluna e ações sticky ou usar resumo por linha em telas pequenas | Médio | Médio |
| M-24 | Previsão monta tabela vazia com paginação durante a primeira busca | Parece não haver produtos e o bloco cresce quando a resposta chega | Separar loading inicial de atualização e reservar corpo da tabela | Pequeno | Baixo |
| M-25 | Navegação, ajuda e guia não compartilham a mesma lista e permissão | Usuário comum vê atalhos administrativos; documentação fica divergente | Centralizar definição de rota, papel, ícone e atalho | Médio | Baixo |

## Problemas de prioridade baixa

| ID | Problema | Recomendação |
|---|---|---|
| L-01 | Navegação ativa muda apenas visualmente, sem `aria-current` | Adicionar `aria-current="page"` em desktop e mobile |
| L-02 | Mensagem inicial da Previsão exige data, mas menciona apenas Loja e Seção | Citar Loja, Dia e Seção ou listar campos ausentes |
| L-03 | Seletor de datas pode dizer “Nenhuma data” durante loading ou erro | Propagar loading e erro das opções |
| L-04 | “Voltar” da documentação cria outra entrada e pode formar histórico circular | Limpar slug com `replace: true` ou voltar com fallback |
| L-05 | Barra mobile não considera `safe-area-inset-bottom` | Adicionar safe area e ajustar padding do conteúdo |
| L-06 | Footer usa card e `div`, sem landmark de rodapé | Usar `<footer>` e superfície menos destacada |
| L-07 | Páginas públicas usam `h2` sem `h1` e não possuem landmark principal | Adotar `main` e heading principal sem mudar aparência |
| L-08 | A ajuda é declarada lazy, mas montada em toda entrada autenticada | Montar no primeiro uso ou pre-carregar em idle |

## Performance percebida

### Problemas confirmados

- Reaproveitamento de dados entre contextos diferentes, H-01.
- Busca da Área sem debounce, H-09.
- PDF síncrono no main thread, H-10.
- Skeletons incompatíveis, M-10.
- Clonagem de dados do XLSX, M-11.
- MultiSelect sem virtualização, M-12.
- Restauração de filtros após hidratação, M-15.
- Turnstile sem espaço reservado, M-14.

### Práticas adequadas

- rotas e páginas pesadas têm boundaries separados;
- Recharts, jsPDF e autotable são carregados dinamicamente;
- SheetJS já roda em worker;
- Área e Previsão usam virtualização;
- queries têm `staleTime`, `gcTime` e política de foco coerentes;
- barra de rota e estados de geração de PDF dão percepção de atividade;
- a aplicação evita apagar todo o conteúdo em refetch. O ajuste necessário é
  impedir que continuidade visual vire atribuição ao contexto errado.

## Acessibilidade

### Prioridade de conformidade

1. Corrigir contraste dos tokens semânticos.
2. Restaurar conteúdo da ajuda para a árvore de acessibilidade.
3. Tornar rankings e pesquisa de produto operáveis por teclado.
4. Nomear filtros, drawer e estados assíncronos.
5. Corrigir landmarks, tabs, calendário e tabelas virtualizadas.
6. Garantir alvos mínimos e redução de movimento.

### Aspectos já adequados

- documento com `lang="pt-BR"` e viewport correto;
- skip link funcional para o conteúdo;
- imagens de marca com texto alternativo;
- inputs de autenticação com label, id e autocomplete;
- ícones isolados das ações principais geralmente têm nome acessível;
- Radix e Vaul fornecem focus trap, Escape e portais;
- ordenação das tabelas virtualizadas usa botões e informa direção;
- linha interativa da Área possui teclado, embora precise de foco mais visível.

## Consistência e manutenção

### Padronizações recomendadas

1. **Fonte única de navegação:** sidebar, barra mobile, drawer, ajuda e
   guia devem consumir os mesmos metadados de rota e permissão.
2. **Padrão de estado remoto:** loading inicial, atualização, vazio e erro devem
   ter contratos visuais distintos e não coexistir de forma contraditória.
3. **Nome acessível de campo:** `FilterField` deve associar label e controle sem
   cada página repetir ARIA manual.
4. **Tabs:** Upload e Administração devem usar o mesmo primitivo.
5. **Superfícies:** reservar `kpi-card` para métrica ou conteúdo principal e usar
   superfícies neutras para filtros, ajuda e rodapé.

### Débitos técnicos relacionados

- lógica de persistência não expõe hidratação;
- estado navegável depende de localStorage mais do que de search params;
- tratamento de erro varia por página;
- PDF de Área e Previsão duplicam parte do fluxo e divergem na paralelização de
  imports;
- componentes de seleção grandes não têm estratégia de escala;
- testes de componente não cobrem autenticação, tabs, calendário, diálogos,
  drawer, pesquisa de produto ou acessibilidade das tabelas.

## Mudanças opcionais e preferências estéticas

Estas propostas não corrigem falha objetiva e não devem competir com o plano
principal.

| Mudança opcional | Benefício possível | Observação |
|---|---|---|
| Reduzir uso de cards em filtros, ajuda e footer | Hierarquia menos genérica e menos ruído de sombra | Exige revisão visual transversal; não é urgente |
| Remover hover elevado de cards não clicáveis | Evita sinal falso de interação | Pode ser feito junto da revisão de superfícies |
| Carregar fontes declaradas ou assumir stack de sistema | Tipografia mais intencional ou CSS mais honesto | Não adicionar fonte remota sem medir peso e CSP |
| Fixar cabeçalho de Área e Previsão | Mantém contexto em páginas longas | Validar com rolagem horizontal e z-index |
| Persistir tamanho de página | Reduz ajuste repetitivo | Validar valores persistidos |
| Persistir aba administrativa na URL | Permite bookmark e retorno ao contexto | Útil, mas não bloqueante |
| Busca e links reais na documentação | Melhora navegação de acervo grande | Prioridade depende do uso real |
| Mostrar senha e detectar Caps Lock | Reduz erro de digitação | Opcional, com cuidado para privacidade |

## O que não precisa mudar

- Stack visual com Tailwind, shadcn/ui, Radix e Recharts.
- Estrutura de navegação lateral em desktop e barra inferior em mobile.
- Densidade de informação das telas analíticas.
- Rolagem horizontal das tabelas de Área e Previsão, pois comprimir todas as
  colunas seria pior.
- Filtros em cascata e limpeza dos descendentes.
- Virtualização e paginação já adotadas.
- Feedback de geração de PDF com bloqueio do botão e tempo decorrido.
- Uso de texto, não apenas cor, em grande parte dos estados vazios e de status.
- Linguagem visual sóbria, sem gradientes ou ornamentação em excesso na UI real.

## Plano de execução

### Etapa 0. Decisão de segurança independente

1. Revisar C-01 com decisão explícita sobre prova de identidade.
2. Não misturar essa mudança com correções visuais.
3. Se aprovada, planejar migration, compatibilidade das contas pendentes, testes
   de auth e deploy separado.

### Etapa 1. Integridade e tarefas centrais

1. H-01, impedir dados e PDFs de contextos diferentes.
2. H-05, criar estados de erro sem falso zero ou vazio.
3. M-18 e M-19, feedback de PDF e paginação de histórico.
4. H-09, debounce da busca de Área.

**Benefício:** alto. **Risco agregado:** baixo. **Dependências:** nenhuma mudança
visual ampla.

### Etapa 2. Segurança operacional da importação

1. H-03, proteção contra saída durante importação.
2. H-04, confirmação por data e duplicatas.
3. H-12, implementar drop ou corrigir o texto.
4. M-17, limpar seleção cancelada.
5. M-16 e M-22, auditoria e autorização dos metadados.

**Benefício:** alto. **Risco:** médio por causa da navegação coordenada com a
lease.

### Etapa 3. Acessibilidade de baixo risco

1. H-11, contraste dos textos semânticos.
2. H-06, link nos rankings.
3. M-01, M-02, M-05, M-07, M-08, M-09 e L-01.
4. M-03 e M-04, tabs e calendário.
5. L-05, L-06 e L-07.

**Benefício:** alto. **Risco:** baixo.

### Etapa 4. Widgets complexos e mobile

1. H-07, combobox de Produto.
2. H-08, semântica das tabelas virtualizadas.
3. M-06, formulários e foco dos diálogos.
4. M-23, estratégia para tabela administrativa em telas estreitas.
5. M-12, virtualização do MultiSelect.

**Benefício:** alto. **Risco:** médio. **Dependência:** testes de teclado e
leitor de tela por componente.

### Etapa 5. Estabilidade visual e tarefas pesadas

1. M-10, skeletons equivalentes ao layout final.
2. M-13, tema antes da primeira pintura.
3. M-14 e M-15, Turnstile e hidratação de filtros.
4. M-11, transporte do worker XLSX.
5. H-10, medir e decidir worker, servidor ou limite para PDF.

**Benefício:** médio a alto. **Risco:** médio. **Dependência:** medir arquivos e
exports próximos aos volumes reais antes de escolher arquitetura.

### Etapa 6. Consistência e opcionais

1. M-25, fonte única de navegação e permissões.
2. Revisar superfícies e hover de cards.
3. Avaliar tipografia, sticky headers, preferências e busca documental somente
   após concluir correções objetivas.

## Critério de aprovação para implementação

Antes de iniciar mudanças, aprovar separadamente:

1. Etapas 1 e 2, correções funcionais e importação.
2. Etapas 3 e 4, acessibilidade e mobile.
3. Etapa 5, mudanças com medição de performance.
4. C-01, decisão de segurança fora do lote visual.

Nenhuma alteração de interface foi implementada nesta auditoria.
