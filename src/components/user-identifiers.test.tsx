// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserIdentifiers } from "./user-identifiers";

describe("UserIdentifiers", () => {
  it("shows username before employee ID with an accessible description", () => {
    render(<UserIdentifiers username="ana.silva" employeeId="100123" />);

    const identifiers = screen.getByLabelText("Usuário ana.silva, Matrícula 100123");
    expect(identifiers).toHaveTextContent("ana.silva");
    expect(identifiers).toHaveTextContent(/•\s100123/);
  });

  it.each([
    ["ana.silva", null, "Usuário ana.silva"],
    [null, "100123", "Matrícula 100123"],
  ] as const)(
    "shows an available identifier without a separator",
    (username, employeeId, label) => {
      render(<UserIdentifiers username={username} employeeId={employeeId} />);

      const identifiers = screen.getByLabelText(label);
      expect(identifiers).not.toHaveTextContent("•");
      expect(identifiers).not.toHaveClass("truncate");
    },
  );

  it("renders nothing when neither identifier is available", () => {
    const { container } = render(<UserIdentifiers username={null} employeeId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
