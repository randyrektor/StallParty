import { useEffect, useRef, useState } from 'react';
import {
  spectatorSnapshotForAudience,
  type SpectatorLinkStatus,
  type SpectatorSnapshot,
} from '../utils/spectatorState';
import { watchSnapshotsEqual, type WatchServerMessage } from '../utils/watchRoom';

const RETRY_START_MS = 2000;
const RETRY_MAX_MS = 30_000;

function watchSocketUrl(roomId: string): string {
  const query = `room=${encodeURIComponent(roomId)}`;
  const override = import.meta.env.VITE_WATCH_WS as string | undefined;
  if (override) {
    const join = override.includes('?') ? '&' : '?';
    return `${override}${join}${query}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/watch-ws?${query}`;
}

function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function useWatchHost(
  enabled: boolean,
  roomId: string | null,
  writeKey: string | null,
  viewKey: string | null,
  snapshot: SpectatorSnapshot
) {
  const wsRef = useRef<WebSocket | null>(null);
  const snapRef = useRef(snapshot);
  const lastSentRef = useRef<SpectatorSnapshot | null>(null);
  snapRef.current = snapshot;

  useEffect(() => {
    if (!enabled || !roomId || !writeKey) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delay = RETRY_START_MS;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(watchSocketUrl(roomId));
      wsRef.current = ws;
      ws.addEventListener('open', () => {
        delay = RETRY_START_MS;
        send(ws, {
          type: 'host',
          room: roomId,
          key: writeKey,
          ...(viewKey ? { view: viewKey } : {}),
        });
        send(ws, { type: 'put', room: roomId, key: writeKey, snap: snapRef.current });
        lastSentRef.current = snapRef.current;
      });
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WatchServerMessage;
          if (msg.type === 'error' && msg.error === 'expired') {
            stopped = true;
            ws.close();
          }
        } catch {
          // ignore
        }
      });
      ws.addEventListener('close', () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        retry = setTimeout(() => {
          delay = Math.min(delay * 2, RETRY_MAX_MS);
          connect();
        }, delay);
      });
      ws.addEventListener('error', () => ws.close());
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, roomId, writeKey, viewKey]);

  useEffect(() => {
    if (!enabled || !roomId || !writeKey) return;
    if (watchSnapshotsEqual(lastSentRef.current, snapshot)) return;
    const ws = wsRef.current;
    if (!ws) return;
    const timer = window.setTimeout(() => {
      if (watchSnapshotsEqual(lastSentRef.current, snapshot)) return;
      send(ws, { type: 'put', room: roomId, key: writeKey, snap: snapshot });
      lastSentRef.current = snapshot;
    }, 200);
    return () => window.clearTimeout(timer);
  }, [enabled, roomId, writeKey, snapshot]);
}

export function useWatchViewer(roomId: string | null, viewKey?: string | null): {
  snapshot: SpectatorSnapshot | null;
  status: SpectatorLinkStatus;
} {
  const [snapshot, setSnapshot] = useState<SpectatorSnapshot | null>(null);
  const [status, setStatus] = useState<SpectatorLinkStatus>('reconnecting');

  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delay = RETRY_START_MS;

    const connect = () => {
      if (stopped) return;
      setStatus((prev) => (prev === 'live' ? 'reconnecting' : prev));
      ws = new WebSocket(watchSocketUrl(roomId));
      ws.addEventListener('open', () => {
        if (!ws) return;
        delay = RETRY_START_MS;
        send(ws, {
          type: 'join',
          room: roomId,
          ...(viewKey ? { view: viewKey } : {}),
        });
      });
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WatchServerMessage;
          if (msg.type === 'state') {
            setSnapshot(spectatorSnapshotForAudience(msg.snap, viewKey ? 'team' : 'public'));
            setStatus('live');
          } else if (msg.type === 'error' && msg.error === 'expired') {
            stopped = true;
            setStatus('snapshot');
          }
        } catch {
          // ignore
        }
      });
      ws.addEventListener('close', () => {
        if (stopped) return;
        setStatus('reconnecting');
        retry = setTimeout(() => {
          delay = Math.min(delay * 2, RETRY_MAX_MS);
          connect();
        }, delay);
      });
      ws.addEventListener('error', () => ws?.close());
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [roomId, viewKey]);

  return { snapshot, status };
}
