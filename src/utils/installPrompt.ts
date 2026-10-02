import { dismissHomeScreen, isAndroidDevice } from './homeScreenInstall';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let listening = false;
let deferred: InstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((listener) => listener());
}

export function hasInstallPrompt(): boolean {
  return deferred != null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isAndroidDevice(navigator.userAgent)) return;
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    dismissHomeScreen();
    notify();
  });
}

export async function promptToInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const pending = deferred;
  if (!pending) return 'unavailable';
  deferred = null;
  notify();
  try {
    await pending.prompt();
    const choice = await pending.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
