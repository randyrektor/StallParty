import React, { useState, useEffect } from 'react';
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
  archivedGames?: { id: string; title: string; score: string }[];
  onOpenArchive?: (id: string) => void;
}

export function HomeScreen({
  onStart,
  onResume,
  resumeLabel,
  onForgetTeam,
  archivedGames = [],
  onOpenArchive,
}: HomeScreenProps) {
  const [teamName, setTeamName] = useState('');
  const [savedTeams, setSavedTeams] = useState<string[]>([]);

  useEffect(() => {
    setSavedTeams(loadRecentTeams());
  }, []);

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

  return (
    <AppShell showHeader={false} width="narrow" center>
      <div className="shell-card">
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
              <label style={styles.label}>Recent Teams</label>
              <div style={styles.teamList}>
                {savedTeams.map((team) => (
                  <div key={team} className="recent-team-row">
                    <button
                      type="button"
                      className={`recent-team${teamName === team ? ' is-selected' : ''}`}
                      onClick={() => handleSelectTeam(team)}
                    >
                      {team}
                    </button>
                    <button
                      type="button"
                      className="recent-team-remove"
                      aria-label={`Remove ${team} from recent teams`}
                      onClick={() => handleRemoveTeam(team)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {archivedGames.length > 0 && (
            <div style={styles.savedTeamsSection}>
              <label style={styles.label}>Games</label>
              <div style={styles.teamList}>
                {archivedGames.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    className="recent-team archive-game"
                    onClick={() => onOpenArchive?.(game.id)}
                  >
                    <span>{game.title}</span>
                    <span className="archive-game-score">{game.score}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {onResume && resumeLabel && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ ...styles.startButton, marginBottom: 12, backgroundColor: 'transparent', color: THEME.text, border: `1.5px solid ${THEME.borderSoft}`, boxShadow: 'none' }}
              onClick={onResume}
            >
              Resume {resumeLabel}
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={styles.startButton}
            onClick={handleStart}
          >
            Continue
          </button>
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
