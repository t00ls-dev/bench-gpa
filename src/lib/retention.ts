/**
 * Horizonte de retenção de dados, em dias.
 *
 * O `purge_old_aggs` apaga tudo (aggs + import_log) com `sale_date` mais antigo
 * que isso. O `import-watch` ignora arquivos além desse horizonte para NÃO cair
 * num loop de importar→purgar→reimportar (um arquivo velho na pasta do mês
 * corrente seria importado, o purge das 3h o removeria da import_log e a
 * próxima rodada o reimportaria, todo dia).
 *
 * Manter purge e import-watch atrelados a esta mesma constante é essencial:
 * se um dia a retenção mudar, muda só aqui.
 */
export const RETENTION_DAYS = 180;
