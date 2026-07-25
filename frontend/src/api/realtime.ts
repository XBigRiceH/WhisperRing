import { IncomingEvent } from './types';

/** FCM-less push: a persistent WebSocket to /realtime, auto-reconnecting. */
export class RealtimeClient {
  onConnected?: (connected: boolean) => void;
  onIncoming?: (event: IncomingEvent) => void;

  private ws?: WebSocket;
  private token?: string;
  private wanted = false;

  constructor(private wsUrl: string) {}

  connect(token: string): void {
    // Already connected (or connecting) with the same token → no-op. Without
    // this guard, remounting the home screen would open a second socket while
    // the first stays alive, so every incoming 思念 would fire twice.
    if (
      this.wanted &&
      this.token === token &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.token = token;
    this.wanted = true;
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    this.closeSocket();
    this.onConnected?.(false);
  }

  // Tear down the current socket, detaching handlers first so its onclose can't
  // schedule a reconnect and we never run two sockets in parallel.
  private closeSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = undefined;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already closing/closed
    }
  }

  private open(): void {
    if (!this.token) return;
    // Drop any existing socket before opening a new one.
    this.closeSocket();
    const ws = new WebSocket(`${this.wsUrl}?token=${this.token}`);
    this.ws = ws;
    ws.onopen = () => this.onConnected?.(true);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String((e as { data: unknown }).data));
        if (m.type === 'miss_you') {
          this.onIncoming?.({
            id: m.eventId ?? '',
            fromUserId: m.fromUserId ?? '',
            fromNickname: m.fromNickname ?? null,
            memory: m.memory ?? null,
            triggerType: m.triggerType ?? '',
            createdAt: m.createdAt ?? 0,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.onConnected?.(false);
      if (this.wanted) setTimeout(() => this.open(), 2000);
    };
    ws.onerror = () => this.onConnected?.(false);
  }
}
