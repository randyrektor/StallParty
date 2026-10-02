import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_SCREEN_DISMISS_KEY,
  dismissHomeScreen,
  installOffer,
  isAndroidDevice,
  isHomeScreenDismissed,
  isIosDevice,
} from './homeScreenInstall';

const memory = new Map<string, string>();

describe('device checks', () => {
  it('treats iPhone, iPad, and iPadOS as the Share-sheet path', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)', 'iPad', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('leaves a desktop Mac on the hidden path', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isAndroidDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });

  it('recognizes Android phones', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)).toBe(false);
  });
});

describe('installOffer', () => {
  const ready = { dismissed: false, standalone: false, ios: false, android: false, hasPrompt: false };

  it('shows iPhone instructions even without a browser prompt', () => {
    expect(installOffer({ ...ready, ios: true })).toBe('ios');
  });

  it('shows the Android button only when the browser offers install', () => {
    expect(installOffer({ ...ready, android: true, hasPrompt: false })).toBeNull();
    expect(installOffer({ ...ready, android: true, hasPrompt: true })).toBe('android');
  });

  it('stays hidden on a desktop, after dismiss, and when already installed', () => {
    expect(installOffer(ready)).toBeNull();
    expect(installOffer({ ...ready, ios: true, dismissed: true })).toBeNull();
    expect(installOffer({ ...ready, android: true, hasPrompt: true, standalone: true })).toBeNull();
  });
});

describe('dismissHomeScreen', () => {
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    memory.clear();
  });

  it('remembers a single dismissal', () => {
    expect(isHomeScreenDismissed()).toBe(false);
    dismissHomeScreen();
    expect(isHomeScreenDismissed()).toBe(true);
    expect(memory.get(HOME_SCREEN_DISMISS_KEY)).toBe('1');
  });
});
