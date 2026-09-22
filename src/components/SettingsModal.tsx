import React, { useState, useEffect } from 'react';
import { Player, type LineupSize, type SplitCycle, type Theme } from '../types';
import {
  isSplitCycleAvailable,
  clampOpenCount,
} from '../utils/rotationHelpers';
import { APP_NAME, COPYRIGHT_HOLDER, GITHUB_URL, KOFI_URL, THEME } from '../constants';
import {
  buildScoreReport,
  downloadTextFile,
} from '../utils/scoreReport';
import { shareScoreOgImage } from '../utils/scoreShareImage';
import { QrCode } from './QrCode';
import { type SoftPointCap } from '../utils/softCap';
import { type GameClockTime } from '../utils/gameClock';
import { SoftCapInput } from './SoftCapInput';
import { GameClockInput } from './GameClockInput';
import { capitalizeNameInput } from '../utils/capitalizeName';

/** Compact ratio like "4:2" (open : women-matching). */
function formatRatio(men: number, women: number): string {
  return `${men}:${women}`;
}

const LINEUP_SIZE_OPTIONS: LineupSize[] = [4, 5, 6, 7];
const CYCLE_OPTIONS: { label: string; value: SplitCycle; hint: string }[] = [
  { label: 'Repeating', value: 'same', hint: 'Every point' },
  { label: 'ABBA', value: 'ABBA', hint: 'A B B A' },
  { label: 'AAB', value: 'AAB', hint: 'A A B' },
];

const COLORS = {
  background: THEME.bgPage,
  card: THEME.bgElevated,
  text: THEME.text,
  textSecondary: THEME.textSecondary,
  open: THEME.open,
  women: THEME.women,
  border: THEME.border,
  inputBg: THEME.bgInput,
  inputBorder: THEME.border,
  button: THEME.open,
  buttonHover: THEME.openStrong,
  danger: THEME.danger,
  success: THEME.success,
};

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  team1Name: string;
  team2Name: string;
  onTeam1NameChange: (name: string) => void;
  onTeam2NameChange: (name: string) => void;
  startingOpen: number;
  onStartingOpenChange: (open: number) => void;
  lineupSize: LineupSize;
  onLineupSizeChange: (size: LineupSize) => void;
  splitCycle: SplitCycle;
  onSplitCycleChange: (cycle: SplitCycle) => void;
  softCap: SoftPointCap;
  onSoftCapChange: (cap: SoftPointCap) => void;
  halfAt: GameClockTime;
  onHalfAtChange: (time: GameClockTime) => void;
  endAt: GameClockTime;
  onEndAtChange: (time: GameClockTime) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onReset: () => void;
  onChangeTeam?: () => void;
  onEndGame?: () => void;
  hasPoints?: boolean;
  tagGoalsLive?: boolean;
  onTagGoalsLiveChange?: (enabled: boolean) => void;
  spectatorLink?: string;
  teamSpectatorLink?: string;
  // Export functionality props
  team1Score: number;
  team2Score: number;
  pointNumber: number;
  lineIndex: number;
  currentLine: Player[];
  nextLine?: Player[];
  pendingPlayers: Player[];
  roster: Player[];
  masterOpenQueue?: Player[];
  masterWomenQueue?: Player[];
  scoreHistory?: { team: 1 | 2; pointNumber: number }[];
}

