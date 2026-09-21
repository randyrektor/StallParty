import type { Plugin } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  createWatchStore,
  isWatchPayloadTooLarge,
  parseClientMessage,
  type WatchSink,
} from '../utils/watchRoom';

const PATH = '/watch-ws';

function attachClient(
  store: ReturnType<typeof createWatchStore>,
  socket: WebSocket
) {
  const sink: WatchSink = (msg) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };
  socket.on('message', (data) => {
    const raw = String(data);
    if (isWatchPayloadTooLarge(raw)) {
      sink({ type: 'error', error: 'bad-message' });
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      sink({ type: 'error', error: 'bad-message' });
      return;
    }
    if (msg.type === 'host') sink(store.host(msg.room, msg.key, sink, msg.view));
    else if (msg.type === 'join') sink(store.join(msg.room, sink, msg.view));
    else if (msg.type === 'put') sink(store.put(msg.room, msg.key, msg.snap));
  });
  socket.on('close', () => store.drop(sink));
}

export function watchRoomPlugin(): Plugin {
  return {
    name: 'watch-rooms',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const store = createWatchStore();
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const pathname = req.url ? req.url.split('?')[0] : '';
        if (pathname !== PATH) return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          attachClient(store, ws);
        });
      });
    },
    configurePreviewServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const store = createWatchStore();
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const pathname = req.url ? req.url.split('?')[0] : '';
        if (pathname !== PATH) return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          attachClient(store, ws);
        });
      });
    },
  };
}
