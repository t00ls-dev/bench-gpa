// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "./date-range-picker";

describe("DateRangePicker", () => {
  it("keeps a partial custom range as a draft until the user applies it", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        from="2026-08-20"
        to="2026-08-21"
        reference="2026-08-28"
        availableDates={[
          "2026-08-20",
          "2026-08-21",
          "2026-08-22",
          "2026-08-23",
          "2026-08-24",
          "2026-08-25",
          "2026-08-26",
          "2026-08-27",
          "2026-08-28",
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /20\/08\/26 - 21\/08\/26/ }));
    fireEvent.click(screen.getByRole("button", { name: /24 de agosto de 2026/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("24/08/26 - (sem)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /27 de agosto de 2026/i }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-08-24", to: "2026-08-27" });
  });
});
