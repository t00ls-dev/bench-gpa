import { describe, it, expect } from "vitest";
import { renderErrorPage } from "./error-page";

describe("error-page", () => {
  it("returns an HTML string", () => {
    const html = renderErrorPage();
    expect(html).toContain("<!doctype html>");
  });

  it("contains retry button", () => {
    const html = renderErrorPage();
    expect(html).toContain("Try again");
    expect(html).toContain("location.reload()");
  });

  it("contains home link", () => {
    const html = renderErrorPage();
    expect(html).toContain('href="/"');
    expect(html).toContain("Go home");
  });

  it("has no broken markup (basic well-formedness)", () => {
    const html = renderErrorPage();
    expect(html).toContain("</html>");
  });
});
