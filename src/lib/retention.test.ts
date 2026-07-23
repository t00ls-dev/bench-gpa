import { describe, it, expect } from "vitest";
import { RETENTION_DAYS, daysSinceUtc, isWithinRetention } from "./retention";

// Referência fixa: 2026-07-23 20:00 UTC. Usar um horário no meio do dia é de
// propósito — daysSinceUtc conta dias de calendário, então o resultado não pode
// depender da hora em que a cron roda.
const NOW = Date.parse("2026-07-23T20:00:00Z");

/** Data que fica exatamente `d` dias de calendário UTC atrás de NOW. */
function daysAgo(d: number): string {
  return new Date(Date.parse("2026-07-23T00:00:00Z") - d * 86_400_000).toISOString().slice(0, 10);
}

describe("daysSinceUtc", () => {
  it("conta dias de calendário, não frações", () => {
    expect(daysSinceUtc("2026-07-23", NOW)).toBe(0);
    expect(daysSinceUtc("2026-07-22", NOW)).toBe(1);
    expect(daysSinceUtc(daysAgo(180), NOW)).toBe(180);
  });

  it("não depende da hora do dia", () => {
    const madrugada = Date.parse("2026-07-23T00:30:00Z");
    const noite = Date.parse("2026-07-23T23:45:00Z");
    expect(daysSinceUtc("2026-01-24", madrugada)).toBe(daysSinceUtc("2026-01-24", noite));
  });

  it("devolve negativo para data futura", () => {
    expect(daysSinceUtc("2026-07-24", NOW)).toBeLessThan(0);
  });
});

describe("isWithinRetention — borda casada com o purge_old_aggs", () => {
  // O purge apaga `sale_date < CURRENT_DATE - RETENTION_DAYS` (estrito), então
  // a data exatamente na borda é PRESERVADA. Se algum dia isto virar `<`, o
  // import-watch passa a pular um dia que o purge ainda guarda — ou, pior no
  // sentido inverso, a importar um dia que o purge apaga de madrugada,
  // reabrindo o loop importar -> purgar -> reimportar.

  it("preserva a data exatamente na borda", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS), NOW)).toBe(true);
  });

  it("descarta o primeiro dia além da borda", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS + 1), NOW)).toBe(false);
  });

  it("mantém tudo dentro do horizonte", () => {
    expect(isWithinRetention(daysAgo(0), NOW)).toBe(true);
    expect(isWithinRetention(daysAgo(1), NOW)).toBe(true);
    expect(isWithinRetention(daysAgo(RETENTION_DAYS - 1), NOW)).toBe(true);
  });

  it("descarta o que está bem além do horizonte", () => {
    expect(isWithinRetention(daysAgo(RETENTION_DAYS + 30), NOW)).toBe(false);
    expect(isWithinRetention("2020-01-01", NOW)).toBe(false);
  });

  it("trata data futura como dentro da retenção", () => {
    expect(isWithinRetention("2026-12-31", NOW)).toBe(true);
  });

  it("não há dia em que importar e purgar discordem", () => {
    // Varre a vizinhança da borda: para todo dia, "import-watch importa" tem que
    // ser exatamente "purge preserva". O purge preserva quando
    // daysSinceUtc <= RETENTION_DAYS — a mesma conta, escrita à mão aqui de
    // propósito, para o teste falhar se a implementação mudar de critério.
    for (let d = RETENTION_DAYS - 5; d <= RETENTION_DAYS + 5; d++) {
      const date = daysAgo(d);
      const purgePreserva = daysSinceUtc(date, NOW) <= RETENTION_DAYS;
      expect(isWithinRetention(date, NOW)).toBe(purgePreserva);
    }
  });
});
