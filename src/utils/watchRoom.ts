import type { SpectatorSnapshot } from './spectatorState';
import { decodeSpectatorSnapshot, sanitizeSpectatorSnapshot } from './spectatorState';

export const WATCH_ROOM_PREFIX = 'watch/';
export const WATCH_SNAP_PREFIX = 'watch=';
export const WATCH_ROOM_ID_LENGTH = 6;
export const WATCH_ROOM_IDLE_MS = 4 * 60 * 60 * 1000;
export const WATCH_ROOM_MAX_MS = 8 * 60 * 60 * 1000;
export const WATCH_MESSAGE_MAX_BYTES = 8_192;
export const WATCH_MAX_SOCKETS = 64;
export const WATCH_MAX_MESSAGES_PER_WINDOW = 30;
export const WATCH_RATE_WINDOW_MS = 1_000;
export const WATCH_KEY_MAX_LENGTH = 128;
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export type WatchHash =
  | { kind: 'snapshot'; snapshot: SpectatorSnapshot }
  | { kind: 'room'; roomId: string };

export type WatchClientMessage =
  | { type: 'host'; room: string; key: string }
  | { type: 'join'; room: string }
  | { type: 'put'; room: string; key: string; snap: SpectatorSnapshot };

export type WatchServerMessage =
  | { type: 'state'; snap: SpectatorSnapshot | null }
  | { type: 'error'; error: string };

export function watchSnapshotsEqual(
  a: SpectatorSnapshot | null,
  b: SpectatorSnapshot | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.s1 === b.s1 &&
    a.s2 === b.s2 &&
    a.point === b.point &&
    a.thisOpen === b.thisOpen &&
    a.thisWomen === b.thisWomen &&
    a.nextOpen === b.nextOpen &&
    a.nextWomen === b.nextWomen &&
    a.splitCycle === b.splitCycle &&
    a.lineIndex === b.lineIndex &&
    a.softCap === b.softCap &&
    a.halfAt === b.halfAt &&
    a.endAt === b.endAt &&
    a.us === b.us &&
    a.them === b.them
  );
}

export type WatchSink = (msg: WatchServerMessage) => void;

export function mintRoomId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < WATCH_ROOM_ID_LENGTH; i++) {
    id += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)]!;
  }
  return id;
}

export function mintWriteKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function normalizeRoomId(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  if (id.length !== WATCH_ROOM_ID_LENGTH) return null;
  for (const ch of id) {
    if (!ROOM_ALPHABET.includes(ch)) return null;
  }
  return id;
}

export function parseWatchHash(hash: string): WatchHash | null {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  if (trimmed.startsWith(WATCH_ROOM_PREFIX)) {
    const roomId = normalizeRoomId(trimmed.slice(WATCH_ROOM_PREFIX.length).split('&')[0] ?? '');
    if (!roomId) return null;
    return { kind: 'room', roomId };
  }
  if (trimmed.startsWith(WATCH_SNAP_PREFIX)) {
    const snapshot = decodeSpectatorSnapshot(trimmed.slice(WATCH_SNAP_PREFIX.length));
    if (!snapshot) return null;
    return { kind: 'snapshot', snapshot };
  }
  return null;
}

export function watchRoomUrlFromLocation(roomId: string): string {
  const id = normalizeRoomId(roomId);
  const path = `${window.location.origin}${window.location.pathname}`;
  return `${path}#${WATCH_ROOM_PREFIX}${id ?? roomId}`;
}

type Room = {
  key: string | null;
  snap: SpectatorSnapshot | null;
  viewers: Set<WatchSink>;
};

export type RoomState = {
  key: string | null;
  snap: SpectatorSnapshot | null;
};

