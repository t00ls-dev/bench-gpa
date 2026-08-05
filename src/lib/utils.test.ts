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
    // 14:30 UTC = 11:30 in America/Sao_Paulo (UTC-3, no daylight saving
    // since 2019). String with "Z" because that's the real format
    // dateTimeStr() (api-types.ts) produces -- never without a timezone suffix.
    const result = fmtDT("2024-03-15T14:30:00.000Z");
    expect(result).toBe("15/03/24 11:30");
  });

  // Regression from a real bug (08/04/2026, Sentry BENCH-GPA-Y): local
  // getters (getHours/getDate) read the timezone of wherever the code
  // runs, producing different strings during SSR (server on UTC) and
  // hydration (user's browser) for the same instant -- a React hydration
  // error. A fixed timezone via Intl.DateTimeFormat eliminates the
  // dependency on the environment: this simulates "running in another
  // timezone" by swapping the process's TZ and confirms the output doesn't change.
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
    // Noon UTC, not midnight: outside any timezone ambiguity zone, this
    // tests only the formatting itself, not the timezone conversion (that
    // has a dedicated test right below).
    const d = new Date("2024-03-15T12:00:00.000Z");
    expect(fmtBRShort(d)).toBe("15/03/24");
  });

  it("returns fallback for invalid string", () => {
    expect(fmtBRShort("not-a-date")).toBe("(sem)");
  });

  // Regression from a real bug (08/04/2026, Sentry BENCH-GPA-Y): only
  // fmtBRShort's `string` branch was safe for hydration (manual parsing,
  // no Date). The Date/number branches read getFullYear()/getMonth()/
  // getDate() (local getters) -- the same class of bug as fmtDT, actively
  // triggered in admin-user-management.tsx (new Date(u.created_at),
  // /admin's default tab, always visible) and in admin.docs.page.tsx (via
  // date-fns before this fix).
  it("ramo Date: usa o dia em Brasília, não em UTC, perto da virada do dia", () => {
    // 00:00 UTC on 03/15 = 21:00 on 03/14 in America/Sao_Paulo (UTC-3).
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
    // 01:00 UTC on 08/04 = 22:00 on 08/03 in America/Sao_Paulo (UTC-3):
    // local getters running in a process on UTC (the server) would say
    // "04", which is wrong.
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
