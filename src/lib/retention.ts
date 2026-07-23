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

/**
 * Idade de uma data `YYYY-MM-DD` em dias de calendário UTC.
 *
 * Datas futuras devolvem valor negativo — o chamador trata como "dentro da
 * retenção", que é o comportamento certo.
 */
export function daysSinceUtc(dateIso: string, now: number = Date.now()): number {
  return Math.floor((now - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * `true` quando o purge PRESERVA esta data — e, portanto, quando o import-watch
 * pode importá-la sem cair no loop importar→purgar→reimportar.
 *
 * Esta função é o lado JS de uma invariante que tem a outra ponta em SQL, no
 * `purge_old_aggs` (scripts/migrate-schema.sql):
 *
 *     DELETE ... WHERE sale_date < DATE_SUB(CURRENT_DATE, INTERVAL 180 DAY)
 *
 * Preservar `sale_date >= hoje - 180` equivale a `daysSinceUtc(...) <= 180`. A
 * comparação do purge é ESTRITA, então a data exatamente na borda (180 dias) é
 * mantida — e por isso aqui também é `<=`, não `<`. Trocar por `<` de um lado
 * só reabre o loop diário de reimportação.
 *
 * DEPENDÊNCIA DE FUSO: os dois lados só concordam porque o SO do servidor e o
 * MariaDB estão ambos em UTC (`time_zone = SYSTEM`, TZ do host `Etc/UTC`) — aí
 * `CURRENT_DATE` e o dia UTC calculado aqui são o mesmo dia. Se o fuso do host
 * ou do banco mudar para `America/Sao_Paulo`, o `CURRENT_DATE` passa a virar 3h
 * antes do dia UTC e a borda desalinha por um dia. Ao mexer em fuso, revisar
 * esta invariante junto.
 */
export function isWithinRetention(dateIso: string, now: number = Date.now()): boolean {
  return daysSinceUtc(dateIso, now) <= RETENTION_DAYS;
}
