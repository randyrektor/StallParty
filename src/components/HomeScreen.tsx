import React, { useEffect, useRef, useState } from 'react';
import { APP_NAME, COLORS, THEME } from '../constants';
import { AppShell } from './AppShell';
import {
  loadRecentTeams,
  rememberRecentTeam,
  removeRecentTeam,
  saveRecentTeams,
} from '../utils/recentTeams';
import { deleteRosterForTeam } from '../utils/rosterStorage';
import { capitalizeNameInput } from '../utils/capitalizeName';

interface HomeGame {
  id: string;
  title: string;
  teams: string;
  score: string;
  ended?: boolean;
}

interface HomeScreenProps {
  onStart: (teamName: string) => void;
  onResume?: () => void;
  onForgetResume?: () => void;
  resumeGame?: { teams: string; score: string } | null;
  onForgetTeam?: (teamName: string) => void;
  archivedGames?: HomeGame[];
  onContinueGame?: (id: string) => void;
  onForgetGame?: (id: string) => void;
  pastOpen?: boolean;
  onOpenPast?: () => void;
  onClosePast?: () => void;
}

const HOLD_MS = 800;

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="home-remove" aria-label={label} onClick={onRemove}>
      ×
    </button>
  );
}

function HoldButton({
  className,
  onPress,
  onHold,
  children,
}: {
  className: string;
  onPress: () => void;
  onHold: () => void;
  children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const holdFired = useRef(false);
  const [holding, setHolding] = useState(false);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const endPress = () => {
    clearTimer();
    setHolding(false);
  };

  const triggerHold = () => {
    if (holdFired.current) return;
    holdFired.current = true;
    endPress();
    suppressClick.current = true;
    onHold();
  };

  return (
    <button
      type="button"
      className={`${className}${holding ? ' is-holding' : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        holdFired.current = false;
        suppressClick.current = false;
        setHolding(true);
        clearTimer();
        timer.current = window.setTimeout(triggerHold, HOLD_MS);
      }}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(event) => {
        event.preventDefault();
        triggerHold();
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export function HomeScreen({
  onStart,
  onResume,
  onForgetResume,
  resumeGame,
  onForgetTeam,
  archivedGames = [],
  onContinueGame,
  onForgetGame,
  pastOpen = false,
  onOpenPast,
  onClosePast,
}: HomeScreenProps) {
  const [teamName, setTeamName] = useState('');
  const [savedTeams, setSavedTeams] = useState<string[]>([]);
  const [startingNew, setStartingNew] = useState(false);
  const [removing, setRemoving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSavedTeams(loadRecentTeams());
  }, []);

  const handleStart = () => {
    if (!teamName.trim()) return;

    const trimmedName = capitalizeNameInput(teamName.trim());
    const updatedTeams = rememberRecentTeam(savedTeams, trimmedName);
    saveRecentTeams(updatedTeams);
    setSavedTeams(updatedTeams);

    onStart(trimmedName);
  };

  const handleSelectTeam = (name: string) => {
    setTeamName(name);
  };

  const handleRemoveTeam = (name: string) => {
    const updatedTeams = removeRecentTeam(savedTeams, name);
    saveRecentTeams(updatedTeams);
    deleteRosterForTeam(name);
    onForgetTeam?.(name);
    setSavedTeams(updatedTeams);
    if (teamName === name) setTeamName('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStart();
    }
  };

  const endedGames = archivedGames.filter((game) => game.ended);
  const openActions: {
    key: string;
    label: string;
    name: string;
    score: string;
    onClick: () => void;
    onForget: () => void;
  }[] = [];
  if (onResume && resumeGame) {
    openActions.push({
      key: 'resume',
      label: `Continue ${resumeGame.teams}`,
      name: resumeGame.teams,
      score: resumeGame.score,
      onClick: onResume,
      onForget: () => onForgetResume?.(),
    });
  }
  for (const game of archivedGames) {
    if (game.ended) continue;
    openActions.push({
      key: game.id,
      label: `Continue ${game.teams}`,
      name: game.title,
      score: game.score,
      onClick: () => onContinueGame?.(game.id),
      onForget: () => onForgetGame?.(game.id),
    });
  }
  const hasOpenGame = openActions.length > 0;
  const showSetup = !hasOpenGame || startingNew;

  useEffect(() => {
    setRemoving(false);
  }, [pastOpen]);

  useEffect(() => {
    if (!removing) return;
    const rows = pastOpen
      ? endedGames.length
      : openActions.length + (showSetup ? savedTeams.length : 0);
    if (rows === 0) setRemoving(false);
  }, [removing, pastOpen, endedGames.length, openActions.length, savedTeams.length, showSetup]);

  useEffect(() => {
    const input = nameRef.current;
    if (!input) return;

    const reveal = () => {
      const scroller = input.closest('.app-shell-body');
      if (!(scroller instanceof HTMLElement)) return;
      const keyboard = document.documentElement.hasAttribute('data-keyboard');
      if (document.activeElement !== input || !keyboard) {
        scroller.scrollTop = 0;
        return;
      }
      const target = input.closest('.home-setup') ?? input;
      if (!(target instanceof HTMLElement)) return;
      const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollTop += delta - 12;
    };

    const schedule = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(reveal);
      });
    };

    input.addEventListener('focus', schedule);
    const view = window.visualViewport;
    view?.addEventListener('resize', schedule);
    view?.addEventListener('scroll', schedule);
    return () => {
      input.removeEventListener('focus', schedule);
      view?.removeEventListener('resize', schedule);
      view?.removeEventListener('scroll', schedule);
    };
  }, [showSetup]);

  const cancelNewGame = () => {
    setStartingNew(false);
    setTeamName('');
  };

  if (pastOpen) {
    return (
      <AppShell
        title="Past games"
        width="narrow"
        left={
          <button type="button" className="btn btn-ghost" onClick={onClosePast}>
            ← Back
          </button>
        }
        right={
          removing ? (
            <button type="button" className="btn btn-primary" onClick={() => setRemoving(false)}>
              Done
            </button>
          ) : undefined
        }
      >
        {endedGames.length === 0 ? (
          <p className="home-empty">No past games</p>
        ) : (
          <div className="home-past-list">
            {endedGames.map((game) => (
              <div key={game.id} className={`home-row${removing ? ' is-removing' : ''}`}>
                <HoldButton
                  className="recent-team archive-game"
                  onPress={() => {
                    if (removing) return;
                    onContinueGame?.(game.id);
                  }}
                  onHold={() => setRemoving(true)}
                >
                  <span>{game.title}</span>
                  <span className="archive-game-score">{game.score}</span>
                </HoldButton>
                {removing && (
                  <RemoveButton label={`Remove ${game.title}`} onRemove={() => onForgetGame?.(game.id)} />
                )}
              </div>
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell showHeader={false} width="narrow" center>
      <div className="shell-card home-card">
        <div className="home-card-body">
          <h1 className="home-title" style={styles.title}>{APP_NAME}</h1>
          <p style={styles.subtitle}>Ultimate frisbee scorekeeper</p>

          {removing && (
            <div className="home-remove-bar">
              <button type="button" className="btn btn-primary" onClick={() => setRemoving(false)}>
                Done
              </button>
            </div>
          )}

          {hasOpenGame && (
            <div className="home-open-list">
              {openActions.map((action, index) => (
                <div key={action.key} className={`home-row${removing ? ' is-removing' : ''}`}>
                  <HoldButton
                    className={
                      index === 0
                        ? 'btn btn-primary home-continue'
                        : 'btn home-continue home-continue-secondary'
                    }
                    onPress={() => {
                      if (removing) return;
                      action.onClick();
                    }}
                    onHold={() => setRemoving(true)}
                  >
                    <span className="home-continue-label">{action.label}</span>
                    <span className="home-continue-score">{action.score}</span>
                  </HoldButton>
                  {removing && (
                    <RemoveButton label={`Remove ${action.name}`} onRemove={action.onForget} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="home-actions">
          {showSetup && (
            <div className="home-setup">
              <div style={styles.inputSection}>
                <label style={styles.label}>Team name</label>
                <input
                  type="text"
                  value={teamName}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setTeamName(capitalizeNameInput(e.target.value))}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter your team name"
                  className="home-name"
                  style={styles.input}
                  ref={nameRef}
                  autoFocus={hasOpenGame}
                />
              </div>

              {savedTeams.length > 0 && (
                <div style={styles.savedTeamsSection}>
                  <label style={styles.label}>Recent Teams</label>
                  <div style={styles.teamList}>
                    {savedTeams.map((team) => (
                      <div key={team} className={`home-row${removing ? ' is-removing' : ''}`}>
                        <HoldButton
                          className={`recent-team${teamName === team ? ' is-selected' : ''}`}
                          onPress={() => {
                            if (removing) return;
                            handleSelectTeam(team);
                          }}
                          onHold={() => setRemoving(true)}
                        >
                          {team}
                        </HoldButton>
                        {removing && (
                          <RemoveButton label={`Remove ${team}`} onRemove={() => handleRemoveTeam(team)} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showSetup ? (
            <button
              type="button"
              className={hasOpenGame ? 'btn home-quiet' : 'btn btn-primary'}
              onClick={handleStart}
              disabled={!teamName.trim()}
            >
              Start
            </button>
          ) : (
            <button type="button" className="btn home-quiet" onClick={() => setStartingNew(true)}>
              New game
            </button>
          )}

          {showSetup && hasOpenGame && (
            <button type="button" className="home-dismiss" onClick={cancelNewGame}>
              Cancel
            </button>
          )}

          {endedGames.length > 0 && (
            <button type="button" className="home-past" onClick={onOpenPast}>
              <span>Past games</span>
              <span className="home-past-meta">
                <span>{endedGames.length}</span>
                <span aria-hidden="true">›</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '500px',
    padding: '20px',
  },
  card: {
    backgroundColor: THEME.bgPanelStrong,
    borderRadius: '16px',
    padding: '40px',
    border: `1px solid ${THEME.borderStrong}`,
    boxShadow: THEME.shadowModal,
    backdropFilter: 'blur(10px)',
  },
  title: {
    fontWeight: 800,
    color: THEME.text,
    textAlign: 'center',
    margin: '0 0 6px 0',
    letterSpacing: '-0.03em',
  },
  subtitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: THEME.textMuted,
    textAlign: 'center',
    margin: '0 0 28px 0',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  inputSection: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: THEME.text,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    backgroundColor: THEME.bgInputSoft,
    border: `2px solid ${THEME.borderSoft}`,
    borderRadius: '8px',
    color: THEME.text,
    outline: 'none',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
  },
  savedTeamsSection: {
    marginBottom: '24px',
  },
  teamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  teamButton: {
    padding: '12px 16px',
    fontSize: '15px',
    backgroundColor: THEME.bgInputSoft,
    border: `1px solid ${THEME.borderSoft}`,
    borderRadius: '8px',
    color: THEME.text,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
    fontWeight: '500',
  },
};
