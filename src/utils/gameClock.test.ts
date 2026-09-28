import { describe, it, expect } from 'vitest';
import {
  activeClockReminder,
  clockReminderCopy,
  formatGameClockInput,
  parseGameClockTime,
  shownClockReminder,
} from './gameClock';

describe('game clock times', () => {
  it('parses HH:MM and minutes from midnight', () => {
    expect(parseGameClockTime('19:15')).toBe(19 * 60 + 15);
    expect(parseGameClockTime(8 * 60)).toBe(480);
    expect(parseGameClockTime('')).toBeNull();
    expect(parseGameClockTime('25:00')).toBeNull();
  });

  it('formats time inputs', () => {
    expect(formatGameClockInput(19 * 60 + 5)).toBe('19:05');
    expect(formatGameClockInput(null)).toBe('');
  });
});

describe('clock reminders', () => {
  const half = 19 * 60 + 15;
  const end = 20 * 60;

  it('is idle more than two minutes out', () => {
    expect(activeClockReminder(half, end, new Date(2026, 5, 1, 19, 12, 0))).toBeNull();
  });

  it('warns two minutes before half', () => {
    const reminder = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 13, 30));
    expect(reminder?.kind).toBe('half');
    expect(reminder?.phase).toBe('soon');
    expect(clockReminderCopy(reminder!)).toBe('Halftime in 2 min');
  });

  it('counts down seconds in the last minute', () => {
    const atMinute = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 14, 0));
    expect(atMinute?.phase).toBe('countdown');
    expect(clockReminderCopy(atMinute!)).toBe('Halftime in 1:00');

    const mid = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 14, 15));
    expect(clockReminderCopy(mid!)).toBe('Halftime in 0:45');
  });

  it('treats the named time as a finish-this-point reminder', () => {
    const reminder = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 15, 5));
    expect(reminder?.kind).toBe('half');
    expect(reminder?.phase).toBe('now');
    expect(clockReminderCopy(reminder!)).toBe('Halftime — finish this point');
  });

  it('prefers game end when both windows overlap', () => {
    const reminder = activeClockReminder(19 * 60 + 59, end, new Date(2026, 5, 1, 19, 59, 0));
    expect(reminder?.kind).toBe('end');
    expect(reminder?.phase).toBe('countdown');
    expect(clockReminderCopy(reminder!)).toBe('Time cap in 1:00');
  });

  it('stops nagging well after the time', () => {
    expect(activeClockReminder(half, null, new Date(2026, 5, 1, 19, 30, 0))).toBeNull();
  });

  it('clears the halftime reminder once a receiver is chosen', () => {
    const soon = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 13, 30));
    const now = activeClockReminder(half, end, new Date(2026, 5, 1, 19, 15, 5));
    expect(shownClockReminder(soon, '', false)?.kind).toBe('half');
    expect(shownClockReminder(soon, '', true)).toBeNull();
    expect(shownClockReminder(now, '', true)).toBeNull();
  });

  it('keeps the time cap reminder after halftime, until that reminder is dismissed', () => {
    const reminder = activeClockReminder(19 * 60 + 59, end, new Date(2026, 5, 1, 19, 59, 0));
    expect(shownClockReminder(reminder, '', true)).toEqual(reminder);
    expect(shownClockReminder(reminder, 'end:countdown', true)).toBeNull();
  });
});
