import { useEffect } from 'react';

/** Keep the screen on while the captain is off the home screen. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let released = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      if (released || document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (released) {
          await next.release();
          return;
        }
        sentinel = next;
      } catch {
        sentinel = null;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
