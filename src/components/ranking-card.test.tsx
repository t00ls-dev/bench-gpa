// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RankingCard, type RankingItem } from "./ranking-card";

describe("RankingCard", () => {
  it("keeps hierarchy context out of the label without losing click-through data", () => {
    const onItemClick = vi.fn();
    const item: RankingItem = {
      name: "IOGURTE NATURAL",
      val: 100,
      depto: "PERECIVEIS",
      secao: "LATICINIOS E MASSAS",
      grupo: "IOGURTE NATURAL",
      context: "PERECIVEIS › LATICINIOS E MASSAS",
    };

    render(<RankingCard title="Top Grupos" items={[item]} onItemClick={onItemClick} />);

    const label = screen.getByText("IOGURTE NATURAL");
    expect(label).toHaveAttribute("title", "IOGURTE NATURAL");
    expect(screen.queryByText(/PERECIVEIS/)).not.toBeInTheDocument();

    fireEvent.click(label);
    expect(onItemClick).toHaveBeenCalledWith(item);
  });
});
