import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, pad2, fmtInt, fmtDT, fmtBRL, fmtBRShort, todayISOBrazil } from "./utils";

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
    // Meio-dia UTC, não meia-noite: fora de qualquer zona de ambiguidade de
    // fuso, testa só a formatação em si, não a conversão de fuso (isso tem
    // teste dedicado logo abaixo).
    const d = new Date("2024-03-15T12:00:00.000Z");
    expect(fmtBRShort(d)).toBe("15/03/24");
  });

  it("returns fallback for invalid string", () => {
    expect(fmtBRShort("not-a-date")).toBe("(sem)");
  });

  // Regressão do bug real (04/08/2026, Sentry BENCH-GPA-Y): só o ramo
  // `string` de fmtBRShort era seguro pra hidratação (parsing manual, sem
  // Date). Os ramos Date/number liam getFullYear()/getMonth()/getDate()
  // (getters locais) — mesma classe de bug do fmtDT, ativa de verdade em
  // admin-user-management.tsx (new Date(u.created_at), aba padrão de
  // /admin, sempre visível) e em admin.docs.page.tsx (via date-fns antes
  // desta correção).
  it("ramo Date: usa o dia em Brasília, não em UTC, perto da virada do dia", () => {
    // 00:00 UTC de 15/03 = 21:00 de 14/03 em America/Sao_Paulo (UTC-3).
    const d = new Date("2024-03-15T00:00:00.000Z");
    expect(fmtBRShort(d)).toBe("14/03/24");
  });

  it("ramo number: mesma conversão de fuso, mesmo instante como timestamp ms", () => {
    const ms = new Date("2024-03-15T00:00:00.000Z").getTime();
    expect(fmtBRShort(ms)).toBe("14/03/24");
  });

  it("ramos Date e number independem do fuso do processo", () => {
    const originalTz = process.env.TZ;
    try {
      const instant = new Date("2026-08-04T09:30:00.000Z");
      process.env.TZ = "UTC";
      const asUtc = fmtBRShort(instant);
      process.env.TZ = "America/New_York";
      const asNewYork = fmtBRShort(instant.getTime());
      expect(asUtc).toBe(asNewYork);
      expect(asUtc).toBe("04/08/26");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("todayISOBrazil", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa o dia em Brasília, não em UTC, perto da virada do dia", () => {
    // 01:00 UTC de 04/08 = 22:00 de 03/08 em America/Sao_Paulo (UTC-3): getters
    // locais rodando num processo em UTC (o servidor) diriam "04", errado.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T01:00:00.000Z"));
    expect(todayISOBrazil()).toBe("2026-08-03");
  });

  it("independe do fuso do processo, igual fmtDT", () => {
    const originalTz = process.env.TZ;
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-04T15:00:00.000Z"));
      process.env.TZ = "UTC";
      const asUtc = todayISOBrazil();
      process.env.TZ = "America/New_York";
      const asNewYork = todayISOBrazil();
      expect(asUtc).toBe(asNewYork);
      expect(asUtc).toBe("2026-08-04");
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
