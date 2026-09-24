import { useEffect, useRef, useCallback } from "react";

/**
 * Inactivity auto-return timer for the kiosk "manage" mode.
 *
 * Every pointer/keyboard interaction while active RESETS a timer. When it
 * fires, `onTimeout` is invoked (the caller flips back to the locked
 * At-a-Glance view). The timer only runs while `active` is true; when
 * inactive it is cleared and no listeners are bound.
 *
 * It cannot be worked around by tapping: each tap RESETS the timer (it
 * does not dismiss it), so continuous activity keeps the screen unlocked
 * but any pause re-locks it.
 */
export function useInactivityTimer(active: boolean, onTimeout: () => void, ms = 45_000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest callback without re-arming the timer on every render.
  const cbRef = useRef(onTimeout);
  cbRef.current = onTimeout;

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!active) return;
    timerRef.current = setTimeout(() => cbRef.current(), ms);
  }, [active, ms]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    reset();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "keydown", "click"];
    const handler = () => reset();
    events.forEach((e) => window.addEventListener(e, handler));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [active, reset]);
}