export function applyWatchMessage(
  room: RoomState,
  msg: WatchClientMessage
): {
  room: RoomState;
  reply: WatchServerMessage;
  broadcast: WatchServerMessage | null;
  role: 'host' | 'viewer' | null;
} {
  if (msg.type === 'host') {
    const id = normalizeRoomId(msg.room);
    if (!id || !msg.key) {
      return { room, reply: { type: 'error', error: 'bad-room' }, broadcast: null, role: null };
    }
    if (room.key && room.key !== msg.key) {
      return { room, reply: { type: 'error', error: 'forbidden' }, broadcast: null, role: null };
    }
    const next = { ...room, key: msg.key };
    return { room: next, reply: { type: 'state', snap: next.snap }, broadcast: null, role: 'host' };
  }
  if (msg.type === 'join') {
    if (!normalizeRoomId(msg.room)) {
      return { room, reply: { type: 'error', error: 'bad-room' }, broadcast: null, role: null };
    }
    return { room, reply: { type: 'state', snap: room.snap }, broadcast: null, role: 'viewer' };
  }
  const id = normalizeRoomId(msg.room);
  if (!id || !msg.key) {
    return { room, reply: { type: 'error', error: 'bad-room' }, broadcast: null, role: null };
  }
  if (!room.key || room.key !== msg.key) {
    return { room, reply: { type: 'error', error: 'forbidden' }, broadcast: null, role: null };
  }
  if (watchSnapshotsEqual(room.snap, msg.snap)) {
    return { room, reply: { type: 'state', snap: room.snap }, broadcast: null, role: null };
  }
  const next = { ...room, snap: msg.snap };
  const stateMsg: WatchServerMessage = { type: 'state', snap: next.snap };
  return { room: next, reply: stateMsg, broadcast: stateMsg, role: null };
}

export function createWatchStore() {
  const rooms = new Map<string, Room>();

  function roomOf(id: string): Room {
    let room = rooms.get(id);
    if (!room) {
      room = { key: null, snap: null, viewers: new Set() };
      rooms.set(id, room);
    }
    return room;
  }

  function drop(sink: WatchSink) {
    for (const room of rooms.values()) room.viewers.delete(sink);
  }

  function host(roomId: string, key: string, sink: WatchSink): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = roomOf(id);
    const result = applyWatchMessage(room, { type: 'host', room: id, key });
    room.key = result.room.key;
    room.snap = result.room.snap;
    drop(sink);
    return result.reply;
  }

  function join(roomId: string, sink: WatchSink): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = roomOf(id);
    const result = applyWatchMessage(room, { type: 'join', room: id });
    drop(sink);
    room.viewers.add(sink);
    return result.reply;
  }

  function put(roomId: string, key: string, snap: SpectatorSnapshot): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = rooms.get(id);
    if (!room) return { type: 'error', error: 'forbidden' };
    const result = applyWatchMessage(room, { type: 'put', room: id, key, snap });
    room.key = result.room.key;
    room.snap = result.room.snap;
    if (result.broadcast) {
      for (const viewer of room.viewers) viewer(result.broadcast);
    }
    return result.reply;
  }

  return { host, join, put, drop };
}

export function nextRoomAlarm(
  now: number,
  createdAt: number,
  lastActive: number,
  idleMs = WATCH_ROOM_IDLE_MS,
  maxMs = WATCH_ROOM_MAX_MS
): number | null {
  const deadline = Math.min(lastActive + idleMs, createdAt + maxMs);
  if (deadline <= now) return null;
  return deadline;
}

export function isWatchPayloadTooLarge(raw: string | ArrayBuffer): boolean {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
  return bytes > WATCH_MESSAGE_MAX_BYTES;
}

export function allowWatchRate(
  now: number,
  prev: { windowStart?: number; count?: number },
  limit = WATCH_MAX_MESSAGES_PER_WINDOW,
  windowMs = WATCH_RATE_WINDOW_MS
): { ok: boolean; windowStart: number; count: number } {
  const windowStart = prev.windowStart ?? now;
  if (now - windowStart >= windowMs) {
    return { ok: true, windowStart: now, count: 1 };
  }
  const count = (prev.count ?? 0) + 1;
  return { ok: count <= limit, windowStart, count };
}

function isWriteKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= WATCH_KEY_MAX_LENGTH;
}

export function parseClientMessage(raw: string): WatchClientMessage | null {
  try {
    const msg = JSON.parse(raw) as WatchClientMessage;
    if (!msg || typeof msg !== 'object') return null;
    if (msg.type === 'host' && typeof msg.room === 'string' && isWriteKey(msg.key)) return msg;
    if (msg.type === 'join' && typeof msg.room === 'string') return msg;
    if (msg.type === 'put' && typeof msg.room === 'string' && isWriteKey(msg.key)) {
      const snap = sanitizeSpectatorSnapshot(msg.snap);
      if (!snap) return null;
      return { type: 'put', room: msg.room, key: msg.key, snap };
    }
    return null;
  } catch {
    return null;
  }
}
