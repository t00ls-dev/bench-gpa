import { describe, it, expect } from "vitest";
import { defaultDateWindow, DEFAULT_WINDOW_DAYS } from "./date-window";

const days = (n: number, start = 1) =>
  Array.from({ length: n }, (_, i) => `2026-07-${String(start + i).padStart(2, "0")}`);

describe("defaultDateWindow", () => {
  it("devolve as últimas DEFAULT_WINDOW_DAYS datas quando há de sobra", () => {
    const r = defaultDateWindow(days(20));
    expect(r).toEqual({ from: "2026-07-14", to: "2026-07-20" });
    expect(r && days(20).indexOf(r.to) - days(20).indexOf(r.from) + 1).toBe(DEFAULT_WINDOW_DAYS);
  });

  it("usa tudo o que existe quando há menos datas que a janela", () => {
    expect(defaultDateWindow(days(3))).toEqual({ from: "2026-07-01", to: "2026-07-03" });
  });

  it("um único dia vira janela de um dia", () => {
    expect(defaultDateWindow(["2026-07-09"])).toEqual({ from: "2026-07-09", to: "2026-07-09" });
  });

  it("sem datas e sem limite, devolve null em vez de um intervalo inventado", () => {
    expect(defaultDateWindow([])).toBeNull();
  });

  // O comportamento que a tela Área tinha: nunca passar da última data importada.
  describe("com limite (latest)", () => {
    it("não ultrapassa o limite", () => {
      const r = defaultDateWindow(days(20), "2026-07-10");
      expect(r).toEqual({ from: "2026-07-04", to: "2026-07-10" });
    });

    it("ignora datas posteriores ao limite ao montar a janela", () => {
      const r = defaultDateWindow(["2026-07-01", "2026-07-02", "2026-07-30"], "2026-07-02");
      expect(r).toEqual({ from: "2026-07-01", to: "2026-07-02" });
    });

    // Caso de borda que já existia na tela: nenhuma data disponível é <= latest.
    it("cai para o próprio limite quando nada é anterior a ele", () => {
      const r = defaultDateWindow(["2026-07-20", "2026-07-21"], "2026-07-01");
      expect(r).toEqual({ from: "2026-07-01", to: "2026-07-01" });
    });

    it("sem datas mas com limite, usa o limite nos dois lados", () => {
      expect(defaultDateWindow([], "2026-07-09")).toEqual({
        from: "2026-07-09",
        to: "2026-07-09",
      });
    });
  });

  it("o intervalo nunca sai invertido (from <= to)", () => {
    const cases: [string[], string | undefined][] = [
      [days(20), undefined],
      [days(20), "2026-07-10"],
      [days(2), "2026-07-01"],
      [["2026-07-20"], "2026-07-01"],
    ];
    for (const [av, lt] of cases) {
      const r = defaultDateWindow(av, lt);
      if (r) expect(r.from <= r.to).toBe(true);
    }
  });
});
