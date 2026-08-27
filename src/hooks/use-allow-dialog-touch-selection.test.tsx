// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllowDialogTouchSelection } from "./use-allow-dialog-touch-selection";

function Harness() {
  useAllowDialogTouchSelection();
  return (
    <>
      <div role="dialog">
        <p>Texto selecionável dentro do modal.</p>
      </div>
      <div role="dialog">
        <p>Outro modal.</p>
      </div>
    </>
  );
}

function selectText(element: Element, start: number, end: number) {
  const text = element.firstChild;
  if (!(text instanceof Text)) throw new Error("Test element has no text node");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

afterEach(() => document.getSelection()?.removeAllRanges());

describe("useAllowDialogTouchSelection", () => {
  it("keeps touchmove away from document scroll-lock listeners within the selected dialog", () => {
    const { getByText } = render(<Harness />);
    const text = getByText("Texto selecionável dentro do modal.");
    selectText(text, 0, 5);
    const documentListener = vi.fn();
    document.addEventListener("touchmove", documentListener);

    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    text.dispatchEvent(event);

    expect(documentListener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    document.removeEventListener("touchmove", documentListener);
  });

  it("does not interfere with touchmove when there is no active selection", () => {
    const { getByText } = render(<Harness />);
    const text = getByText("Texto selecionável dentro do modal.");
    const documentListener = vi.fn();
    document.addEventListener("touchmove", documentListener);

    text.dispatchEvent(new Event("touchmove", { bubbles: true, cancelable: true }));

    expect(documentListener).toHaveBeenCalledOnce();
    document.removeEventListener("touchmove", documentListener);
  });

  it("does not interfere with a gesture in a different dialog", () => {
    const { getByText } = render(<Harness />);
    selectText(getByText("Texto selecionável dentro do modal."), 0, 5);
    const otherDialogText = getByText("Outro modal.");
    const documentListener = vi.fn();
    document.addEventListener("touchmove", documentListener);

    otherDialogText.dispatchEvent(new Event("touchmove", { bubbles: true, cancelable: true }));

    expect(documentListener).toHaveBeenCalledOnce();
    document.removeEventListener("touchmove", documentListener);
  });
});
