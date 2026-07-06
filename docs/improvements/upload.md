# Upload — Possíveis melhorias

## UX do Upload

- **Drag-and-drop visual feedback**: quando o usuário arrasta um arquivo sobre a zona, destacar a borda com cor mais visível e overlay "Solte para importar"
- **Remover arquivos da lista**: permitir remover arquivos individuais antes de iniciar a importação
- **Reordenar arquivos**: arrastar para reordenar a fila de processamento
- **Importação em background**: notificar quando terminar sem bloquear a navegação para outras páginas
- **Tamanho do arquivo formatado**: exibir KB/MB/GB de forma mais amigável

## Progresso e Feedback

- **Barra de progresso geral**: além da barra por arquivo, mostrar progresso consolidado (3/5 arquivos processados, 45% do total)
- **Tempo estimado mais preciso**: usar média móvel das últimas N linhas em vez de taxa desde o início
- **Log detalhado**: expandir resultados com link para "ver detalhes" que mostra linhas rejeitadas, warnings, etc.
- **Notificação ao finalizar**: toast já existe, mas poderia ter som ou notificação do sistema se a aba estiver em background

## Validação

- **Preview do arquivo**: antes de importar, mostrar amostra das primeiras linhas parseadas para o usuário confirmar
- **Validação de schema**: verificar se as colunas esperadas existem antes de processar o arquivo inteiro
- **Detecção de duplicatas**: alertar se o mesmo arquivo já foi importado antes (por nome/hash)
- **Limite de tamanho mais granular**: alertar antes de selecionar arquivos muito grandes, não depois

## Calendário de Importações

- **Navegação por ano**: hoje navega mês a mês, adicionar atalho para pular entre anos
- **Filtrar por mês/ano específico**: input para ir diretamente para um mês/ano
- **Resumo mensal**: total de linhas importadas no mês, média por dia
- **Comparar cobertura**: highlight em dias que faltam vs dias importados vs dias úteis

## Performance / Técnico

- **Web Worker para parse**: `parseAnyWorkbook` roda na main thread, congelando a UI. Mover para Web Worker
- **Retry automático**: se um chunk falhar, tentar novamente antes de marcar como erro
- **Cancelar importação**: botão para cancelar o processamento em andamento
- **Pausar/Retomar**: para imports muito grandes, permitir pausar e continuar depois
- **Validação de linha individual**: em vez de rejeitar o arquivo inteiro se uma linha falhar, pular linhas inválidas e reportar quantas foram ignoradas

## Histórico

- **Filtros no histórico**: buscar por data, período, usuário que importou
- **Comparar imports**: diff entre duas importações da mesma data (linhas adicionadas/removidas)
- **Rollback**: botão para reverter para a importação anterior de uma data específica

## Segurança

- **Audit log**: registrar quem importou o quê e quando (já tem `imported_by` na tabela, mas não é exibido)
- **Limitar por usuário**: configurar cota máxima de linhas por mês por usuário
