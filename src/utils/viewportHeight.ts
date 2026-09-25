/** Visible height of the phone screen, including a home-screen app with no browser bar. */
export function readViewportHeight(win: Pick<Window, 'innerHeight' | 'visualViewport'>): number {
  const visible = win.visualViewport?.height ?? 0;
  const height = visible > 0 ? visible : win.innerHeight;
  return Math.max(0, Math.round(height));
}

export function bindViewportHeight(win: Window = window): () => void {
  const apply = () => {
    const height = readViewportHeight(win);
    if (height <= 0) return;
    win.document.documentElement.style.setProperty('--app-height', `${height}px`);
  };
  apply();
  win.addEventListener('resize', apply);
  win.visualViewport?.addEventListener('resize', apply);
  return () => {
    win.removeEventListener('resize', apply);
    win.visualViewport?.removeEventListener('resize', apply);
  };
}
