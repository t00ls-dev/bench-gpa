import { useEffect, useRef } from "react";

/**
 * Mantém a tela ligada enquanto `active` for true (ex.: durante um import
 * longo, pra não perder o progresso visual nem a tela apagar no meio de um
 * upload que pode levar minutos). Usa a Screen Wake Lock API nativa;
 * navegadores sem suporte (ou fora de contexto seguro, http sem TLS) só não
 * fazem nada — degrada bem, nunca quebra o fluxo de import em si.
 *
 * A API libera o lock sozinha quando a aba fica oculta (troca de app,
 * minimizar, tela bloqueada): é o comportamento documentado da spec, não um
 * bug. O browser recomenda reobter no retorno se ainda estiver ativo, por
 * isso o listener de visibilitychange.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        // O navegador dispara "release" tanto quando chamamos sentinel.release()
        // quanto quando ele mesmo libera sozinho (aba escondida) — sem ouvir
        // isso, lockRef.current ficaria com uma referência desatualizada e o
        // handler de visibilitychange abaixo nunca reobteria o lock de volta.
        sentinel.addEventListener("release", () => {
          if (lockRef.current === sentinel) lockRef.current = null;
        });
        lockRef.current = sentinel;
      } catch {
        // NotAllowedError (aba não visível no momento do request, permissão
        // negada pelo browser, etc.): sem tela sempre ligada, mas o import
        // segue normal. Não é um erro que valha interromper nada.
      }
    }

    acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
