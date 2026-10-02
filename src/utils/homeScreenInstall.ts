export const HOME_SCREEN_DISMISS_KEY = 'ultimate-home-screen-dismissed';

export type InstallOffer = 'android' | 'ios';

export function isIosDevice(ua: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac, but still adds sites from the Share sheet.
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function isAndroidDevice(ua: string): boolean {
  return /Android/i.test(ua);
}

export function installOffer(input: {
  dismissed: boolean;
  standalone: boolean;
  ios: boolean;
  android: boolean;
  hasPrompt: boolean;
}): InstallOffer | null {
  if (input.dismissed || input.standalone) return null;
  if (input.ios) return 'ios';
  if (input.android && input.hasPrompt) return 'android';
  return null;
}

export function isHomeScreenDismissed(): boolean {
  try {
    return localStorage.getItem(HOME_SCREEN_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissHomeScreen(): void {
  try {
    localStorage.setItem(HOME_SCREEN_DISMISS_KEY, '1');
  } catch {
    // Private mode can block storage. The card can show again next time.
  }
}

/** Dev-only. `?install=ios` or `?install=android` shows the card on a desktop. */
export function devInstallPreview(): InstallOffer | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('install');
  if (value === 'ios' || value === 'android') return value;
  return null;
}
