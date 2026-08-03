import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

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
  // O valor persistido só pode ser lido depois de montado (window não existe
  // no SSR), nunca no inicializador do useState: um inicializador que
  // resolve `initial` no servidor e o valor do localStorage no cliente faz o
  // primeiro render pós-hidratação divergir do HTML enviado pelo SSR (erro
  // de hidratação do React sempre que o usuário já tinha algo salvo).
  // `hydrated` trava o efeito de persistência abaixo até esse primeiro
  // load acontecer, senão ele escreveria `initial` de volta e apagaria o
  // valor salvo antes do setState da hidratação renderizar.
  const [state, setState] = useState<{ value: T; hydrated: boolean }>({
    value: initial,
    hydrated: false,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        // Carga única de localStorage no mount, não estado derivado de
        // props: não existe idioma sem setState-em-efeito pra ler um storage
        // externo síncrono só depois que `window` existe (ver comentário
        // acima da declaração do state).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((s) => ({ ...s, hydrated: true }));
        return;
      }
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
      const cleaned = sanitize ? sanitize(merged) : merged;
      setState({ value: cleaned, hydrated: true });
    } catch {
      setState((s) => ({ ...s, hydrated: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state.value));
    } catch {
      // ignore quota / unavailable
    }
  }, [key, state.value, state.hydrated]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((updater) => {
    setState((s) => ({
      value: typeof updater === "function" ? (updater as (prev: T) => T)(s.value) : updater,
      hydrated: true,
    }));
  }, []);

  return [state.value, setValue];
}
