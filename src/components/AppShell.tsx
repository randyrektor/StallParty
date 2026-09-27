import React from 'react';
import type { Theme } from '../types';

interface AppShellProps {
  title?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  width?: 'wide' | 'narrow';
  showHeader?: boolean;
  center?: boolean;
  onHome?: () => void;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  onSettings?: () => void;
}

function HomeMark() {
  return (
    <svg className="btn-icon-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.4 3.5 11h2.2v8.2c0 .5.4.9.9.9H10v-5.6h4V20.1h3.4c.5 0 .9-.4.9-.9V11h2.2L12 3.4Z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="btn-icon-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="btn-icon-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 2.4a8.8 8.8 0 1 0 7.1 12.2A7.2 7.2 0 0 1 14.5 2.4Z"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="btn-icon-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0-.1 1.5 7.7 7.7 0 0 0 .1 1.5l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}

export function AppShell({
  title,
  left,
  right,
  children,
  width = 'wide',
  showHeader = true,
  center = false,
  onHome,
  theme = 'dark',
  onThemeChange,
  onSettings,
}: AppShellProps) {
  const bodyInner = `app-shell-inner app-shell-inner--${width}`;
  const headerInner = 'app-shell-inner app-shell-inner--wide';
  return (
    <div className={`app-shell${showHeader ? '' : ' app-shell--no-header'}`}>
      {showHeader && (
        <header className={`app-shell-header${title ? '' : ' app-shell-header--untitled'}`}>
          <div className={headerInner}>
            <div className="app-shell-side">
              {onHome && (
                <button type="button" className="btn btn-ghost btn-icon btn-home" onClick={onHome} aria-label="Home">
                  <HomeMark />
                </button>
              )}
              {left}
            </div>
            {title ? <h1 className="app-shell-title">{title}</h1> : null}
            <div className="app-shell-side app-shell-side--end">
              {right}
              {onThemeChange && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
                  onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
                >
                  {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>
              )}
              {onSettings && (
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Settings" onClick={onSettings}>
                  <GearIcon />
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      <main className={`${bodyInner} app-shell-body${center ? ' app-shell-body--center' : ''}`}>
        {children}
      </main>
    </div>
  );
}
