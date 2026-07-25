import { useSyncExternalStore } from 'react';
import { uploadRecordingBin } from '../api/uploadRecording';
import type { RingEvent } from '../protocol';
import { api } from '../services';
import { clearRing, saveSession } from '../store/session';
import { BleRingSource } from './BleRingSource';
import type { RingConnectionState } from './RingSource';
import {
  AutoRecordingReceiver,
  DownloadProgress,
  RecordingDownloader,
  RecordingResult,
} from './downloadRecording';

export interface RingServiceState {
  state: RingConnectionState;
  connectedId: string | null;
  connectedName: string | null;
  doubleCount: number;
  log: string[];
  error: string | null;
  downloading: boolean;
  autoReceiving: boolean;
  dlProgress: DownloadProgress | null;
  dlResult: RecordingResult | null;
  dlAuto: boolean;
  uploading: boolean;
  uploadMsg: string | null;
  // Auto-reconnect UI: true while retrying the last MAC, and true once every
  // retry has failed (surface a prompt + "back to connect page" button).
  reconnecting: boolean;
  reconnectFailed: boolean;
}

const INITIAL: RingServiceState = {
  state: 'disconnected',
  connectedId: null,
  connectedName: null,
  doubleCount: 0,
  log: [],
  error: null,
  downloading: false,
  autoReceiving: false,
  dlProgress: null,
  dlResult: null,
  dlAuto: false,
  uploading: false,
  uploadMsg: null,
  reconnecting: false,
  reconnectFailed: false,
};

// Auto-reconnect budget after an unexpected disconnect.
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;
// Cap so backoff never grows unbounded on a long-flapping link.
const RECONNECT_MAX_DELAY_MS = 10000;
// A freshly (re)connected link must stay up this long before we treat it as a
// real recovery and clear the retry budget. Without this, a ring that connects
// then instantly drops resets the counter on every attempt and reconnects
// forever, which surfaces to the user as endless disconnect/reconnect flapping.
const RECONNECT_STABLE_MS = 6000;

/**
 * App-wide, screen-independent owner of the live BLE ring connection.
 *
 * The button double-press log and the auto recording upload must not live inside
 * a screen's component state, or they would die the moment the user navigated
 * away. This singleton holds the connection instead, so once a ring is connected
 * (during onboarding or from the ring tab) it keeps parsing 0x0703 double-press
 * events and receiving + uploading unsolicited 0x0505 recordings in the
 * background — including as the user moves between tabs.
 *
 * State is exposed through a useSyncExternalStore-friendly snapshot so any screen
 * can render the live connection status without owning the connection lifecycle.
 */
