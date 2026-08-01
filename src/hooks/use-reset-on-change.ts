import { useState } from "react";

/**
 * Chama `onChange` durante o render (não em efeito) sempre que algum item de
 * `deps` mudar desde o último render, o padrão que o próprio React recomenda
 * para "ajustar estado quando uma prop muda", sem o round-trip extra de um
 * `useEffect` (que causaria um commit visível com o estado antigo antes de
 * corrigir). Comparação rasa por item, igual a `useEffect`'s deps array.
 */
export function useResetOnChange(deps: readonly unknown[], onChange: () => void): void {
  const [prev, setPrev] = useState(deps);
  const changed = deps.length !== prev.length || deps.some((d, i) => !Object.is(d, prev[i]));
  if (changed) {
    setPrev(deps);
    onChange();
  }
}
