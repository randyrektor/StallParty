import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Player, type LineupSize, type SplitCycle } from '../types';
import { getGenderPattern, isSplitCycleAvailable } from '../utils/rotationHelpers';
import { getLineSeats } from '../utils/lineRotation';
import { formatSoftCapBadge, isSoftCapReached, type SoftPointCap } from '../utils/softCap';
import {
  activeClockReminder,
  clockReminderCopy,
  type GameClockTime,
} from '../utils/gameClock';
import { useNowTick } from '../hooks/useNowTick';
import { GenderCyclePills } from './GenderCyclePills';
import { THEME } from '../constants';
import { AppShell } from './AppShell';
import { PlayerSeat } from './PlayerSeat';

const COLORS = {
  background: THEME.bgApp,
  card: THEME.bgElevated,
  text: THEME.text,
  textSecondary: THEME.textSecondary,
  open: THEME.open,
  women: THEME.women,
  openMuted: THEME.openMuted,
  womenMuted: THEME.womenMuted,
  border: THEME.border,
  input: THEME.bgInput,
  delete: THEME.danger,
};

function normSubName(name: string): string {
  return name.trim().toLowerCase();
}

function replayScoreFlash(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('score-tile--flash');
  // Force a style recalc so the CSS animation can restart on rapid clicks.
  void el.offsetWidth;
  el.classList.add('score-tile--flash');
}

interface ScoreBoardProps {
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  onTeam1ScoreChange: () => void;
  onTeam2ScoreChange: () => void;
  lineIndex: number;
  pointNumber: number;
  onReset: () => void;
  onUndo: () => void;
  startingOpen?: number;
  lineupSize?: LineupSize;
  splitCycle?: SplitCycle;
  softCap?: SoftPointCap;
  halfAt?: GameClockTime;
  endAt?: GameClockTime;
  setSettingsVisible: (visible: boolean) => void;
  onOpenRoster?: () => void;
  pendingCount?: number;
  roster: Player[];
  openQueue: Player[];
  womanQueue: Player[];
  nextOpenQueue: Player[];
  nextWomanQueue: Player[];
  scoreHistory: any[];
  gameStarted?: boolean;
  onKickoff?: (pulling: 1 | 2) => void;
  onHalfPull?: (pulling: 1 | 2) => void;
  halfActive?: boolean;
  /** A team has been chosen for half, so the button stays closed. */
  halfChosen?: boolean;
  /** Who is already set to pull this point at half, if the captain chose. The modal shows the other team as receiving. */
  halfChoice?: 1 | 2 | null;
  /** Team that received point 1. The other team is the suggested receiver at half. */
  suggestedHalfPull?: 1 | 2 | null;
  onBackToSetup?: () => void;
  onHome?: () => void;
  onSubstitute?: (outPlayer: Player, inPlayer: Player) => void;
  pullLabel?: string | null;
  tagStrip?: {
    pointNumber: number;
    players: Player[];
    scorerId?: string;
    throwerId?: string;
  } | null;
  onTagPlayer?: (playerId: string) => void;
  onDismissTag?: () => void;
  onEndGame?: () => void;
}

