import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_ARCHIVE_KEY,
  GAME_ARCHIVE_LIMIT,
  archiveTitle,
  loadGameArchive,
  rememberArchivedGame,
  type ArchivedGame,
} from './gameArchive';

const memory = new Map<string, string>();

function installLocalStorage() {
  memory.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
}

function game(id: string, startedAt: string, team2Name = 'Wildfire'): ArchivedGame {
  return {
    id,
    startedAt,
    team1Name: 'Floodwall',
    team2Name,
    team1Score: 15,
    team2Score: 12,
    roster: [{ uuid: 'p1', name: 'Haley', gender: 'W' }],
    openingPull: 1,
    halfPoint: 8,
    points: [{ team: 1, pointNumber: 1, linePlayerIds: ['p1'], scorerId: 'p1' }],
  };
}

describe('archiveTitle', () => {
  it('uses the date when it is the only game that day', () => {
    const only = game('a', '2026-07-12T18:00:00');
    expect(archiveTitle(only, [only])).toBe('Floodwall vs Wildfire · July 12th');
  });

  it('adds the start time when another game shares the day', () => {
    const morning = game('a', '2026-07-12T14:40:00');
    const evening = game('b', '2026-07-12T20:05:00', 'Truck Stop');
    const games = [evening, morning];
    expect(archiveTitle(morning, games)).toBe('Floodwall vs Wildfire · July 12th · 2:40 PM');
    expect(archiveTitle(evening, games)).toBe('Floodwall vs Truck Stop · July 12th · 8:05 PM');
  });
});

describe('rememberArchivedGame', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    memory.clear();
  });

  it('keeps the newest games first and drops past the limit', () => {
    for (let i = 0; i < GAME_ARCHIVE_LIMIT + 2; i++) {
      rememberArchivedGame(game(`g${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}T15:00:00`));
    }
    const stored = loadGameArchive();
    expect(stored).toHaveLength(GAME_ARCHIVE_LIMIT);
    expect(stored[0]?.id).toBe(`g${GAME_ARCHIVE_LIMIT + 1}`);
    expect(memory.has(GAME_ARCHIVE_KEY)).toBe(true);
  });

  it('ignores a corrupt archive', () => {
    memory.set(GAME_ARCHIVE_KEY, '{');
    expect(loadGameArchive()).toEqual([]);
  });
});
