import type { LineupSize, Player, SplitCycle } from '../types';
import type { GameSession } from './gameSession';
import {
  assignNumbersByGender,
  clampOpenCount,
  DEFAULT_STARTING_OPEN,
  getGenderPattern,
  isSplitCycleAvailable,
} from './rotationHelpers';

export const GAME_ARCHIVE_KEY = 'ultimate-game-archive';
export const GAME_ARCHIVE_LIMIT = 30;

export type ArchiveSide = 1 | 2;

export type ArchivedRosterPlayer = {
  uuid: string;
  name: string;
  gender: 'O' | 'W';
};

export type ArchivedPoint = {
  team: ArchiveSide;
  pointNumber: number;
  linePlayerIds: string[];
  scorerId?: string;
  throwerId?: string;
  pullOverride?: ArchiveSide;
};

export type ArchivedGame = {
  id: string;
  startedAt: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  roster: ArchivedRosterPlayer[];
  openingPull: ArchiveSide | null;
  halfPoint: number | null;
  points: ArchivedPoint[];
  /** Full scoreboard state so the game can be continued. Missing on older saves. */
  session?: GameSession;
  /** Set when End Game is pressed. Until then the scoreboard can be continued. */
  ended?: boolean;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function calendarDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatArchiveWhen(iso: string, withTime: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${MONTHS[date.getMonth()]} ${ordinal(date.getDate())}`;
  if (!withTime) return day;
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day} · ${hours}:${minutes} ${suffix}`;
}

export function archiveTitle(game: ArchivedGame, games: readonly ArchivedGame[]): string {
  const day = calendarDayKey(game.startedAt);
  const sharedDay = games.some(
    (other) => other.id !== game.id && calendarDayKey(other.startedAt) === day
  );
  const when = formatArchiveWhen(game.startedAt, sharedDay);
  return `${game.team1Name} vs ${game.team2Name} · ${when}`;
}

function isSide(value: unknown): value is ArchiveSide {
  return value === 1 || value === 2;
}

function isRosterPlayer(value: unknown): value is ArchivedRosterPlayer {
  if (!value || typeof value !== 'object') return false;
  const player = value as ArchivedRosterPlayer;
  return (
    typeof player.uuid === 'string' &&
    typeof player.name === 'string' &&
    (player.gender === 'O' || player.gender === 'W')
  );
}

function isPoint(value: unknown): value is ArchivedPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as ArchivedPoint;
  return (
    isSide(point.team) &&
    typeof point.pointNumber === 'number' &&
    Array.isArray(point.linePlayerIds) &&
    point.linePlayerIds.every((id) => typeof id === 'string')
  );
}

function isLineupSize(value: unknown): value is LineupSize {
  return value === 4 || value === 5 || value === 6 || value === 7;
}

function isStoredSession(value: unknown): value is GameSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as GameSession;
  return (
    session.v === 1 &&
    isLineupSize(session.lineupSize) &&
    typeof session.team1Name === 'string' &&
    Array.isArray(session.roster) &&
    Array.isArray(session.masterOpenQueue) &&
    Array.isArray(session.masterWomenQueue) &&
    Array.isArray(session.pendingPlayers) &&
    Array.isArray(session.scoreHistory)
  );
}

function isArchivedGame(value: unknown): value is ArchivedGame {
  if (!value || typeof value !== 'object') return false;
  const game = value as ArchivedGame;
  const ok =
    typeof game.id === 'string' &&
    typeof game.startedAt === 'string' &&
    typeof game.team1Name === 'string' &&
    typeof game.team2Name === 'string' &&
    typeof game.team1Score === 'number' &&
    typeof game.team2Score === 'number' &&
    Array.isArray(game.roster) &&
    game.roster.every(isRosterPlayer) &&
    (game.openingPull == null || isSide(game.openingPull)) &&
    (game.halfPoint == null || typeof game.halfPoint === 'number') &&
    Array.isArray(game.points) &&
    game.points.every(isPoint);
  if (!ok) return false;
  if (game.session != null && !isStoredSession(game.session)) delete game.session;
  game.ended = game.ended === true;
  return true;
}

export function loadGameArchive(): ArchivedGame[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GAME_ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isArchivedGame).slice(0, GAME_ARCHIVE_LIMIT);
  } catch {
    return [];
  }
}

function writeGameArchive(games: readonly ArchivedGame[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(GAME_ARCHIVE_KEY, JSON.stringify(games.slice(0, GAME_ARCHIVE_LIMIT)));
  } catch {
    // quota
  }
}