class RingService {
  private snapshot: RingServiceState = INITIAL;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: RingEvent) => void>();

  private source: BleRingSource | null = null;
  private downloader: RecordingDownloader | null = null;
  private auto: AutoRecordingReceiver | null = null;

  // Last device we successfully connected to — the target for auto-reconnect.
  private lastDeviceId: string | null = null;
  private lastDeviceName: string | null = null;
  // Distinguishes a deliberate disconnect from an unexpected BLE drop.
  private manualDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Pending "connection has proven stable" timer; only when it fires do we clear
  // the retry budget, so transient connects don't reset it.
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Subscribe to every parsed ring event (e.g. button double-press). Lets a
   * screen react to hardware triggers without owning the connection — the home
   * screen uses this to send a 思念 on a real double-press.
   */
  onRingEvent = (listener: (e: RingEvent) => void): (() => void) => {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  };

  getSnapshot = (): RingServiceState => this.snapshot;

  get isConnected(): boolean {
    return this.snapshot.state === 'connected';
  }

  setError(message: string | null): void {
    this.set({ error: message });
  }

  addLog(line: string): void {
    const entry = `${new Date().toLocaleTimeString()}  ${line}`;
    this.set({ log: [entry, ...this.snapshot.log].slice(0, 40) });
  }

  private set(patch: Partial<RingServiceState>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  // Push a freshly captured recording to the backend `POST /recordings`.
  private async uploadRecording(r: RecordingResult): Promise<void> {
    this.set({ uploading: true, uploadMsg: null });
    const filename = `ring-${r.fileIndex}-${Date.now()}.bin`;
    this.addLog(`⬆️ 正在上传录音 #${r.fileIndex}…`);
    try {
      const resp = await uploadRecordingBin(r.data, filename, api.token);
      this.set({ uploadMsg: `已上传 ${resp.id} · ${resp.decodeStatus}` });
      this.addLog(`✅ 上传成功 ${resp.id} · ${resp.decodeStatus}`);
    } catch (e: any) {
      this.set({ uploadMsg: `上传失败：${e?.message ?? e}` });
      this.addLog(`❌ 上传失败：${e?.message ?? e}`);
    } finally {
      this.set({ uploading: false });
    }
  }

  async connect(deviceId: string, name: string | null): Promise<void> {
    // A user-initiated connect cancels any in-flight auto-reconnect and clears
    // a previous "reconnect failed" prompt.
    this.manualDisconnect = false;
    this.cancelReconnect();
    this.set({ reconnecting: false, reconnectFailed: false });
    await this.openConnection(deviceId, name);
  }

  /**
   * Reconnect to a ring remembered from a previous session (persisted MAC).
   * Called on launch by the background coordinator so the link comes back
   * without the user re-scanning. A failure feeds the normal auto-reconnect
   * loop rather than surfacing an error.
   */
  async reconnectFromStorage(mac: string, name: string | null): Promise<void> {
    this.manualDisconnect = false;
    this.lastDeviceId = mac;
    this.lastDeviceName = name;
    this.cancelReconnect();
    try {
      await this.openConnection(mac, name);
    } catch (e: any) {
      this.addLog(`重连异常：${e?.message ?? e}`);
      this.maybeReconnect();
    }
  }

  // Opens (or re-opens) the BLE link to a device. Shared by the user-initiated
  // connect and the automatic reconnect loop.
  private async openConnection(deviceId: string, name: string | null): Promise<void> {
    // Replace any previous connection before opening the new one.
    await this.teardownSource();

    const source = new BleRingSource(deviceId);
    source.onState = (s) => {
      this.set({ state: s });
      if (s === 'connected') {
        // Remember the device so an unexpected drop can reconnect to the same
        // MAC. Hide the reconnect UI, but do NOT clear the retry budget yet —
        // only a link that stays up (see armStableTimer) counts as recovered,
        // otherwise a ring that connects-then-drops would loop forever.
        this.lastDeviceId = deviceId;
        this.lastDeviceName = name;
        // Persist the MAC so a cold launch can auto-reconnect without scanning.
        void saveSession({ ringMac: deviceId, ringName: name ?? undefined });
        this.set({
          connectedId: deviceId,
          connectedName: name,
          reconnecting: false,
          reconnectFailed: false,
        });
        this.addLog(`已连接 ${deviceId}`);
        this.armStableTimer();
      } else if (s === 'disconnected') {
        // The link died before proving stable — keep the budget it consumed.
        this.clearStableTimer();
        if (this.snapshot.connectedId === deviceId) {
          this.set({ connectedId: null, connectedName: null });
        }
        this.addLog(`已断开 ${deviceId}`);
        // Unexpected drop → try to reconnect to the last known MAC.
        this.maybeReconnect();
      }
    };
    source.onError = (m) => {
      this.set({ error: m });
      this.downloader?.fail(m);
    };

    // Passive receiver for recordings the ring auto-uploads after saving. It
    // lives for the whole connection so uploads keep flowing in the background.
    this.auto = new AutoRecordingReceiver({
      onStart: () => {
        this.set({
          error: null,
          dlResult: null,
          dlAuto: true,
          autoReceiving: true,
          dlProgress: { received: 0, total: null },
        });
        this.addLog('🎙️ 检测到新录音，正在自动接收…');
      },
      onProgress: (p) => this.set({ dlProgress: p }),
      onComplete: (r) => {
        this.set({ dlResult: r, autoReceiving: false });
        this.addLog(`✅ 自动接收完成 #${r.fileIndex} · ${r.data.length} 字节`);
        void this.uploadRecording(r);
      },
      onError: (m) => {
        this.set({ error: m, autoReceiving: false });
        this.addLog(`⚠️ ${m}`);
      },
    });

    source.onEvent = (e) => {
      // A manual download owns the frame queue while it runs; otherwise the
      // auto-receiver captures unsolicited (auto-uploaded) recording frames.
      if (this.downloader) this.downloader.feed(e);
      else this.auto?.feed(e);
      if (e.type === 'buttonDoublePress') {
        this.set({ doubleCount: this.snapshot.doubleCount + 1 });
        this.addLog(`💍 按键双击！ ts=${e.timestampMs}ms`);
      } else if (e.type === 'audioFileCount') {
        this.addLog(`录音数量：${e.count}`);
      } else if (e.type === 'audioFileInfo') {
        this.addLog(`录音信息 #${e.info.fileIndex} · ${e.info.dataSize} 字节`);
      } else if (e.type === 'audioFrame') {
        // frames arrive rapidly — progress is shown separately, don't spam the log
      } else {
        this.addLog(`事件 ${e.type}`);
      }
      // Fan out to external subscribers (e.g. the home screen's 思念 sender).
      this.eventListeners.forEach((l) => l(e));
    };

    this.source = source;
    await source.connect();
  }

  // Schedules the next auto-reconnect attempt after an unexpected disconnect,
  // or surfaces a failure once the retry budget is exhausted.
  private maybeReconnect(): void {
    // Don't fight a deliberate disconnect, and only reconnect to a device we
    // actually connected to before.
    if (this.manualDisconnect || !this.lastDeviceId) return;
    // An attempt is already scheduled, or we're already back online.
    if (this.reconnectTimer || this.snapshot.state === 'connected') return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.set({ reconnecting: false, reconnectFailed: true });
      this.addLog('❌ 多次重连失败，请返回连接页面');
      return;
    }

    this.reconnectAttempts += 1;
    this.set({ reconnecting: true, reconnectFailed: false });
    this.addLog(`🔄 正在重连（第 ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS} 次）…`);
    // Back off so a flapping ring isn't hammered with immediate reconnects,
    // which itself can keep the link from ever settling.
    const delay = Math.min(
      RECONNECT_DELAY_MS * this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const id = this.lastDeviceId;
      if (!id || this.manualDisconnect) return;
      // On success onState('connected') clears the cycle; on failure
      // onState('disconnected') schedules the next attempt.
      void this.openConnection(id, this.lastDeviceName).catch((e: any) => {
        this.addLog(`重连异常：${e?.message ?? e}`);
        this.maybeReconnect();
      });
    }, delay);
  }

  // Marks the current connection "recovered" only after it survives
  // RECONNECT_STABLE_MS, then clears the retry budget. A drop before then leaves
  // the budget untouched so repeated flaps still exhaust it and surface failure.
  private armStableTimer(): void {
    this.clearStableTimer();
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null;
      this.reconnectAttempts = 0;
    }, RECONNECT_STABLE_MS);
  }

  private clearStableTimer(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearStableTimer();
    this.reconnectAttempts = 0;
  }

  // Tears down the live source without touching reconnect intent — internal
  // helper shared by openConnection (replace) and disconnect (intentional).
  private async teardownSource(): Promise<void> {
    this.auto?.cancel();
    this.auto = null;
    this.downloader = null;
    const src = this.source;
    this.source = null;
    if (src) {
      // Detach handlers so tearing the old link down doesn't look like an
      // unexpected drop and kick off a reconnect.
      src.onState = undefined;
      src.onEvent = undefined;
      src.onError = undefined;
      await src.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    // Deliberate disconnect: stop any reconnect cycle and clear its UI.
    this.manualDisconnect = true;
    this.cancelReconnect();
    this.set({ reconnecting: false, reconnectFailed: false });
    await this.teardownSource();
  }

  /**
   * Deliberate disconnect that also forgets the persisted ring, so the next
   * launch does NOT auto-reconnect. Used by the ring page's "断开当前戒指".
   */
  async forget(): Promise<void> {
    this.lastDeviceId = null;
    this.lastDeviceName = null;
    await clearRing();
    await this.disconnect();
  }

  // Dismiss the "reconnect failed" prompt (e.g. the user chose to return to the
  // connect page). Suppresses further auto-reconnect until the next connect().
  dismissReconnect(): void {
    this.manualDisconnect = true;
    this.cancelReconnect();
    this.set({ reconnecting: false, reconnectFailed: false });
  }

  // Download the most recent recording over the open BLE connection.
  async downloadLatest(): Promise<void> {
    const source = this.source;
    if (!source || !source.writeCommand) return;
    this.set({
      error: null,
      dlResult: null,
      dlAuto: false,
      uploadMsg: null,
      dlProgress: { received: 0, total: null },
      downloading: true,
    });
    const dl = new RecordingDownloader(
      (packet) => source.writeCommand!(packet),
      (p) => this.set({ dlProgress: p }),
    );
    this.downloader = dl;
    this.addLog('开始下载最近一次录音…');
    try {
      const r = await dl.start();
      this.set({ dlResult: r });
      this.addLog(`✅ 下载完成 #${r.fileIndex} · ${r.data.length} 字节`);
      void this.uploadRecording(r);
    } catch (e: any) {
      this.set({ error: e?.message ?? '下载失败' });
      this.addLog(`❌ 下载失败：${e?.message ?? e}`);
    } finally {
      this.downloader = null;
      this.set({ downloading: false });
    }
  }
}

/** App-wide singleton; the live ring connection outlives every screen. */
export const ringService = new RingService();

/** Subscribe a component to the live ring connection state. */
export function useRingService(): RingServiceState {
  return useSyncExternalStore(ringService.subscribe, ringService.getSnapshot);
}