export function SettingsModal({
  visible,
  onClose,
  team1Name,
  team2Name,
  onTeam1NameChange,
  onTeam2NameChange,
  startingOpen,
  onStartingOpenChange,
  lineupSize,
  onLineupSizeChange,
  splitCycle,
  onSplitCycleChange,
  softCap,
  onSoftCapChange,
  halfAt,
  onHalfAtChange,
  endAt,
  onEndAtChange,
  theme,
  onThemeChange,
  onReset,
  onChangeTeam,
  onEndGame,
  hasPoints = false,
  tagGoalsLive = false,
  onTagGoalsLiveChange,
  spectatorLink = '',
  teamSpectatorLink = '',
  team1Score,
  team2Score,
  pointNumber,
  lineIndex,
  currentLine,
  nextLine = [],
  pendingPlayers,
  roster,
  masterOpenQueue = [],
  masterWomenQueue = [],
  scoreHistory = [],
}: SettingsModalProps) {
  const [localTeam1Name, setLocalTeam1Name] = useState(team1Name);
  const [localTeam2Name, setLocalTeam2Name] = useState(team2Name);
  const [localStartingOpen, setLocalStartingOpen] = useState(startingOpen);
  const [localLineupSize, setLocalLineupSize] = useState<LineupSize>(lineupSize);
  const [localSplitCycle, setLocalSplitCycle] = useState<SplitCycle>(splitCycle);
  const [localSoftCap, setLocalSoftCap] = useState<SoftPointCap>(softCap);
  const [localHalfAt, setLocalHalfAt] = useState<GameClockTime>(halfAt);
  const [localEndAt, setLocalEndAt] = useState<GameClockTime>(endAt);
  const [localTheme, setLocalTheme] = useState<Theme>(theme);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [spectatorAudience, setSpectatorAudience] = useState<'opponents' | 'team'>('opponents');

  useEffect(() => {
    if (visible) setSpectatorAudience('opponents');
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setLocalTeam1Name(team1Name);
    setLocalTeam2Name(team2Name);
    setLocalStartingOpen(startingOpen);
    setLocalLineupSize(lineupSize);
    setLocalSplitCycle(splitCycle);
    setLocalSoftCap(softCap);
    setLocalHalfAt(halfAt);
    setLocalEndAt(endAt);
    setLocalTheme(theme);
  }, [visible, team1Name, team2Name, startingOpen, lineupSize, splitCycle, softCap, halfAt, endAt, theme]);

  // Apply the chosen theme live as the user toggles, so they can see contrast
  // before saving. Reverts on cancel via handleCancel.
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.theme = localTheme;
  }, [localTheme, visible]);

  useEffect(() => {
    if (!isSplitCycleAvailable(localLineupSize, localStartingOpen, localSplitCycle)) {
      setLocalSplitCycle('same');
    }
  }, [localLineupSize, localStartingOpen, localSplitCycle]);

  const handleSave = () => {
    onTeam1NameChange(localTeam1Name);
    onTeam2NameChange(localTeam2Name);
    const open = clampOpenCount(localStartingOpen, localLineupSize);
    onLineupSizeChange(localLineupSize);
    onStartingOpenChange(open);
    onSplitCycleChange(
      isSplitCycleAvailable(localLineupSize, open, localSplitCycle) ? localSplitCycle : 'same'
    );
    onSoftCapChange(localSoftCap);
    onHalfAtChange(localHalfAt);
    onEndAtChange(localEndAt);
    onThemeChange(localTheme);
    onClose();
  };

  const handleCancel = () => {
    setLocalTeam1Name(team1Name);
    setLocalTeam2Name(team2Name);
    setLocalStartingOpen(startingOpen);
    setLocalLineupSize(lineupSize);
    setLocalSplitCycle(splitCycle);
    setLocalSoftCap(softCap);
    setLocalHalfAt(halfAt);
    setLocalEndAt(endAt);
    setLocalTheme(theme);
    // Revert any live theme preview from the modal.
    document.documentElement.dataset.theme = theme;
    onClose();
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset the game? This will clear all scores and line history.')) {
      onReset();
      onClose();
    }
  };

  const handleChangeTeam = () => {
    if (window.confirm('Change team? A game with points is kept on the homepage.')) {
      onReset();
      if (onChangeTeam) {
        onChangeTeam();
      }
      onClose();
    }
  };

  const handleEndGame = () => {
    setConfirmEnd(true);
  };

  const reportText = buildScoreReport({
    team1Name,
    team2Name,
    team1Score,
    team2Score,
    pointNumber,
    lineupSize,
    startingOpen,
    splitCycle,
    softCap,
    roster,
    masterOpenQueue,
    masterWomenQueue,
    currentLine,
    scoreHistory,
  });

  const handleExportScore = () => {
    const gameDate = new Date().toLocaleDateString();
    downloadTextFile(`stallparty-${gameDate}-${team1Name}-vs-${team2Name}.txt`, reportText);
  };

  const handleShareScore = () => {
    void shareScoreOgImage({
      team1Name,
      team2Name,
      team1Score,
      team2Score,
    });
  };

  const showingTeam = spectatorAudience === 'team' && !!teamSpectatorLink;
  const activeSpectatorLink = showingTeam ? teamSpectatorLink : spectatorLink;

  const handleShareSpectatorLink = () => {
    if (!activeSpectatorLink || typeof navigator.share !== 'function') return;
    void navigator.share({
      title: `${team1Name} vs ${team2Name}`,
      text: showingTeam ? `Line and score on ${APP_NAME}` : `Live score on ${APP_NAME}`,
      url: activeSpectatorLink,
    });
  };

  if (!visible) return null;

  const openCount = clampOpenCount(localStartingOpen, localLineupSize);
  const womenCount = localLineupSize - openCount;

  return (
    <div className="settings-overlay" style={styles.overlay} onClick={handleCancel}>
      <div className="settings-modal" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header" style={styles.header}>
          <div>
            <h2 style={styles.title}>Settings</h2>
          </div>
          <div style={styles.headerActions}>
            <div
              role="group"
              aria-label="Theme"
              className="segmented-toggle"
              style={styles.themeSegmented}
            >
              <button
                type="button"
                aria-pressed={localTheme === 'dark'}
                style={{
                  ...styles.themeSegment,
                  ...(localTheme === 'dark' ? styles.themeSegmentActive : {}),
                }}
                onClick={() => setLocalTheme('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                aria-pressed={localTheme === 'light'}
                style={{
                  ...styles.themeSegment,
                  ...(localTheme === 'light' ? styles.themeSegmentActive : {}),
                }}
                onClick={() => setLocalTheme('light')}
              >
                Light
              </button>
            </div>
            <button style={styles.closeButton} onClick={onClose} aria-label="Close settings">
              ✕
            </button>
          </div>
        </div>

        <div style={styles.content}>
          <div className="settings-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Teams</h3>
            </div>
            <div style={styles.cardContent}>
              <div className="settings-teams-row" style={styles.teamsRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Us</label>
                  <input
                    style={styles.input}
                    type="text"
                    value={localTeam1Name}
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => setLocalTeam1Name(capitalizeNameInput(e.target.value))}
                    placeholder="Your team"
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Opponent</label>
                  <input
                    style={styles.input}
                    type="text"
                    value={localTeam2Name}
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => setLocalTeam2Name(capitalizeNameInput(e.target.value))}
                    placeholder="Opponent"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Line</h3>
            </div>
            <div style={styles.cardContent}>
              <label style={styles.label}>Players per point</label>
              <div className="line-setup-pills" style={{ marginBottom: 16 }}>
                {LINEUP_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`line-setup-pill${localLineupSize === n ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocalLineupSize(n);
                      setLocalStartingOpen((open) => clampOpenCount(open, n));
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label style={styles.label}>Starting split</label>
              <div style={styles.splitStepper}>
                <button
                  type="button"
                  aria-label="+ Open"
                  style={{
                    ...styles.splitStepButton,
                    ...styles.splitStepButtonOpen,
                    ...(openCount >= localLineupSize ? styles.splitStepButtonDisabled : {}),
                  }}
                  disabled={openCount >= localLineupSize}
                  onClick={() => setLocalStartingOpen(Math.min(localLineupSize, openCount + 1))}
                >
                  + Open
                </button>
                <div style={styles.splitValue}>
                  <span style={styles.splitRatio}>{formatRatio(openCount, womenCount)}</span>
                </div>
                <button
                  type="button"
                  aria-label="+ Women"
                  style={{
                    ...styles.splitStepButton,
                    ...styles.splitStepButtonWomen,
                    ...(openCount <= 0 ? styles.splitStepButtonDisabled : {}),
                  }}
                  disabled={openCount <= 0}
                  onClick={() => setLocalStartingOpen(Math.max(0, openCount - 1))}
                >
                  + Women
                </button>
              </div>
              <label style={{ ...styles.label, marginTop: 16 }}>Cycle</label>
              <div className="line-setup-pills">
                {CYCLE_OPTIONS.map((opt) => {
                  const cycleLocked = !isSplitCycleAvailable(localLineupSize, openCount, opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`line-setup-pill${localSplitCycle === opt.value ? ' is-active' : ''}`}
                      disabled={cycleLocked}
                      aria-disabled={cycleLocked}
                      title={opt.hint}
                      onClick={() => {
                        if (cycleLocked) return;
                        setLocalSplitCycle(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="settings-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Game</h3>
            </div>
            <div style={styles.cardContent}>
              <div className="settings-clocks">
                <label className="settings-clock" htmlFor="settings-soft-cap">
                  <span>Score to</span>
                  <SoftCapInput
                    id="settings-soft-cap"
                    value={localSoftCap}
                    onChange={setLocalSoftCap}
                  />
                </label>
                <label className="settings-clock" htmlFor="settings-half-at">
                  <span>Half at</span>
                  <GameClockInput
                    id="settings-half-at"
                    value={localHalfAt}
                    onChange={setLocalHalfAt}
                    ariaLabel="Halftime reminder"
                  />
                </label>
                <label className="settings-clock" htmlFor="settings-end-at">
                  <span>End at</span>
                  <GameClockInput
                    id="settings-end-at"
                    value={localEndAt}
                    onChange={setLocalEndAt}
                    ariaLabel="Game end reminder"
                  />
                </label>
              </div>
              <div style={styles.matchAdmin}>
                {onTagGoalsLiveChange && (
                  <button
                    type="button"
                    style={{
                      ...styles.compactAction,
                      ...(tagGoalsLive ? styles.compactActionOn : {}),
                    }}
                    aria-pressed={tagGoalsLive}
                    onClick={() => onTagGoalsLiveChange(!tagGoalsLive)}
                  >
                    {tagGoalsLive ? 'Tagging our goals' : 'Tag our goals as we go'}
                  </button>
                )}
                {onChangeTeam && (
                  <button type="button" style={styles.compactAction} onClick={handleChangeTeam}>
                    Change team
                  </button>
                )}
                {onEndGame && (
                  <button type="button" style={styles.compactAction} onClick={handleEndGame}>
                    End game
                  </button>
                )}
                <button type="button" style={styles.compactActionDanger} onClick={handleReset}>
                  Reset game
                </button>
              </div>
            </div>
          </div>

          <div className="settings-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Share</h3>
            </div>
            <div style={styles.cardContent}>
              <div style={styles.exportActions}>
                <button type="button" style={styles.exportAction} onClick={handleShareScore}>
                  <span style={styles.exportActionTitle}>Share score</span>
                  <span style={styles.exportActionHint}>PNG of the current board</span>
                </button>
                <button type="button" style={styles.exportAction} onClick={handleExportScore}>
                  <span style={styles.exportActionTitle}>Download stats</span>
                  <span style={styles.exportActionHint}>Point log, roster, and rotation (.txt)</span>
                </button>
              </div>
            </div>
          </div>

          <div className="settings-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Spectators</h3>
            </div>
            <div style={styles.cardContent}>
              {teamSpectatorLink && (
                <div role="group" aria-label="Who is scanning" className="segmented-toggle" style={{ ...styles.themeSegmented, marginBottom: 12 }}>
                  <button
                    type="button"
                    aria-pressed={spectatorAudience === 'opponents'}
                    style={{
                      ...styles.themeSegment,
                      ...(spectatorAudience === 'opponents' ? styles.themeSegmentActive : {}),
                    }}
                    onClick={() => setSpectatorAudience('opponents')}
                  >
                    Opponents
                  </button>
                  <button
                    type="button"
                    aria-pressed={spectatorAudience === 'team'}
                    style={{
                      ...styles.themeSegment,
                      ...(spectatorAudience === 'team' ? styles.themeSegmentActive : {}),
                    }}
                    onClick={() => setSpectatorAudience('team')}
                  >
                    Team
                  </button>
                </div>
              )}
              <p style={styles.spectatorHint}>
                {showingTeam
                  ? 'Same score, plus the current and next line. Only share this with teammates.'
                  : 'Score, point, and gender split. Player names stay on this phone.'}
              </p>
              {activeSpectatorLink && (
                <QrCode
                  value={activeSpectatorLink}
                  label={showingTeam ? 'Team QR code' : 'Opponents QR code'}
                />
              )}
              {typeof navigator.share === 'function' && activeSpectatorLink && (
                <div style={styles.compactActions}>
                  <button type="button" style={styles.compactAction} onClick={handleShareSpectatorLink}>
                    {showingTeam ? 'Share team link' : 'Share opponents link'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="settings-about" style={styles.about}>
            <p style={styles.aboutCopy}>
              {APP_NAME} · © {new Date().getFullYear()} {COPYRIGHT_HOLDER}
            </p>
            <div className="settings-about-links" style={styles.aboutLinks}>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.aboutLink}
              >
                GitHub
              </a>
              <a
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.aboutLink}
              >
                Support on Ko-fi
              </a>
            </div>
          </div>
        </div>

        {confirmEnd && (
          <div className="confirm-overlay" role="presentation" onClick={() => setConfirmEnd(false)}>
            <div
              className="confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="end-game-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="end-game-title" className="confirm-title">
                End game
              </h3>
              <p className="confirm-copy">
                {hasPoints
                  ? 'Save this game on the homepage and leave the scoreboard.'
                  : 'Leave this game. No points were scored, so it will not be saved.'}
              </p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setConfirmEnd(false);
                    onEndGame?.();
                    onClose();
                  }}
                >
                  End game
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="settings-footer" style={styles.footer}>
          <button style={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
          <button style={styles.saveButton} onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: THEME.bgOverlay,
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: THEME.shadowModal,
    border: `1px solid ${THEME.borderSofter}`,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '20px 24px 16px',
    borderBottom: `1px solid ${THEME.borderSoftest}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    color: COLORS.text,
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  themeSegmented: {
    display: 'inline-flex',
    padding: '3px',
    backgroundColor: THEME.bgSubtle2,
    border: `1px solid ${THEME.borderFaint}`,
    borderRadius: '999px',
  },
  themeSegment: {
    appearance: 'none',
    WebkitAppearance: 'none',
    border: 'none',
    // Longhand only. Clearing a shorthand leaves the native white button fill.
    backgroundColor: 'transparent',
    color: COLORS.textSecondary,
    fontSize: '12px',
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease',
    outline: 'none',
  },
  themeSegmentActive: {
    backgroundColor: THEME.bgElevated,
    color: COLORS.text,
    boxShadow: THEME.shadowButton,
  },
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: COLORS.textSecondary,
    fontSize: '24px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    lineHeight: 1,
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: '16px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  card: {
    backgroundColor: THEME.bgSubtle3,
    borderRadius: 'var(--settings-card-radius)',
    marginBottom: '12px',
    border: `1px solid ${THEME.borderFaint}`,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '10px 16px',
    borderBottom: `1px solid ${THEME.borderFaint}`,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: '14px',
    fontWeight: '600',
    margin: 0,
  },
  cardContent: {
    padding: '14px 16px',
  },
  teamsRow: {
    display: 'grid',
    gap: '12px',
  },
  inputGroup: {
    marginBottom: 0,
  },
  label: {
    display: 'block',
    color: COLORS.textSecondary,
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: COLORS.inputBg,
    border: `1.5px solid ${COLORS.inputBorder}`,
    borderRadius: 'var(--settings-control-radius)',
    color: COLORS.text,
    fontSize: '15px',
    boxSizing: 'border-box',
    transition: 'all 0.2s ease',
    outline: 'none',
  },
  splitStepper: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    gap: '10px',
    alignItems: 'center',
  },
  splitStepButton: {
    padding: '14px 10px',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    color: COLORS.text,
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: 1.2,
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  splitStepButtonOpen: {
    backgroundColor: COLORS.open,
    color: THEME.textOnAccent,
    border: 'none',
  },
  splitStepButtonWomen: {
    backgroundColor: COLORS.women,
    color: THEME.textOnAccent,
    border: 'none',
  },
  splitStepButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  splitValue: {
    textAlign: 'center',
    minWidth: '72px',
    padding: '0 4px',
  },
  splitRatio: {
    display: 'block',
    color: COLORS.text,
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    fontVariantNumeric: 'tabular-nums',
  },
  cycleRow: {
    display: 'grid',
    gap: '10px',
  },
  cycleButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
  },
  cycleButtonDisabledText: {
    color: COLORS.textSecondary,
  },
  ratioLabel: {
    color: COLORS.text,
    fontSize: '15px',
    fontWeight: '600',
    display: 'block',
    marginBottom: '4px',
  },
  ratioDescription: {
    display: 'block',
    color: COLORS.textSecondary,
    fontSize: '12px',
    lineHeight: 1.35,
    fontWeight: 400,
  },
  lineupSizeRow: {
    display: 'grid',
    gap: '10px',
  },
  lineupSizeButton: {
    padding: '14px 12px',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    color: COLORS.text,
    fontSize: '18px',
    fontWeight: 700,
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  lineupSizeButtonActive: {
    backgroundColor: THEME.openTint,
    border: `1.5px solid ${COLORS.open}`,
    outline: 'none',
  },
  themeToggleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  themeButton: {
    padding: '14px 12px',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'center',
  },
  themeButtonActive: {
    backgroundColor: THEME.openTint,
    border: `1.5px solid ${COLORS.open}`,
  },
  themeButtonLabel: {
    color: COLORS.text,
    fontSize: '15px',
    fontWeight: 700,
  },
  compactActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  matchAdmin: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '16px',
    paddingTop: '14px',
    borderTop: `1px solid ${THEME.borderFaint}`,
  },
  exportActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  exportAction: {
    appearance: 'none',
    width: '100%',
    padding: '12px 14px',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    color: COLORS.text,
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  exportActionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: COLORS.text,
  },
  exportActionHint: {
    fontSize: '12px',
    fontWeight: 500,
    color: COLORS.textSecondary,
    lineHeight: 1.35,
  },
  compactAction: {
    flex: '1 1 auto',
    padding: '12px 14px',
    backgroundColor: THEME.bgSubtle3,
    border: `1.5px solid ${THEME.borderSofter}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    color: COLORS.text,
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    textAlign: 'center',
    display: 'inline-block',
    boxSizing: 'border-box',
  },
  compactActionOn: {
    backgroundColor: THEME.openTint,
    borderColor: THEME.open,
    color: COLORS.text,
  },
  spectatorHint: {
    margin: '0 0 12px',
    fontSize: '13px',
    color: COLORS.textSecondary,
    lineHeight: 1.4,
  },
  compactActionDanger: {
    flex: '1 1 auto',
    padding: '12px 14px',
    backgroundColor: THEME.dangerTint,
    border: `1.5px solid ${THEME.dangerBorder}`,
    borderRadius: 'var(--settings-control-radius)',
    cursor: 'pointer',
    color: COLORS.danger,
    fontSize: '14px',
    fontWeight: 600,
  },
  about: {
    marginTop: '8px',
    padding: '12px 8px 4px',
    textAlign: 'center',
  },
  aboutCopy: {
    margin: '0 0 8px',
    fontSize: '12px',
    color: COLORS.textSecondary,
    lineHeight: 1.4,
  },
  aboutLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  aboutLink: {
    color: COLORS.open,
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  footer: {
    padding: '16px 24px',
    borderTop: `1px solid ${THEME.borderSoftest}`,
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '14px 28px',
    backgroundColor: THEME.bgSubtle2,
    color: COLORS.text,
    border: 'none',
    borderRadius: 'var(--settings-control-radius)',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  saveButton: {
    padding: '14px 32px',
    backgroundColor: COLORS.button,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: 'var(--settings-control-radius)',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: THEME.shadowCta,
  },
};
