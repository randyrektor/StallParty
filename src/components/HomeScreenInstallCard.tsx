import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME } from '../constants';
import {
  devInstallPreview,
  dismissHomeScreen,
  installOffer,
  isAndroidDevice,
  isHomeScreenDismissed,
  isIosDevice,
  type InstallOffer,
} from '../utils/homeScreenInstall';
import { hasInstallPrompt, promptToInstall, subscribeInstallPrompt } from '../utils/installPrompt';

function readStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

function currentOffer(): InstallOffer | null {
  return installOffer({
    dismissed: isHomeScreenDismissed(),
    standalone: readStandalone(),
    ios: isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    android: isAndroidDevice(navigator.userAgent),
    hasPrompt: hasInstallPrompt(),
  });
}

function ShareGlyph() {
  return (
    <svg className="install-share" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.2 6.8 8.4l1.4 1.4L11 7.1V14h2V7.1l2.8 2.7 1.4-1.4L12 3.2zM5 11H3v9h18v-9h-2v7H5v-7z"
      />
    </svg>
  );
}

export function HomeScreenInstallCard() {
  const preview = devInstallPreview();
  const [offer, setOffer] = useState<InstallOffer | null>(() => preview ?? currentOffer());
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview) return;
    return subscribeInstallPrompt(() => setOffer(currentOffer()));
  }, [preview]);

  useEffect(() => {
    if (!offer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [offer]);

  if (!offer) return null;

  const dismiss = () => {
    dismissHomeScreen();
    setOffer(null);
  };

  const add = () => {
    void promptToInstall().then((outcome) => {
      if (outcome === 'accepted' || outcome === 'dismissed') dismiss();
    });
  };

  return createPortal(
    <div className="confirm-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-prompt-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') dismiss();
        }}
      >
        <h3 id="install-prompt-title" className="confirm-title">
          Add {APP_NAME} to your home screen
        </h3>
        {offer === 'ios' ? (
          <p className="confirm-copy">
            Tap <ShareGlyph /> Share, then Add to Home Screen.
          </p>
        ) : (
          <p className="confirm-copy">It opens like an app next time.</p>
        )}
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
            Not now
          </button>
          {offer === 'android' && (
            <button type="button" className="btn btn-primary" onClick={add}>
              Add {APP_NAME}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
