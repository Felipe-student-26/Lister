import { useEffect } from 'react';

const EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'] as const;

/** Cierra la sesión tras `minutes` sin actividad (ventana deslizante). */
export function useIdleLogout(active: boolean, onIdle: () => void, minutes = 30) {
  useEffect(() => {
    if (!active) return;
    let timer = setTimeout(onIdle, minutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, minutes * 60_000);
    };
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, onIdle, minutes]);
}
