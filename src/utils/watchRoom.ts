import type { SpectatorSnapshot } from './spectatorState';
import {
  decodeSpectatorSnapshot,
  sanitizeSpectatorSnapshot,
  spectatorSnapshotForAudience,
} from './spectatorState';

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
  | { kind: 'room'; roomId: string; view?: 'team'; viewKey?: string };

export type WatchClientMessage =
  | { type: 'host'; room: string; key: string; view?: string }
  | { type: 'join'; room: string; view?: string }
  | { type: 'put'; room: string; key: string; snap: SpectatorSnapshot };

const VIEW_KEY_SEPARATOR = '.t.';

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
    a.them === b.them &&
    sameNames(a.line, b.line) &&
    sameNames(a.next, b.next)
  );
}

function sameNames(
  a?: { name: string; g: 'O' | 'W' }[],
  b?: { name: string; g: 'O' | 'W' }[]
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every((player, index) => player.name === right[index]?.name && player.g === right[index]?.g)
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

export function isViewKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
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
    const body = trimmed.slice(WATCH_ROOM_PREFIX.length).split('&')[0] ?? '';
    const markerAt = body.indexOf(VIEW_KEY_SEPARATOR);
    if (markerAt !== -1) {
      const roomId = normalizeRoomId(body.slice(0, markerAt));
      const viewKey = body.slice(markerAt + VIEW_KEY_SEPARATOR.length);
      if (!roomId) return null;
      if (!isViewKey(viewKey)) return { kind: 'room', roomId };
      return { kind: 'room', roomId, view: 'team', viewKey };
    }
    const roomId = normalizeRoomId(body);
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

export function watchRoomUrlFromLocation(roomId: string, viewKey?: string): string {
  const id = normalizeRoomId(roomId);
  const path = `${window.location.origin}${window.location.pathname}`;
  const room = id ?? roomId;
  const token = viewKey && isViewKey(viewKey) ? `${room}${VIEW_KEY_SEPARATOR}${viewKey}` : room;
  return `${path}#${WATCH_ROOM_PREFIX}${token}`;
}

type Room = RoomState & {
  viewers: Map<WatchSink, boolean>;
};

export type RoomState = {
  key: string | null;
  viewKey: string | null;
  snap: SpectatorSnapshot | null;
};

export type WatchBroadcast = {
  public: WatchServerMessage;
  team: WatchServerMessage;
};

export function applyWatchMessage(
  room: RoomState,
  msg: WatchClientMessage
): {
  room: RoomState;
  reply: WatchServerMessage;
  broadcast: WatchBroadcast | null;
  role: 'host' | 'viewer' | 'team' | null;
} {
  if (msg.type === 'host') {
    const id = normalizeRoomId(msg.room);
    if (!id || !msg.key) {
      return { room, reply: { type: 'error', error: 'bad-room' }, broadcast: null, role: null };
    }
    if (room.key && room.key !== msg.key) {
      return { room, reply: { type: 'error', error: 'forbidden' }, broadcast: null, role: null };
    }
    const next: RoomState = {
      key: msg.key,
      viewKey: msg.view && isViewKey(msg.view) ? msg.view : room.viewKey,
      snap: room.snap,
    };
    return { room: next, reply: { type: 'state', snap: next.snap }, broadcast: null, role: 'host' };
  }
  if (msg.type === 'join') {
    if (!normalizeRoomId(msg.room)) {
      return { room, reply: { type: 'error', error: 'bad-room' }, broadcast: null, role: null };
    }
    const team = !!room.viewKey && msg.view === room.viewKey;
    return {
      room,
      reply: { type: 'state', snap: spectatorSnapshotForAudience(room.snap, team ? 'team' : 'public') },
      broadcast: null,
      role: team ? 'team' : 'viewer',
    };
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
  const next: RoomState = { key: room.key, viewKey: room.viewKey, snap: msg.snap };
  const teamMsg: WatchServerMessage = { type: 'state', snap: next.snap };
  const publicMsg: WatchServerMessage = {
    type: 'state',
    snap: spectatorSnapshotForAudience(next.snap, 'public'),
  };
  return {
    room: next,
    reply: teamMsg,
    broadcast: { public: publicMsg, team: teamMsg },
    role: null,
  };
}

export function createWatchStore() {
  const rooms = new Map<string, Room>();

  function roomOf(id: string): Room {
    let room = rooms.get(id);
    if (!room) {
      room = { key: null, viewKey: null, snap: null, viewers: new Map() };
      rooms.set(id, room);
    }
    return room;
  }

  function drop(sink: WatchSink) {
    for (const room of rooms.values()) room.viewers.delete(sink);
  }

  function host(roomId: string, key: string, sink: WatchSink, view?: string): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = roomOf(id);
    const result = applyWatchMessage(room, { type: 'host', room: id, key, view });
    room.key = result.room.key;
    room.viewKey = result.room.viewKey;
    room.snap = result.room.snap;
    drop(sink);
    return result.reply;
  }

  function join(roomId: string, sink: WatchSink, view?: string): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = roomOf(id);
    const result = applyWatchMessage(room, { type: 'join', room: id, view });
    drop(sink);
    room.viewers.set(sink, result.role === 'team');
    return result.reply;
  }

  function put(roomId: string, key: string, snap: SpectatorSnapshot): WatchServerMessage {
    const id = normalizeRoomId(roomId);
    if (!id) return { type: 'error', error: 'bad-room' };
    const room = rooms.get(id);
    if (!room) return { type: 'error', error: 'forbidden' };
    const result = applyWatchMessage(room, { type: 'put', room: id, key, snap });
    room.key = result.room.key;
    room.viewKey = result.room.viewKey;
    room.snap = result.room.snap;
    if (result.broadcast) {
      for (const [viewer, team] of room.viewers) {
        viewer(team ? result.broadcast.team : result.broadcast.public);
      }
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
    if (msg.type === 'host' && typeof msg.room === 'string' && isWriteKey(msg.key)) {
      return isViewKey(msg.view ?? '') ? msg : { type: 'host', room: msg.room, key: msg.key };
    }
    if (msg.type === 'join' && typeof msg.room === 'string') {
      if (msg.view == null || msg.view === '') return { type: 'join', room: msg.room };
      if (!isViewKey(msg.view)) return { type: 'join', room: msg.room };
      return msg;
    }
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
