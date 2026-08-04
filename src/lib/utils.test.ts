import { describe, it, expect } from "vitest";
import { cn, pad2, fmtInt, fmtDT, fmtBRL, fmtBRShort } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
  });
});

describe("pad2", () => {
  it("pads single digit", () => {
    expect(pad2(1)).toBe("01");
  });

  it("does not pad double digit", () => {
    expect(pad2(10)).toBe("10");
  });

  it("handles zero", () => {
    expect(pad2(0)).toBe("00");
  });
});

describe("fmtInt", () => {
  it("formats with pt-BR locale", () => {
    expect(fmtInt(1234)).toBe("1.234");
  });

  it("handles zero", () => {
    expect(fmtInt(0)).toBe("0");
  });
});

describe("fmtDT", () => {
  it("formats ISO date string, convertendo pro fuso de Brasília", () => {
    // 14:30 UTC = 11:30 em America/Sao_Paulo (UTC-3, sem horário de verão
    // desde 2019). String com "Z" porque é o formato real que dateTimeStr()
    // (api-types.ts) produz — nunca sem sufixo de fuso.
    const result = fmtDT("2024-03-15T14:30:00.000Z");
    expect(result).toBe("15/03/24 11:30");
  });

  // Regressão do bug real (04/08/2026, Sentry BENCH-GPA-Y): getters locais
  // (getHours/getDate) liam o fuso de onde o código roda, produzindo strings
  // diferentes no SSR (servidor em UTC) e na hidratação (navegador do
  // usuário) para o mesmo instante — erro de hidratação no React. Fuso fixo
  // via Intl.DateTimeFormat elimina a dependência do ambiente: simula "rodar
  // em outro fuso" trocando TZ do processo e confirma que a saída não muda.
  it("independe do fuso do processo que roda o código (server vs. client)", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const asUtc = fmtDT("2026-08-04T09:30:00.000Z");
      process.env.TZ = "America/New_York";
      const asNewYork = fmtDT("2026-08-04T09:30:00.000Z");
      expect(asUtc).toBe(asNewYork);
      expect(asUtc).toBe("04/08/26 06:30");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("fmtBRL", () => {
  it("formats as BRL currency without cents", () => {
    const result = fmtBRL(1500);
    expect(result).toContain("R$");
    expect(result).toContain("1.500");
  });

  it("handles zero", () => {
    const result = fmtBRL(0);
    expect(result).toContain("0");
  });
});

describe("fmtBRShort", () => {
  it("returns fallback for null", () => {
    expect(fmtBRShort(null)).toBe("(sem)");
  });

  it("returns fallback for undefined", () => {
    expect(fmtBRShort(undefined)).toBe("(sem)");
  });

  it("formats ISO date string", () => {
    expect(fmtBRShort("2024-03-15")).toBe("15/03/24");
  });

  it("formats Date object", () => {
    const d = new Date(2024, 2, 15);
    expect(fmtBRShort(d)).toBe("15/03/24");
  });

  it("returns fallback for invalid string", () => {
    expect(fmtBRShort("not-a-date")).toBe("(sem)");
  });
});
