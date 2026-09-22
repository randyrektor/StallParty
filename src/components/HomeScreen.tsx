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

interface HomeScreenProps {
  onStart: (teamName: string) => void;
  onResume?: () => void;
  resumeLabel?: string | null;
  onForgetTeam?: (teamName: string) => void;
  archivedGames?: { id: string; title: string; teams: string; score: string; ended?: boolean }[];
  onContinueGame?: (id: string) => void;
  onForgetGame?: (id: string) => void;
}

const HOLD_MS = 600;
const VISIBLE_GAMES = 6;

function fitVisibleGames(list: HTMLDivElement) {
  const row = list.querySelector('button');
  if (!row) return;
  const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
  const height = row.getBoundingClientRect().height;
  list.style.maxHeight = `${Math.ceil(VISIBLE_GAMES * height + (VISIBLE_GAMES - 1) * gap)}px`;
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
  resumeLabel,
  onForgetTeam,
  archivedGames = [],
  onContinueGame,
  onForgetGame,
}: HomeScreenProps) {
  const [teamName, setTeamName] = useState('');
  const [savedTeams, setSavedTeams] = useState<string[]>([]);
  const gameListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedTeams(loadRecentTeams());
  }, []);

  useEffect(() => {
    const list = gameListRef.current;
    if (!list) return;
    const fit = () => fitVisibleGames(list);
    fit();
    const observer = new ResizeObserver(fit);
    const row = list.querySelector('button');
    if (row) observer.observe(row);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [archivedGames]);

  const handleStart = () => {
    if (!teamName.trim()) {
      alert('Please enter a team name');
      return;
    }

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

  const hasOpenGame = archivedGames.some((game) => !game.ended) || Boolean(onResume && resumeLabel);

  return (
    <AppShell showHeader={false} width="narrow" center>
      <div className="shell-card home-card">
          <div className="home-card-body">
          <h1 className="home-title" style={styles.title}>{APP_NAME}</h1>
          <p style={styles.subtitle}>Ultimate frisbee scorekeeper</p>
          
          <div style={styles.inputSection}>
            <label style={styles.label}>Your Team Name</label>
            <input
              type="text"
              value={teamName}
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTeamName(capitalizeNameInput(e.target.value))}
              onKeyPress={handleKeyPress}
              placeholder="Enter your team name"
              style={styles.input}
              autoFocus
            />
          </div>

          {savedTeams.length > 0 && (
            <div style={styles.savedTeamsSection}>
              <label style={styles.label}>
                Recent Teams
                <span className="home-hold-hint">Hold to remove</span>
              </label>
              <div style={styles.teamList}>
                {savedTeams.map((team) => (
                  <HoldButton
                    key={team}
                    className={`recent-team${teamName === team ? ' is-selected' : ''}`}
                    onPress={() => handleSelectTeam(team)}
                    onHold={() => {
                      if (window.confirm(`Remove ${team} from recent teams?`)) {
                        handleRemoveTeam(team);
                      }
                    }}
                  >
                    {team}
                  </HoldButton>
                ))}
              </div>
            </div>
          )}

          {archivedGames.length > 0 && (
            <div style={styles.savedTeamsSection}>
              <label style={styles.label}>
                Games
                <span className="home-hold-hint">Hold to remove</span>
              </label>
              <div ref={gameListRef} className="home-game-list" style={styles.teamList}>
                {archivedGames.map((game) => (
                  <HoldButton
                    key={game.id}
                    className="recent-team archive-game"
                    onPress={() => onContinueGame?.(game.id)}
                    onHold={() => {
                      if (window.confirm(`Delete ${game.title}?`)) {
                        onForgetGame?.(game.id);
                      }
                    }}
                  >
                    <span>{game.ended ? game.title : `Continue ${game.teams}`}</span>
                    <span className="archive-game-score">{game.score}</span>
                  </HoldButton>
                ))}
              </div>
            </div>
          )}
          </div>

          <div className="home-actions">
            {onResume && resumeLabel && (
              <button
                type="button"
                className="btn btn-primary"
                style={styles.startButton}
                onClick={onResume}
              >
                Continue {resumeLabel}
              </button>
            )}

            <button
              type="button"
              className={hasOpenGame ? 'btn btn-ghost' : 'btn btn-primary'}
              style={
                hasOpenGame
                  ? { ...styles.startButton, backgroundColor: 'transparent', color: THEME.text, border: `1.5px solid ${THEME.borderSoft}`, boxShadow: 'none' }
                  : styles.startButton
              }
              onClick={handleStart}
            >
              {hasOpenGame ? 'New game' : 'Continue'}
            </button>
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
  startButton: {
    width: '100%',
    padding: '16px',
    fontSize: '18px',
    fontWeight: 'bold',
    backgroundColor: THEME.open,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: THEME.shadowCta,
  },
};
