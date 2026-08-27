export function hasTextSelectionWithin(element: Node): boolean {
  if (typeof window === "undefined") return false;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.containsNode(element, true));
}
