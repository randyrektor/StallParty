import { describe, expect, it } from 'vitest';
import {
  breakHoldForSide,
  nextPullOverride,
  pullingTeamForPoint,
  type PullPoint,
} from './possession';

const game: PullPoint[] = [
  { pointNumber: 1, team: 2 },
  { pointNumber: 2, team: 1 },
  { pointNumber: 3, team: 2 },
];

describe('pullingTeamForPoint', () => {
  it('uses the opening pull for the first point', () => {
    expect(pullingTeamForPoint(1, 1, game)).toBe(1);
  });

  it('gives the next pull to the team that just scored', () => {
    expect(pullingTeamForPoint(2, 1, game)).toBe(2);
    expect(pullingTeamForPoint(3, 1, game)).toBe(1);
  });

  it('keeps the same team pulling when they score again', () => {
    const run: PullPoint[] = [
      { pointNumber: 1, team: 1 },
      { pointNumber: 2, team: 1 },
      { pointNumber: 3, team: 1 },
    ];
    expect(pullingTeamForPoint(2, 1, run)).toBe(1);
    expect(pullingTeamForPoint(3, 1, run)).toBe(1);
    expect(pullingTeamForPoint(4, 1, run)).toBe(1);
  });

  it('keeps an override on that point only', () => {
    const withOverride: PullPoint[] = [
      { pointNumber: 1, team: 2, pullOverride: 2 },
      { pointNumber: 2, team: 1 },
    ];
    expect(pullingTeamForPoint(1, 1, withOverride)).toBe(2);
    expect(pullingTeamForPoint(2, 1, withOverride)).toBe(2);
  });
});

describe('breakHoldForSide', () => {
  it('counts a score after our pull as a break and a score after their pull as a hold', () => {
    const points: PullPoint[] = [
      { pointNumber: 1, team: 2 },
      { pointNumber: 2, team: 1 },
      { pointNumber: 3, team: 1 },
    ];
    expect(breakHoldForSide(1, 1, points)).toEqual({ breaks: 1, holds: 1 });
  });

  it('returns null when the opening pull was never set', () => {
    expect(breakHoldForSide(1, null, game)).toBeNull();
  });
});

describe('nextPullOverride', () => {
  it('stores a flip and clears it when flipped back to the inferred pull', () => {
    expect(nextPullOverride(1, 1, game)).toBe(2);
    const flipped: PullPoint[] = [{ pointNumber: 1, team: 2, pullOverride: 2 }];
    expect(nextPullOverride(1, 1, flipped)).toBeUndefined();
  });
});
