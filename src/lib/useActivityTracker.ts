import { useEffect } from 'react';
import { useMetrics } from '../store/metrics';

const EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'] as const;
const TICK_S = 10; // granularidad del tiempo activo
const IDLE_S = 60; // sin interacción por más de esto = no cuenta como uso

/** Suma tiempo activo (pestaña visible + interacción reciente) a la sesión actual. */
export function useActivityTracker(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last < IDLE_S * 1000) {
        useMetrics.getState().track({ type: 'active', seconds: TICK_S });
      }
    }, TICK_S * 1000);
    return () => {
      clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [active]);
}
