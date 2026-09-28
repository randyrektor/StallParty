/** Minutes from local midnight, or `null` if unset. */
export type GameClockTime = number | null;

export type ClockReminderKind = 'half' | 'end';
export type ClockReminderPhase = 'soon' | 'countdown' | 'now';

export type ActiveClockReminder = {
  kind: ClockReminderKind;
  phase: ClockReminderPhase;
  remainingMs: number;
};

export const GAME_CLOCK_LEAD_MS = 2 * 60 * 1000;
export const GAME_CLOCK_COUNTDOWN_MS = 60 * 1000;
export const GAME_CLOCK_NOW_MS = 8 * 60 * 1000;

export function parseGameClockTime(raw: unknown): GameClockTime {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n < 0 || n > 1439) return null;
    return n;
  }
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatGameClockInput(time: GameClockTime): string {
  if (time == null) return '';
  const hours = Math.floor(time / 60);
  const minutes = time % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function msUntil(time: GameClockTime, now: Date): number | null {
  if (time == null) return null;
  const target = new Date(now);
  target.setHours(Math.floor(time / 60), time % 60, 0, 0);
  return target.getTime() - now.getTime();
}

function phaseForDelta(delta: number): ClockReminderPhase | 'idle' {
  if (delta > GAME_CLOCK_LEAD_MS) return 'idle';
  if (delta > GAME_CLOCK_COUNTDOWN_MS) return 'soon';
  if (delta > 0) return 'countdown';
  if (delta >= -GAME_CLOCK_NOW_MS) return 'now';
  return 'idle';
}

function reminderFor(
  kind: ClockReminderKind,
  time: GameClockTime,
  now: Date
): ActiveClockReminder | null {
  const delta = msUntil(time, now);
  if (delta == null) return null;
  const phase = phaseForDelta(delta);
  if (phase === 'idle') return null;
  return { kind, phase, remainingMs: delta };
}

/** Game end wins if both are in the warning window. */
export function activeClockReminder(
  halfAt: GameClockTime,
  endAt: GameClockTime,
  now: Date
): ActiveClockReminder | null {
  return reminderFor('end', endAt, now) ?? reminderFor('half', halfAt, now);
}

/**
 * Banner still on screen. Choosing the halftime receiver clears every phase of
 * that reminder. The time-cap reminder stays until it is dismissed or the game ends.
 */
export function shownClockReminder(
  reminder: ActiveClockReminder | null,
  dismissedKey: string,
  halfChosen: boolean
): ActiveClockReminder | null {
  if (!reminder) return null;
  if (reminder.kind === 'half' && halfChosen) return null;
  if (`${reminder.kind}:${reminder.phase}` === dismissedKey) return null;
  return reminder;
}

function formatCountdown(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function clockReminderCopy(reminder: ActiveClockReminder): string {
  const label = reminder.kind === 'half' ? 'Halftime' : 'Time cap';
  if (reminder.phase === 'now') {
    return reminder.kind === 'half'
      ? 'Halftime — finish this point'
      : 'Time cap — last point is a captains’ call';
  }
  if (reminder.phase === 'countdown') {
    return `${label} in ${formatCountdown(reminder.remainingMs)}`;
  }
  return `${label} in 2 min`;
}
