import type { Player, LineupSize, SplitCycle } from '../types';
import type { SoftPointCap } from './softCap';
import type { GameClockTime } from './gameClock';

export const GAME_SESSION_KEY = 'ultimate-active-game';

export type PersistedScoreEvent = {
  team: 1 | 2;
  lineIndex: number;
  pointNumber: number;
  openIndex: number;
  womenIndex: number;
  pendingPlayerIds: string[];
  linePlayerIds?: string[];
  scorerId?: string;
  throwerId?: string;
  pullOverride?: 1 | 2;
};

export type GameSession = {
  v: 1;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  roster: Player[];
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  pendingPlayers: Player[];
  gameStarted: boolean;
  lineIndex: number;
  pointNumber: number;
  openIndex: number;
  womenIndex: number;
  scoreHistory: PersistedScoreEvent[];
  /** Who pulled the first point. Missing on games started before pull tracking. */
  openingPull?: 1 | 2 | null;
  /** Point number where the second half began. */
  halfPoint?: number | null;
  startedAt?: string | null;
  lineupSize: LineupSize;
  startingOpen: number;
  splitCycle: SplitCycle;
  softCap?: SoftPointCap;
  halfAt?: GameClockTime;
  endAt?: GameClockTime;
  showRoster: boolean;
  setupStep: 'roster' | 'line';
  watchRoomId?: string;
  watchWriteKey?: string;
  /** Read-only key for the teammate spectator link. Not the write key. */
  watchViewKey?: string;
};

function isLineupSize(n: unknown): n is LineupSize {
  return n === 4 || n === 5 || n === 6 || n === 7;
}

export function loadGameSession(): GameSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GAME_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSession;
    if (!parsed || parsed.v !== 1) return null;
    if (!isLineupSize(parsed.lineupSize)) return null;
    if (!Array.isArray(parsed.roster)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameSession(session: GameSession): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
  } catch {
    // quota
  }
}

let pendingSession: GameSession | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let flushBound = false;

function flushPendingGameSession(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingSession) return;
  const next = pendingSession;
  pendingSession = null;
  saveGameSession(next);
}

function bindSessionFlushListeners(): void {
  if (flushBound || typeof window === 'undefined') return;
  flushBound = true;
  window.addEventListener('pagehide', flushPendingGameSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingGameSession();
  });
}

/** Coalesce rapid score clicks so stringify+localStorage is not on the hot path. */
export function scheduleSaveGameSession(session: GameSession, delayMs = 250): void {
  pendingSession = session;
  bindSessionFlushListeners();
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushPendingGameSession();
  }, delayMs);
}

export function clearGameSession(): void {
  pendingSession = null;
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(GAME_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function clearGameSessionForTeam(teamName: string): boolean {
  const key = teamName.trim();
  if (!key) return false;
  const session = loadGameSession();
  if (!session || session.team1Name.trim() !== key) return false;
  clearGameSession();
  return true;
}
