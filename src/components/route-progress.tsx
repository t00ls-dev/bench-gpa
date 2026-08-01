"use client";

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Barra de progresso fina no topo, sinalizando que uma navegação está em
 * andamento. Alimentada pelo status do router. Um pequeno atraso antes de
 * aparecer evita "piscar" em navegações instantâneas.
 */
export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [progress, setProgress] = useState(0); // 0 = escondida
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (trickle.current) {
        clearInterval(trickle.current);
        trickle.current = null;
      }
    };

    if (pending) {
      clearAll();
      // Só mostra se a navegação passar de ~80ms: instantâneas nem aparecem.
      timers.current.push(
        setTimeout(() => {
          setProgress(12);
          trickle.current = setInterval(() => {
            setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.15));
          }, 200);
        }, 80),
      );
    } else {
      clearAll();
      // Completa e some, só quando de fato estava visível. Fica no efeito de
      // propósito (não dá pra mover pra render): é parte da coreografia
      // imperativa do timer que a linha seguinte agenda, não estado derivado
      // de uma prop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress((p) => (p > 0 ? 100 : 0));
      timers.current.push(setTimeout(() => setProgress(0), 200));
    }

    return clearAll;
  }, [pending]);

  const visible = progress > 0;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-primary ease-out"
        style={{
          width: `${progress}%`,
          transition: progress === 0 ? "none" : "width 200ms ease-out",
          boxShadow: "0 0 8px var(--primary)",
        }}
      />
    </div>
  );
}
