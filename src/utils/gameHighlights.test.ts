import { describe, expect, it } from 'vitest';
import { formatLead, gameSummary, topTagged } from './gameHighlights';
import type { ArchivedGame } from './gameArchive';

const roster = [
  { uuid: 'h', name: 'Haley' },
  { uuid: 's', name: 'Sam' },
  { uuid: 'r', name: 'Rio' },
];

describe('topTagged', () => {
  it('picks the player with the most tags', () => {
    expect(topTagged(roster, ['h', 'h', 's'])).toEqual({ names: ['Haley'], count: 2 });
  });

  it('keeps a tie in name order', () => {
    expect(topTagged(roster, ['s', 'h'])).toEqual({ names: ['Haley', 'Sam'], count: 1 });
  });

  it('returns null when nothing is tagged', () => {
    expect(topTagged(roster, [undefined, undefined])).toBeNull();
  });
});

describe('formatLead', () => {
  it('writes a single leader with their count', () => {
    expect(formatLead('scored', { names: ['Haley'], count: 4 })).toBe('Haley scored 4');
  });

  it('names both players on a tie', () => {
    expect(formatLead('threw', { names: ['Haley', 'Sam'], count: 2 })).toBe(
      'Haley and Sam threw 2'
    );
  });
});

describe('gameSummary', () => {
  it('builds share lines from breaks and tagged goals', () => {
    const game: ArchivedGame = {
      id: 'g',
      startedAt: '2026-07-12T18:00:00',
      team1Name: 'Floodwall',
      team2Name: 'Away',
      team1Score: 2,
      team2Score: 0,
      roster,
      openingPull: 1,
      halfPoint: null,
      points: [
        { team: 1, pointNumber: 1, linePlayerIds: ['h', 's'], scorerId: 'h', throwerId: 's' },
        { team: 1, pointNumber: 2, linePlayerIds: ['h', 's'], scorerId: 'h' },
      ],
    };
    expect(gameSummary(game).lines).toEqual([
      'Breaks 2 · Holds 0',
      'Haley scored 2',
      'Sam threw 1',
    ]);
  });
});
