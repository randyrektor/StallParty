import React from 'react';

interface AppShellProps {
  title?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  width?: 'wide' | 'narrow';
  showHeader?: boolean;
  center?: boolean;
  onHome?: () => void;
}

function HomeMark() {
  return (
    <svg className="btn-home-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.4 3.5 11h2.2v8.2c0 .5.4.9.9.9H10v-5.6h4V20.1h3.4c.5 0 .9-.4.9-.9V11h2.2L12 3.4Z"
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
}: AppShellProps) {
  const bodyInner = `app-shell-inner app-shell-inner--${width}`;
  const headerInner = 'app-shell-inner app-shell-inner--wide';
  return (
    <div className={`app-shell${showHeader ? '' : ' app-shell--no-header'}`}>
      {showHeader && (
        <header className="app-shell-header">
          <div className={headerInner}>
            <div className="app-shell-side">
              {onHome && (
                <button type="button" className="btn btn-ghost btn-home" onClick={onHome} aria-label="Home">
                  <HomeMark />
                  <span className="label-full">Home</span>
                </button>
              )}
              {left}
            </div>
            <h1 className="app-shell-title">{title}</h1>
            <div className="app-shell-side app-shell-side--end">{right}</div>
          </div>
        </header>
      )}
      <main className={`${bodyInner} app-shell-body${center ? ' app-shell-body--center' : ''}`}>
        {children}
      </main>
    </div>
  );
}
