import { describe, it, expect } from 'vitest';
import {
  buildSpectatorSnapshot,
  encodeSpectatorSnapshot,
  decodeSpectatorSnapshot,
  parseSpectatorHash,
  sanitizeSpectatorSnapshot,
  snapshotShowsGender,
} from './spectatorState';

describe('buildSpectatorSnapshot', () => {
  it('records score, point, cap, and this/next gender split', () => {
    const snap = buildSpectatorSnapshot({
      us: 'Disco',
      them: 'Away',
      s1: 7,
      s2: 5,
      point: 13,
      lineIndex: 1,
      lineupSize: 7,
      startingOpen: 4,
      splitCycle: 'ABBA',
      softCap: 15,
      now: 1_700_000_000_000,
    });
    expect(snap).toMatchObject({
      v: 2,
      us: 'Disco',
      them: 'Away',
      s1: 7,
      s2: 5,
      point: 13,
      thisOpen: 3,
      thisWomen: 4,
      nextOpen: 3,
      nextWomen: 4,
      splitCycle: 'ABBA',
      lineIndex: 1,
      softCap: 15,
      updatedAt: 1_700_000_000_000,
    });
    expect(snapshotShowsGender(snap)).toBe(true);
  });

  it('shows a different next split on ABBA A-line', () => {
    const snap = buildSpectatorSnapshot({
      us: 'Us',
      them: 'Them',
      s1: 0,
      s2: 0,
      point: 1,
      lineIndex: 0,
      lineupSize: 7,
      startingOpen: 4,
      splitCycle: 'ABBA',
      softCap: null,
      now: 1,
    });
    expect(snap.thisOpen).toBe(4);
    expect(snap.thisWomen).toBe(3);
    expect(snap.nextOpen).toBe(3);
    expect(snap.nextWomen).toBe(4);
  });
});

describe('spectator snapshot encoding', () => {
  it('round-trips a v2 snapshot', () => {
    const snap = buildSpectatorSnapshot({
      us: 'Disco',
      them: 'Away',
      s1: 7,
      s2: 5,
      point: 13,
      lineIndex: 0,
      lineupSize: 7,
      startingOpen: 4,
      splitCycle: 'AAB',
      softCap: 13,
      now: 42,
    });
    expect(decodeSpectatorSnapshot(encodeSpectatorSnapshot(snap))).toEqual(snap);
  });

  it('reads a watch hash', () => {
    const snap = buildSpectatorSnapshot({
      us: 'A',
      them: 'B',
      s1: 1,
      s2: 0,
      point: 2,
      lineIndex: 0,
      lineupSize: 7,
      startingOpen: 4,
      splitCycle: 'same',
      softCap: null,
      now: 1,
    });
    const hash = `#watch=${encodeSpectatorSnapshot(snap)}`;
    expect(parseSpectatorHash(hash)?.s1).toBe(1);
  });

  it('upgrades a v1 hash without roster names', () => {
    const v1 = {
      v: 1,
      us: 'Disco',
      them: 'Away',
      s1: 3,
      s2: 2,
      point: 6,
      line: ['Ada', 'Bo'],
      next: ['Cy'],
    };
    const decoded = decodeSpectatorSnapshot(encodeSpectatorSnapshot(v1 as never));
    expect(decoded).toMatchObject({
      v: 2,
      us: 'Disco',
      them: 'Away',
      s1: 3,
      s2: 2,
      point: 6,
      thisOpen: 0,
      thisWomen: 0,
      splitCycle: 'same',
      softCap: null,
    });
    expect(snapshotShowsGender(decoded!)).toBe(false);
  });

  it('fills missing clock reminders on older v2 snapshots', () => {
    const snap = buildSpectatorSnapshot({
      us: 'A',
      them: 'B',
      s1: 1,
      s2: 0,
      point: 2,
      lineIndex: 0,
      lineupSize: 7,
      startingOpen: 4,
      splitCycle: 'same',
      softCap: null,
      now: 1,
    });
    const { halfAt: _h, endAt: _e, ...legacy } = snap;
    const decoded = decodeSpectatorSnapshot(encodeSpectatorSnapshot(legacy as never));
    expect(decoded?.halfAt).toBeNull();
    expect(decoded?.endAt).toBeNull();
  });

  it('truncates team names and drops extra snapshot fields', () => {
    const decoded = sanitizeSpectatorSnapshot({
      v: 2,
      us: `  ${'A'.repeat(120)}  `,
      them: 'B',
      s1: 1e6,
      s2: -3,
      point: 0,
      thisOpen: 99,
      thisWomen: 1,
      nextOpen: 4,
      nextWomen: 3,
      splitCycle: 'same',
      junk: 'nope',
    });
    expect(decoded?.us).toHaveLength(80);
    expect(decoded?.s1).toBe(99);
    expect(decoded?.s2).toBe(0);
    expect(decoded?.point).toBe(1);
    expect(decoded?.thisOpen).toBe(7);
    expect(decoded && 'junk' in decoded).toBe(false);
  });
});
