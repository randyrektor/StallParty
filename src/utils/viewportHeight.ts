export type ViewportBox = {
  height: number;
  offsetTop: number;
};

const KEYBOARD_GAP = 150;

/**
 * The home-screen app sometimes reports a short visible height, or pans that
 * height upward when the keyboard opens. Follow the visible rect while typing
 * or panned, and fill the screen again once the keyboard is gone.
 */
export function readViewportBox(
  view: { height: number; offsetTop: number } | null,
  innerHeight: number,
  largeHeight: number,
  typing: boolean,
): ViewportBox {
  const visible = view && view.height > 0 ? view.height : innerHeight;
  const offsetTop = view && view.height > 0 ? view.offsetTop : 0;
  const full = Math.max(visible, innerHeight, largeHeight);
  const panned = offsetTop > 1;
  const keyboard = full - visible > KEYBOARD_GAP && (typing || panned);

  if (keyboard || panned) {
    return {
      height: Math.round(visible),
      offsetTop: Math.round(Math.max(0, offsetTop)),
    };
  }

  return { height: Math.round(Math.max(0, full)), offsetTop: 0 };
}

export function isTypingElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return element.matches('input, textarea, select, [contenteditable="true"]');
}

function measureLargeHeight(doc: Document): number {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:100lvh;width:0;visibility:hidden;pointer-events:none';
  doc.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

export function bindViewportHeight(win: Window = window): () => void {
  let scheduled = 0;

  const apply = () => {
    const box = readViewportBox(
      win.visualViewport,
      win.innerHeight,
      measureLargeHeight(win.document),
      isTypingElement(win.document.activeElement),
    );
    const root = win.document.documentElement;
    root.style.setProperty('--app-height', `${box.height}px`);
    root.style.setProperty('--app-offset', `${box.offsetTop}px`);
    if (box.offsetTop > 0 && isTypingElement(win.document.activeElement)) {
      const active = win.document.activeElement;
      if (active instanceof HTMLElement) {
        win.cancelAnimationFrame(scheduled);
        scheduled = win.requestAnimationFrame(() => {
          active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      }
    }
  };

  apply();
  win.addEventListener('resize', apply);
  win.addEventListener('focusin', apply);
  win.addEventListener('focusout', apply);
  win.visualViewport?.addEventListener('resize', apply);
  win.visualViewport?.addEventListener('scroll', apply);
  return () => {
    win.cancelAnimationFrame(scheduled);
    win.removeEventListener('resize', apply);
    win.removeEventListener('focusin', apply);
    win.removeEventListener('focusout', apply);
    win.visualViewport?.removeEventListener('resize', apply);
    win.visualViewport?.removeEventListener('scroll', apply);
  };
}
