import { useSyncExternalStore } from 'react';
import * as Haptics from 'expo-haptics';
import { showMissYou } from '../notify';
import { ringService } from '../ring/ringService';
import { api, realtime } from '../services';
import { DEFAULT_TAP_REACTIONS, loadSession, TapReaction } from '../store/session';
import { updateWidget } from '../widget';

export interface CoordinatorState {
  wsConnected: boolean;
  sentToday: number;
  receivedToday: number;
  lastMemory: string | null;
  lastFrom: string | null;
  lastTickAt: number | null;
  /** Set when a 思念 arrives and the user's reaction includes 'popup'. */
  popup: { from: string | null; memory: string | null; at: number } | null;
  toast: string | null;
}

const INITIAL: CoordinatorState = {
  wsConnected: false,
  sentToday: 0,
  receivedToday: 0,
  lastMemory: null,
  lastFrom: null,
  lastTickAt: null,
  popup: null,
  toast: null,
};

/**
 * App-wide, screen-independent coordinator — the software's "always-on" layer.
 *
 * It owns the realtime (思念 push) socket, listens to the ring's hardware
 * double-press to send a 思念, applies the user's chosen reaction when a 思念
 * arrives, keeps daily counters, and mirrors everything into the home-screen
 * widget. Because it lives outside the navigation tree (started once in the root
 * layout) it keeps running as the user moves between tabs and screens, and — on
 * a native build with background BLE enabled — while the app is backgrounded.
 */
class Coordinator {
  private snapshot: CoordinatorState = INITIAL;
  private listeners = new Set<() => void>();

  private started = false;
  private reactions: TapReaction[] = [];
  private offRingEvent?: () => void;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CoordinatorState => this.snapshot;

  private set(patch: Partial<CoordinatorState>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
    this.mirrorToWidget();
  }

  /** Which reactions to run on an incoming 思念; refreshed from settings. */
  setReactions(reactions: TapReaction[]): void {
    this.reactions = reactions;
  }

  clearToast(): void {
    if (this.snapshot.toast) this.set({ toast: null });
  }

  dismissPopup(): void {
    if (this.snapshot.popup) this.set({ popup: null });
  }

  /** Tear down live state on logout: drop the socket and reset the counters. */
  logout(): void {
    realtime.disconnect();
    this.seeded = false; // next login seeds the new account's stats
    this.set({
      wsConnected: false,
      sentToday: 0,
      receivedToday: 0,
      lastMemory: null,
      lastFrom: null,
      lastTickAt: null,
      popup: null,
      toast: null,
    });
  }

  private mirrorToWidget(): void {
    void updateWidget({
      lastFrom: this.snapshot.lastFrom,
      lastMemory: this.snapshot.lastMemory,
      lastTickAt: this.snapshot.lastTickAt,
      todayCount: this.snapshot.receivedToday,
    });
  }

  /** Send a 思念 for the given trigger (ring double-press or in-app tap);
   * an optional custom memory text rides along (in-app compose only). */
  sendMissYou = (trigger: string, memory?: string): void => {
    api
      .missYou(trigger, memory)
      .then((r) => {
        this.set({
          sentToday: this.snapshot.sentToday + 1,
          toast: r.delivered ? '已送达 💌' : '已发送（对方离线，稍后补收）',
        });
      })
      .catch((e) => this.set({ toast: '发送失败：' + (e?.message ?? e) }));
  };

  /** Run the user-configured reaction to an incoming 思念. */
  private async react(from: string | null, memory: string | null): Promise<void> {
    if (this.reactions.includes('vibrate')) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
    if (this.reactions.includes('push')) {
      await showMissYou(from, memory);
    }
    if (this.reactions.includes('popup')) {
      this.set({ popup: { from, memory, at: Date.now() } });
    }
  }

  /**
   * Start the always-on layer. Idempotent — the root layout calls it on mount
   * and after any session change (login / partner switch / reaction settings).
   */
  async start(): Promise<void> {
    const s = await loadSession();
    this.reactions = s.tapReactions ?? DEFAULT_TAP_REACTIONS;

    if (this.started) {
      if (s.token) {
        api.token = s.token;
        realtime.connect(s.token);
        // First start() may have run before login (no token) — seed now.
        void this.seedFromServer();
      }
      return;
    }
    this.started = true;

    // Real ring triggers → send a 思念. Owned here (not in a screen) so a
    // double-press always sends, regardless of which tab is visible.
    this.offRingEvent = ringService.onRingEvent((ev) => {
      if (ev.type !== 'buttonDoublePress' && ev.type !== 'imuDoubleTap') return;
      const trigger = ev.type === 'buttonDoublePress' ? 'button_double' : 'imu_double';
      this.sendMissYou(trigger);
    });

    realtime.onConnected = (connected) => this.set({ wsConnected: connected });
    realtime.onIncoming = (inc) => {
      const at = Date.now();
      this.set({
        receivedToday: this.snapshot.receivedToday + 1,
        lastMemory: inc.memory,
        lastFrom: inc.fromNickname,
        lastTickAt: at,
        toast: `💍 收到 ${inc.fromNickname ?? 'TA'} 的思念`,
      });
      void this.react(inc.fromNickname, inc.memory);
    };

    if (s.token) {
      api.token = s.token;
      realtime.connect(s.token);
      void this.seedFromServer();
    }

    // Auto-reconnect the last ring (persisted MAC) so the link comes back on a
    // fresh launch without the user re-scanning.
    if (s.ringMac) {
      void ringService.reconnectFromStorage(s.ringMac, s.ringName ?? null);
    }
  }

  private seeded = false;

  /**
   * One-time server seeding of the 想念记录 card: the cumulative sent/received
   * counters come from GET /events/miss-you/stats (local counters only grow
   * while the app runs), the "last received" text from the unread backlog.
   * Retried on the next start() if it ran without a token or every call failed.
   */
  private async seedFromServer(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;

    let ok = false;

    // Cumulative totals — authoritative for the counters.
    try {
      const stats = await api.missYouStats();
      this.set({ sentToday: stats.sent, receivedToday: stats.received });
      ok = true;
    } catch {}

    // Unread backlog — seeds the "last received" text (and, only if the stats
    // call failed, a coarse received count so the card isn't stuck at 0).
    try {
      const { events } = await api.events(0);
      if (events.length) {
        const latest = events[events.length - 1];
        this.set({
          lastMemory: latest.memory,
          lastFrom: latest.fromNickname,
          lastTickAt: latest.createdAt * 1000,
          ...(ok ? {} : { receivedToday: events.length }),
        });
        ok = true;
      }
    } catch {}

    if (!ok) this.seeded = false; // both calls failed — retry on next start()
  }
}

/** App-wide singleton; outlives every screen. */
export const coordinator = new Coordinator();

/** Subscribe a component to the live coordinator state. */
export function useCoordinator(): CoordinatorState {
  return useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
}
