import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Like useState but persists the value to localStorage under `key`.
 * Falls back to `initial` when nothing is stored or storage is unavailable.
 * `sanitize` is called after restoring the value: useful to discard invalid persisted data.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  sanitize?: (v: T) => T,
): [T, Dispatch<SetStateAction<T>>] {
  // sanitizedOnLoad viaja junto com value (em vez de num ref separado mutado
  // dentro do inicializador do useState) para não mutar um ref durante o
  // render, só efeitos/handlers de evento devem fazer isso. Sinaliza se
  // sanitize() mudou o valor lido do storage, para o efeito abaixo escrever a
  // correção de volta imediatamente, em vez de só na próxima mudança
  // não-relacionada (o que deixaria dado ruim em disco indefinidamente para
  // um usuário que nunca dispara outro update).
  const [state, setState] = useState<{ value: T; sanitizedOnLoad: boolean }>(() => {
    if (typeof window === "undefined") return { value: initial, sanitizedOnLoad: false };
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return { value: initial, sanitizedOnLoad: false };
      const parsed = JSON.parse(raw);
      // Shallow-merge stored object with defaults so fields added later
      // don't read back as `undefined` (e.g. when new array fields are introduced).
      const isMergeable =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        initial &&
        typeof initial === "object" &&
        !Array.isArray(initial);
      const merged = isMergeable
        ? ({ ...(initial as object), ...(parsed as object) } as T)
        : (parsed as T);
      if (!sanitize) return { value: merged, sanitizedOnLoad: false };
      const cleaned = sanitize(merged);
      const sanitizedOnLoad = JSON.stringify(cleaned) !== JSON.stringify(merged);
      return { value: cleaned, sanitizedOnLoad };
    } catch {
      return { value: initial, sanitizedOnLoad: false };
    }
  });

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (!state.sanitizedOnLoad) return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(state.value));
    } catch {
      // ignore quota / unavailable
    }
  }, [key, state.value, state.sanitizedOnLoad]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((updater) => {
    setState((s) => ({
      value: typeof updater === "function" ? (updater as (prev: T) => T)(s.value) : updater,
      sanitizedOnLoad: false,
    }));
  }, []);

  return [state.value, setValue];
}
