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

function isArchivedGame(value: unknown): value is ArchivedGame {
  if (!value || typeof value !== 'object') return false;
  const game = value as ArchivedGame;
  return (
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
    game.points.every(isPoint)
  );
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
