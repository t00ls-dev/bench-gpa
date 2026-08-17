// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastContextCards } from "@/components/forecast-context-cards";

describe("ForecastContextCards", () => {
  it("shows the selected context and placeholders", () => {
    render(<ForecastContextCards storeCode="123" targetDate="2026-08-17" secao={undefined} />);

    expect(screen.getByText("Contexto da previsão")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("17/08/2026")).toBeInTheDocument();
    expect(screen.getByText("Selecione")).toBeInTheDocument();
    expect(screen.getByText("Escolha a seção")).toBeInTheDocument();
  });
});
