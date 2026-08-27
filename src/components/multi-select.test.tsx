// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MultiSelect } from "./multi-select";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("MultiSelect", () => {
  it("uses selectable options without losing click and keyboard behavior", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="Todos"
        ariaLabel="Departamento"
        options={[{ value: "PERECIVEIS", label: "PERECIVEIS" }]}
        value={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Departamento" }));
    const option = screen.getByRole("option", { name: "PERECIVEIS" });
    expect(option.tagName).toBe("DIV");
    expect(option).toHaveClass("select-text");

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      containsNode: () => true,
    } as unknown as Selection);
    fireEvent.click(option);
    expect(onChange).not.toHaveBeenCalled();
    getSelection.mockRestore();

    fireEvent.keyDown(option, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["PERECIVEIS"]);
  });
});
