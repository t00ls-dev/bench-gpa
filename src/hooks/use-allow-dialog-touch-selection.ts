import { useEffect } from "react";

function closestDialog(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest('[role="dialog"], [role="alertdialog"]') ?? null;
}

export function useAllowDialogTouchSelection() {
  useEffect(() => {
    const listenerOptions = { capture: true, passive: false } as const;
    const allowSelectionHandleMove = (event: TouchEvent) => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selectionDialog = closestDialog(selection.anchorNode);
      const targetDialog = closestDialog(event.target instanceof Node ? event.target : null);
      if (selectionDialog && selectionDialog === targetDialog) {
        event.stopPropagation();
      }
    };

    window.addEventListener("touchmove", allowSelectionHandleMove, listenerOptions);
    return () => window.removeEventListener("touchmove", allowSelectionHandleMove, listenerOptions);
  }, []);
}