export function ScoreBoard({
  team1Name,
  team2Name,
  team1Score,
  team2Score,
  onTeam1ScoreChange,
  onTeam2ScoreChange,
  lineIndex,
  pointNumber,
  onReset,
  onUndo,
  startingOpen = 4,
  lineupSize = 7,
  splitCycle = 'ABBA',
  softCap = null,
  halfAt = null,
  endAt = null,
  setSettingsVisible,
  onOpenRoster,
  pendingCount = 0,
  roster,
  openQueue,
  womanQueue,
  nextOpenQueue,
  nextWomanQueue,
  scoreHistory,
  gameStarted = true,
  onKickoff,
  onHalfPull,
  halfActive = false,
  halfChosen = false,
  halfChoice = null,
  suggestedHalfPull = null,
  onBackToSetup,
  onHome,
  onSubstitute,
  pullLabel = null,
  tagStrip = null,
  onTagPlayer,
  onDismissTag,
  onEndGame,
}: ScoreBoardProps) {
  const [subOut, setSubOut] = useState<Player | null>(null);
  const [halfOpen, setHalfOpen] = useState(false);
  const [dismissedReminder, setDismissedReminder] = useState('');
  const [capPromptDismissed, setCapPromptDismissed] = useState(false);
  const now = useNowTick();
  const team1TileRef = useRef<HTMLButtonElement>(null);
  const team2TileRef = useRef<HTMLButtonElement>(null);

  openQueue = openQueue || [];
  womanQueue = womanQueue || [];
  nextOpenQueue = nextOpenQueue || [];
  nextWomanQueue = nextWomanQueue || [];

  const openPlayers = openQueue;
  const womenPlayers = womanQueue;

  const currentPattern = getGenderPattern(lineIndex, lineupSize, startingOpen, splitCycle);
  const currentSeats = getLineSeats(openPlayers, womenPlayers, currentPattern);

  const nextPattern = getGenderPattern(lineIndex + 1, lineupSize, startingOpen, splitCycle);
  const nextSeats = getLineSeats(nextOpenQueue, nextWomanQueue, nextPattern);

  const capReached = isSoftCapReached(team1Score, team2Score, softCap);
  const showCapPrompt = gameStarted && capReached && !capPromptDismissed;
  const clockReminder = activeClockReminder(halfAt, endAt, new Date(now));
  const reminderKey = clockReminder ? `${clockReminder.kind}:${clockReminder.phase}` : '';

  const subCandidates = subOut
    ? (() => {
        const onFieldSlots = [...openQueue, ...womanQueue];
        const onFieldUuids = new Set(onFieldSlots.map((p) => p.uuid));
        const onFieldGenderNames = new Set(
          onFieldSlots.map((p) => `${p.gender}:${normSubName(p.name)}`)
        );
        return roster.filter((p) => {
          if (p.gender !== subOut.gender) return false;
          if (p.uuid === subOut.uuid) return false;
          if (onFieldUuids.has(p.uuid)) return false;
          if (onFieldGenderNames.has(`${p.gender}:${normSubName(p.name)}`)) return false;
          return true;
        });
      })()
    : [];

  const closeSubPicker = useCallback(() => setSubOut(null), []);

  useEffect(() => {
    if (!capReached) setCapPromptDismissed(false);
  }, [capReached]);

  useEffect(() => {
    if (!subOut && !showCapPrompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showCapPrompt) setCapPromptDismissed(true);
      else closeSubPicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subOut, closeSubPicker, showCapPrompt]);

  const handlePickSubIn = (inPlayer: Player) => {
    if (subOut && onSubstitute) {
      onSubstitute(subOut, inPlayer);
    }
    setSubOut(null);
  };

  const handleScoreClick = (team: 'team1' | 'team2') => {
    if (!gameStarted || capReached) return;
    if (team === 'team1') {
      replayScoreFlash(team1TileRef.current);
      onTeam1ScoreChange();
    } else {
      replayScoreFlash(team2TileRef.current);
      onTeam2ScoreChange();
    }
  };

  return (
    <AppShell
      title={team1Name}
      onHome={onHome}
      left={
        gameStarted ? (
          <>
            <button
              className="btn btn-danger-ghost"
              style={{ opacity: scoreHistory.length === 0 ? 0.45 : 1 }}
              onClick={onUndo}
              disabled={scoreHistory.length === 0}
            >
              Undo
            </button>
            <button className="btn btn-ghost" onClick={() => onOpenRoster?.()}>
              {pendingCount > 0 ? (
                <>
                  <span className="label-full">{`Roster · ${pendingCount} pending`}</span>
                  <span className="label-short">{`Roster (${pendingCount})`}</span>
                </>
              ) : (
                'Roster'
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={halfActive || halfChosen}
              disabled={halfChosen}
              style={halfChosen ? { opacity: 0.45 } : undefined}
              onClick={() => {
                if (!halfChosen) setHalfOpen(true);
              }}
            >
              Halftime
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={onBackToSetup}>
            ← Back
          </button>
        )
      }
      right={
        <button className="btn btn-ghost" onClick={() => setSettingsVisible(true)}>
          Settings
        </button>
      }
    >
    <div className="scoreboard">
      <div className="score-top-bar">
        <div className="score-teams">
          <button
            ref={team1TileRef}
            className="score-tile"
            data-team="team1"
            onClick={() => handleScoreClick('team1')}
            onAnimationEnd={(e) => {
              if (e.animationName === 'scoreFlashOverlay') {
                e.currentTarget.classList.remove('score-tile--flash');
              }
            }}
            aria-disabled={!gameStarted || capReached}
            style={{ opacity: 1, cursor: gameStarted && !capReached ? 'pointer' : 'not-allowed' }}
          >
            <h2 className="score-team-name" style={{ position: 'relative', zIndex: 1 }}>{team1Name}</h2>
            <h1 className="score-num" style={{ position: 'relative', zIndex: 1 }}>{team1Score}</h1>
          </button>
          <button
            ref={team2TileRef}
            className="score-tile"
            data-team="team2"
            onClick={() => handleScoreClick('team2')}
            onAnimationEnd={(e) => {
              if (e.animationName === 'scoreFlashOverlay') {
                e.currentTarget.classList.remove('score-tile--flash');
              }
            }}
            aria-disabled={!gameStarted || capReached}
            style={{ opacity: 1, cursor: gameStarted && !capReached ? 'pointer' : 'not-allowed' }}
          >
            <h2 className="score-team-name" style={{ position: 'relative', zIndex: 1 }}>{team2Name}</h2>
            <h1 className="score-num" style={{ position: 'relative', zIndex: 1 }}>{team2Score}</h1>
          </button>
        </div>
      </div>

      {!gameStarted && (
        <div
          className="confirm-overlay confirm-overlay--soft"
          onClick={onBackToSetup}
          role="presentation"
        >
          <div
            className="confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kickoff-confirm-title"
          >
            <h3 id="kickoff-confirm-title" className="confirm-title">
              Who is receiving?
            </h3>
            <div className="confirm-actions confirm-actions--pull">
              <button type="button" className="btn btn-primary" onClick={() => onKickoff?.(2)}>
                {team1Name}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => onKickoff?.(1)}>
                {team2Name}
              </button>
              <button type="button" className="btn btn-ghost confirm-actions-back" onClick={onBackToSetup}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {halfOpen && !halfChosen && (
        <div
          className="confirm-overlay confirm-overlay--soft"
          onClick={() => setHalfOpen(false)}
          role="presentation"
        >
          <div
            className="confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="half-pull-title"
          >
            <h3 id="half-pull-title" className="confirm-title">
              Who is receiving at half?
            </h3>
            {suggestedHalfPull === 1 || suggestedHalfPull === 2 ? (
              <p className="confirm-copy">
                {suggestedHalfPull === 1 ? team1Name : team2Name} received point 1.
              </p>
            ) : null}
            <div className="confirm-actions confirm-actions--pull">
              {([1, 2] as const).map((side) => {
                const chosenPull = halfChoice ?? suggestedHalfPull;
                const suggestedReceiver = chosenPull === 1 ? 2 : chosenPull === 2 ? 1 : null;
                const suggested = suggestedReceiver == null || suggestedReceiver === side;
                return (
                  <button
                    key={side}
                    type="button"
                    className={`btn ${suggested ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      onHalfPull?.(side === 1 ? 2 : 1);
                      setHalfOpen(false);
                    }}
                  >
                    {side === 1 ? team1Name : team2Name}
                  </button>
                );
              })}
              <button type="button" className="btn btn-ghost confirm-actions-back" onClick={() => setHalfOpen(false)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {showCapPrompt && (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setCapPromptDismissed(true)}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-cap-end-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="score-cap-end-title" className="confirm-title">
              End game?
            </h3>
            <p className="confirm-copy">
              Score cap {softCap} is reached.
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCapPromptDismissed(true)}>
                No
              </button>
              <button type="button" className="btn btn-primary" onClick={() => onEndGame?.()}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="line-info">
        <div className="line-info-row">
          <div className="line-info-point">
            <span>Point {pointNumber}</span>
            {pullLabel && <span className="line-info-pull">{pullLabel}</span>}
            {softCap != null && (
              <span className={`line-info-cap${capReached ? ' is-reached' : ''}`}>
                {formatSoftCapBadge(softCap, capReached)}
              </span>
            )}
          </div>
          {isSplitCycleAvailable(lineupSize, startingOpen, splitCycle) && (
            <GenderCyclePills splitCycle={splitCycle} lineIndex={lineIndex} />
          )}
        </div>
      </div>
      {clockReminder && reminderKey !== dismissedReminder && (
        <div className={`clock-reminder${clockReminder.phase === 'now' ? ' clock-reminder--now' : ''}`}>
          <p className="clock-reminder-copy">{clockReminderCopy(clockReminder)}</p>
          <button
            type="button"
            className="clock-reminder-dismiss"
            onClick={() => setDismissedReminder(reminderKey)}
          >
            Dismiss
          </button>
        </div>
      )}
      {tagStrip && onTagPlayer && (
        <div className="goal-tag" role="group" aria-label={`Tag point ${tagStrip.pointNumber}`}>
          <div className="goal-tag-head">
            <span>Point {tagStrip.pointNumber}</span>
            <span className="goal-tag-hint">Tap scorer, then thrower</span>
            <button type="button" className="btn btn-ghost goal-tag-done" onClick={onDismissTag}>
              Done
            </button>
          </div>
          <div className="goal-tag-names">
            {tagStrip.players.map((player) => {
              const role =
                player.uuid === tagStrip.scorerId
                  ? 'Score'
                  : player.uuid === tagStrip.throwerId
                    ? 'Throw'
                    : null;
              return (
                <button
                  key={player.uuid}
                  type="button"
                  className={`goal-tag-name${role ? ' is-tagged' : ''}`}
                  onClick={() => onTagPlayer(player.uuid)}
                >
                  <span>{player.name}</span>
                  {role && <span className="goal-tag-role">{role}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="line-display">
        <div className="line-section">
          <h3 className="line-title">Current Line</h3>
          <div className="player-list">
            {currentSeats.map((seat, i) => (
              <div
                key={`current-${i}`}
                className="player-seat-row"
              >
                {seat.kind === 'player' ? (
                  <PlayerSeat
                    gender={seat.player.gender}
                    name={seat.player.name}
                    position={seat.player.position}
                  />
                ) : (
                  <PlayerSeat gender={seat.gender} empty />
                )}
                {onSubstitute && gameStarted ? (
                  seat.kind === 'player' ? (
                    <button
                      type="button"
                      className="btn btn-sub"
                      onClick={() => setSubOut(seat.player)}
                      aria-label={`Substitute ${seat.player.name}`}
                    >
                      Sub
                    </button>
                  ) : (
                    <span className="sub-spacer" />
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="line-section">
          <h3 className="line-title">Next Line</h3>
          <div className="player-list">
            {nextSeats.map((seat, i) =>
              seat.kind === 'player' ? (
                <PlayerSeat
                  key={`next-${i}`}
                  gender={seat.player.gender}
                  name={seat.player.name}
                  tone="next"
                />
              ) : (
                <PlayerSeat key={`next-${i}`} gender={seat.gender} empty />
              )
            )}
          </div>
        </div>
      </div>

      {subOut && onSubstitute && (
        <div style={styles.subOverlay} onClick={closeSubPicker} role="presentation">
          <div
            style={styles.subModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sub-modal-title"
          >
            <h4 id="sub-modal-title" style={styles.subModalTitle}>
              Sub out: {subOut.name}
            </h4>
            <p style={styles.subModalHelp}>
              Bench for field (tired / fresh): you swap numbers with {subOut.name} in the
              rotation list—same pointer, two people trade spots. Someone not in the list yet
              takes this slot and {subOut.name} goes to the end. Injury or leaving the game:
              remove them from the roster instead; their slot is deleted and everyone below moves
              up.
            </p>
            <div style={styles.subCandidateList}>
              {subCandidates.length === 0 ? (
                <p style={styles.subModalEmpty}>
                  No eligible subs: every {subOut.gender === 'O' ? 'open' : "women's"}-matching player
                  is already on this line. Add bench players from the roster panel or cancel.
                </p>
              ) : (
                subCandidates.map((p) => (
                  <button
                    key={p.uuid}
                    type="button"
                    style={{
                      ...styles.subCandidateButton,
                      backgroundColor: p.gender === 'O' ? COLORS.open : COLORS.women,
                    }}
                    onClick={() => handlePickSubIn(p)}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
            <button type="button" style={styles.subCancelButton} onClick={closeSubPicker}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 0,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column'
  },
  chromeBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  ghostButton: {
    backgroundColor: THEME.bgSubtle,
    color: COLORS.text,
    border: `1px solid ${THEME.borderSoft}`,
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: 'none',
  },
  undoGhost: {
    color: THEME.danger,
    borderColor: THEME.dangerBorder,
    backgroundColor: THEME.dangerTint,
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: THEME.bgPanel,
    borderRadius: '12px',
    marginBottom: '16px',
    border: `1px solid ${THEME.borderSoft}`,
    boxShadow: THEME.shadowCard,
  },
  scoreContainer: {
    display: 'flex',
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: '17px'
  },
  teamDisplay: {
    textAlign: 'center',
    flex: 1,
    background: THEME.bgSubtle,
    border: '2px solid transparent',
    borderRadius: '12px',
    color: 'inherit',
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minHeight: '72px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  teamName: { 
    margin: 0, 
    fontSize: '15px', 
    fontWeight: '600', 
    color: COLORS.textSecondary,
    marginBottom: '4px',
    letterSpacing: '0.02em',
  },
  score: { 
    margin: 0, 
    fontSize: '52px', 
    fontWeight: 800, 
    color: COLORS.text,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  },
  scoreDiff: {
    fontSize: '22px',
    fontWeight: '700',
    color: COLORS.text,
    padding: '4px 10px',
    backgroundColor: THEME.bgInputSoft,
    borderRadius: '8px',
    minWidth: '40px',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  settingsButton: {
    backgroundColor: COLORS.open,
    color: THEME.textOnAccent,
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: THEME.shadowButton,
    transition: 'background 0.2s, color 0.2s',
  },

  lineInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: THEME.bgPanel,
    borderRadius: '12px',
    marginBottom: '16px',
    border: `1px solid ${THEME.borderSoft}`,
    boxShadow: THEME.shadowCard,
  },
  lineInfoLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  lineInfoText: { fontSize: '15px', fontWeight: '700', color: COLORS.text },
  patternDisplay: { display: 'flex', gap: '6px' },
  patternItem: {
    padding: '4px 10px',
    borderRadius: '6px',
    backgroundColor: THEME.patternPillBg,
  },
  patternItemActive: { backgroundColor: THEME.patternPillActiveBg },
  patternText: { color: THEME.patternPillText, fontSize: '13.5px', fontWeight: 'bold' },
  
  lineDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    flex: 1,
  },
  lineSection: {
    flex: 1,
    backgroundColor: THEME.bgPanel,
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${THEME.borderSoft}`,
    boxShadow: THEME.shadowCard,
  },
  lineTitle: {
    fontSize: '17px',
    fontWeight: 'bold',
    marginBottom: '10px',
    textAlign: 'center',
    color: COLORS.text,
  },
  playerListVertical: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '6px',
    flex: 1
  },
  playerContainer: {
    padding: '10px 12px',
    borderRadius: '8px',
    textAlign: 'center',
  },
  currentLineRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: '6px',
    width: '100%',
    minWidth: 0,
  },
  currentLineNameBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subSideButton: {
    flex: '0 0 44px',
    width: '44px',
    border: `1px solid ${THEME.borderSoft}`,
    borderRadius: '8px',
    backgroundColor: THEME.bgSubtle,
    color: COLORS.textSecondary,
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.02em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 2px',
  },
  subOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: THEME.bgOverlay,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  subModal: {
    backgroundColor: COLORS.card,
    borderRadius: 'var(--sub-modal-radius)',
    padding: 'var(--sub-modal-pad)',
    maxWidth: '360px',
    width: '100%',
    border: `1px solid ${COLORS.border}`,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  subModalTitle: {
    margin: '0 0 8px 0',
    color: COLORS.text,
    fontSize: '17px',
    fontWeight: 700,
  },
  subModalHelp: {
    margin: '0 0 14px 0',
    color: COLORS.textSecondary,
    fontSize: '13px',
    lineHeight: 1.4,
  },
  subModalEmpty: {
    margin: 0,
    color: COLORS.textSecondary,
    fontSize: '13px',
    lineHeight: 1.45,
  },
  subCandidateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: 'min(50vh, 280px)',
    overflowY: 'auto',
  },
  subCandidateButton: {
    border: 'none',
    borderRadius: 'var(--sub-modal-inner-radius)',
    padding: '12px 14px',
    color: THEME.textOnAccent,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  subCancelButton: {
    marginTop: '14px',
    width: '100%',
    padding: '10px',
    borderRadius: 'var(--sub-modal-inner-radius)',
    border: `1px solid ${COLORS.border}`,
    backgroundColor: 'transparent',
    color: COLORS.textSecondary,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerText: {
    color: COLORS.text,
    fontSize: '15px',
    fontWeight: '600',
  },
  settingsSection: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: '8px 0',
    marginBottom: '8px',
    gap: '8px',
  },
  scoreDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '8.5px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: COLORS.textSecondary,
  },
  topRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: '6.5px',
  },
  undoButton: {
    backgroundColor: THEME.dangerTint,
    color: THEME.danger,
    border: `1px solid ${THEME.dangerBorder}`,
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    opacity: 1,
    transition: 'background 0.2s, color 0.2s, opacity 0.2s ease',
  },
  kickoffBar: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    margin: '0 0 10px',
    padding: '12px 14px',
    backgroundColor: THEME.openTint,
    border: `1px solid ${THEME.openMuted}`,
    borderRadius: '10px',
  },
  kickoffCopy: {
    margin: 0,
    flex: '1 1 200px',
    color: COLORS.text,
    fontSize: '14px',
    lineHeight: 1.4,
  },
  kickoffButton: {
    backgroundColor: THEME.open,
    color: THEME.textOnAccent,
    border: 'none',
    padding: '12px 22px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: THEME.shadowCta,
    flex: '0 0 auto',
  },
}; 