import type { LineupSize, SplitCycle } from '../types';
import { getGenderPattern, isSplitCycleAvailable } from './rotationHelpers';
import { parseSoftCap, type SoftPointCap } from './softCap';
import { parseGameClockTime, type GameClockTime } from './gameClock';

export const SPECTATOR_SNAPSHOT_VERSION = 2 as const;
export const SPECTATOR_NAME_MAX = 80;
const SPECTATOR_SCORE_MAX = 99;
const SPECTATOR_POINT_MAX = 199;
const SPECTATOR_LINE_MAX = 999;
const SPECTATOR_GENDER_MAX = 7;

export type SpectatorLinkStatus = 'preview' | 'snapshot' | 'live' | 'reconnecting';

export type SpectatorSnapshot = {
  v: typeof SPECTATOR_SNAPSHOT_VERSION;
  us: string;
  them: string;
  s1: number;
  s2: number;
  point: number;
  thisOpen: number;
  thisWomen: number;
  nextOpen: number;
  nextWomen: number;
  splitCycle: SplitCycle;
  lineIndex: number;
  softCap: SoftPointCap;
  halfAt: GameClockTime;
  endAt: GameClockTime;
  updatedAt: number;
};

const HASH_PREFIX = 'watch=';
const CYCLES: SplitCycle[] = ['same', 'ABBA', 'AAB'];

function isSplitCycle(value: unknown): value is SplitCycle {
  return CYCLES.includes(value as SplitCycle);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeTeamName(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, SPECTATOR_NAME_MAX);
}

export function buildSpectatorSnapshot(input: {
  us: string;
  them: string;
  s1: number;
  s2: number;
  point: number;
  lineIndex: number;
  lineupSize: LineupSize;
  startingOpen: number;
  splitCycle: SplitCycle;
  softCap: SoftPointCap;
  halfAt?: GameClockTime;
  endAt?: GameClockTime;
  now?: number;
}): SpectatorSnapshot {
  const cycle = isSplitCycleAvailable(input.lineupSize, input.startingOpen, input.splitCycle)
    ? input.splitCycle
    : 'same';
  const thisPoint = getGenderPattern(input.lineIndex, input.lineupSize, input.startingOpen, cycle);
  const nextPoint = getGenderPattern(input.lineIndex + 1, input.lineupSize, input.startingOpen, cycle);
  return {
    v: SPECTATOR_SNAPSHOT_VERSION,
    us: sanitizeTeamName(input.us),
    them: sanitizeTeamName(input.them),
    s1: clampInt(input.s1, 0, SPECTATOR_SCORE_MAX),
    s2: clampInt(input.s2, 0, SPECTATOR_SCORE_MAX),
    point: clampInt(input.point, 1, SPECTATOR_POINT_MAX),
    thisOpen: thisPoint.men,
    thisWomen: thisPoint.women,
    nextOpen: nextPoint.men,
    nextWomen: nextPoint.women,
    splitCycle: cycle,
    lineIndex: input.lineIndex,
    softCap: input.softCap,
    halfAt: input.halfAt ?? null,
    endAt: input.endAt ?? null,
    updatedAt: input.now ?? Date.now(),
  };
}

export function snapshotShowsGender(snap: SpectatorSnapshot): boolean {
  return snap.thisOpen + snap.thisWomen > 0;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(raw: string): string {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function fromV1(parsed: Record<string, unknown>): SpectatorSnapshot | null {
  if (typeof parsed.us !== 'string' || typeof parsed.them !== 'string') return null;
  if (!isFiniteNumber(parsed.s1) || !isFiniteNumber(parsed.s2)) return null;
  return {
    v: SPECTATOR_SNAPSHOT_VERSION,
    us: sanitizeTeamName(parsed.us),
    them: sanitizeTeamName(parsed.them),
    s1: clampInt(parsed.s1, 0, SPECTATOR_SCORE_MAX),
    s2: clampInt(parsed.s2, 0, SPECTATOR_SCORE_MAX),
    point: isFiniteNumber(parsed.point) ? clampInt(parsed.point, 1, SPECTATOR_POINT_MAX) : 1,
    thisOpen: 0,
    thisWomen: 0,
    nextOpen: 0,
    nextWomen: 0,
    splitCycle: 'same',
    lineIndex: 0,
    softCap: null,
    halfAt: null,
    endAt: null,
    updatedAt: 0,
  };
}

function fromV2(parsed: Record<string, unknown>): SpectatorSnapshot | null {
  if (typeof parsed.us !== 'string' || typeof parsed.them !== 'string') return null;
  if (!isFiniteNumber(parsed.s1) || !isFiniteNumber(parsed.s2) || !isFiniteNumber(parsed.point)) {
    return null;
  }
  if (
    !isFiniteNumber(parsed.thisOpen) ||
    !isFiniteNumber(parsed.thisWomen) ||
    !isFiniteNumber(parsed.nextOpen) ||
    !isFiniteNumber(parsed.nextWomen)
  ) {
    return null;
  }
  if (!isSplitCycle(parsed.splitCycle)) return null;
  return {
    v: SPECTATOR_SNAPSHOT_VERSION,
    us: sanitizeTeamName(parsed.us),
    them: sanitizeTeamName(parsed.them),
    s1: clampInt(parsed.s1, 0, SPECTATOR_SCORE_MAX),
    s2: clampInt(parsed.s2, 0, SPECTATOR_SCORE_MAX),
    point: clampInt(parsed.point, 1, SPECTATOR_POINT_MAX),
    thisOpen: clampInt(parsed.thisOpen, 0, SPECTATOR_GENDER_MAX),
    thisWomen: clampInt(parsed.thisWomen, 0, SPECTATOR_GENDER_MAX),
    nextOpen: clampInt(parsed.nextOpen, 0, SPECTATOR_GENDER_MAX),
    nextWomen: clampInt(parsed.nextWomen, 0, SPECTATOR_GENDER_MAX),
    splitCycle: parsed.splitCycle,
    lineIndex: isFiniteNumber(parsed.lineIndex) ? clampInt(parsed.lineIndex, 0, SPECTATOR_LINE_MAX) : 0,
    softCap: parseSoftCap(parsed.softCap),
    halfAt: parseGameClockTime(parsed.halfAt),
    endAt: parseGameClockTime(parsed.endAt),
    updatedAt: isFiniteNumber(parsed.updatedAt) ? Math.max(0, Math.round(parsed.updatedAt)) : 0,
  };
}

export function sanitizeSpectatorSnapshot(value: unknown): SpectatorSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.v === 1) return fromV1(record);
  if (record.v === SPECTATOR_SNAPSHOT_VERSION) return fromV2(record);
  return null;
}

export function encodeSpectatorSnapshot(snap: SpectatorSnapshot): string {
  return toBase64Url(JSON.stringify(snap));
}

export function decodeSpectatorSnapshot(raw: string): SpectatorSnapshot | null {
  try {
    return sanitizeSpectatorSnapshot(JSON.parse(fromBase64Url(raw)));
  } catch {
    return null;
  }
}

export function spectatorUrlFromLocation(snap: SpectatorSnapshot): string {
  const encoded = encodeSpectatorSnapshot(snap);
  const path = `${window.location.origin}${window.location.pathname}`;
  return `${path}#${HASH_PREFIX}${encoded}`;
}

export function parseSpectatorHash(hash: string): SpectatorSnapshot | null {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!trimmed.startsWith(HASH_PREFIX)) return null;
  return decodeSpectatorSnapshot(trimmed.slice(HASH_PREFIX.length));
}