export function rememberArchivedGame(game: ArchivedGame): ArchivedGame[] {
  const next = [game, ...loadGameArchive().filter((existing) => existing.id !== game.id)].slice(
    0,
    GAME_ARCHIVE_LIMIT
  );
  writeGameArchive(next);
  return next;
}

export function replaceArchivedGame(game: ArchivedGame): ArchivedGame[] {
  const current = loadGameArchive();
  const next = current.map((existing) => (existing.id === game.id ? game : existing));
  writeGameArchive(next);
  return next;
}

export function forgetArchivedGame(id: string): ArchivedGame[] {
  const next = loadGameArchive().filter((game) => game.id !== id);
  writeGameArchive(next);
  return next;
}

function openCountOnLine(game: ArchivedGame, point: ArchivedPoint): number | null {
  if (point.linePlayerIds.length === 0) return null;
  const gender = new Map(game.roster.map((player) => [player.uuid, player.gender]));
  let open = 0;
  let known = 0;
  for (const id of point.linePlayerIds) {
    const side = gender.get(id);
    if (!side) continue;
    known += 1;
    if (side === 'O') open += 1;
  }
  return known === 0 ? null : open;
}

function inferLineupSize(game: ArchivedGame): LineupSize {
  const counts = new Map<number, number>();
  for (const point of game.points) {
    const size = point.linePlayerIds.length;
    if (size < 4 || size > 7) continue;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let best: LineupSize = 7;
  let bestCount = 0;
  counts.forEach((count, size) => {
    if (count > bestCount && isLineupSize(size)) {
      best = size;
      bestCount = count;
    }
  });
  return best;
}

function inferSplitCycle(game: ArchivedGame, size: LineupSize, startingOpen: number): SplitCycle {
  const cycles: SplitCycle[] = ['same', 'ABBA', 'AAB'];
  let best: SplitCycle = 'ABBA';
  let bestScore = -1;
  for (const cycle of cycles) {
    if (cycle !== 'same' && !isSplitCycleAvailable(size, startingOpen, cycle)) continue;
    let score = 0;
    game.points.forEach((point, index) => {
      const open = openCountOnLine(game, point);
      if (open == null) return;
      if (getGenderPattern(index, size, startingOpen, cycle).men === open) score += 1;
    });
    if (score > bestScore) {
      best = cycle;
      bestScore = score;
    }
  }
  return best;
}

/** Rebuild a playable scoreboard from a saved game, preferring its stored session. */
export function sessionFromArchive(game: ArchivedGame): GameSession {
  if (game.session) {
    return {
      ...game.session,
      archiveId: game.id,
      gameStarted: true,
      showRoster: false,
    };
  }
  const roster: Player[] = assignNumbersByGender(
    game.roster.map((player) => ({
      uuid: player.uuid,
      name: player.name,
      gender: player.gender,
      number: 0,
    }))
  );
  const lineupSize = inferLineupSize(game);
  const firstOpen = game.points.length > 0 ? openCountOnLine(game, game.points[0]) : null;
  const startingOpen = clampOpenCount(firstOpen ?? DEFAULT_STARTING_OPEN[lineupSize], lineupSize);
  const splitCycle = inferSplitCycle(game, lineupSize, startingOpen);
  const lastPoint = game.points[game.points.length - 1];
  const halfPoint = game.points.find(
    (point) => point.pointNumber === game.halfPoint && (point.pullOverride === 1 || point.pullOverride === 2)
  );
  return {
    v: 1,
    archiveId: game.id,
    team1Name: game.team1Name,
    team2Name: game.team2Name,
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    roster,
    masterOpenQueue: roster.filter((player) => player.gender === 'O'),
    masterWomenQueue: roster.filter((player) => player.gender === 'W'),
    pendingPlayers: [],
    gameStarted: true,
    lineIndex: game.points.length,
    pointNumber: (lastPoint?.pointNumber ?? game.team1Score + game.team2Score) + 1,
    openIndex: 0,
    womenIndex: 0,
    scoreHistory: game.points.map((point, index) => ({
      team: point.team,
      lineIndex: index,
      pointNumber: point.pointNumber,
      openIndex: 0,
      womenIndex: 0,
      pendingPlayerIds: [],
      linePlayerIds: point.linePlayerIds,
      ...(point.scorerId ? { scorerId: point.scorerId } : {}),
      ...(point.throwerId ? { throwerId: point.throwerId } : {}),
      ...(point.pullOverride ? { pullOverride: point.pullOverride } : {}),
    })),
    openingPull: game.openingPull,
    halfPoint: game.halfPoint,
    halfPull: halfPoint?.pullOverride ?? null,
    startedAt: game.startedAt,
    lineupSize,
    startingOpen,
    splitCycle,
    showRoster: false,
    setupStep: 'line',
  };
}
