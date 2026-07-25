import {
  AudioAssembler,
  RingEvent,
  encodeAudioCountRequest,
  encodeStartAudioExtractQuick,
} from '../protocol';

export interface RecordingResult {
  fileIndex: number;
  recordTime: number | null; // Unix seconds, from 0x0504 metadata
  data: Uint8Array; // raw length-prefixed Speex `.bin`
}

export interface DownloadProgress {
  received: number; // bytes assembled so far
  total: number | null; // expected data size (from 0x0504), null until known
}

type Writer = (packet: Uint8Array) => void | Promise<void>;

const INACTIVITY_TIMEOUT_MS = 15000;

/**
 * Drives the "download the most recent recording" flow over an already-open BLE
 * connection: 0x0501 count → pick the last index → 0x0509 quick extract →
 * assemble 0x0505 frames until is_end.
 *
 * The owner must forward every parsed {@link RingEvent} to {@link feed} and any
 * transport/device error to {@link fail}. The flow is protected by an inactivity
 * timeout that resets on each relevant event.
 */
export class RecordingDownloader {
  private assembler = new AudioAssembler();
  private recordTime: number | null = null;
  private totalSize: number | null = null;
  private extracting = false;
  private settled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resolveFn?: (r: RecordingResult) => void;
  private rejectFn?: (e: Error) => void;

  constructor(
    private readonly write: Writer,
    private readonly onProgress?: (p: DownloadProgress) => void,
    private readonly timeoutMs: number = INACTIVITY_TIMEOUT_MS,
  ) {}

  start(): Promise<RecordingResult> {
    return new Promise<RecordingResult>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
      this.arm();
      this.send(encodeAudioCountRequest());
    });
  }

  /** Owner forwards every parsed ring event here. */
  feed(event: RingEvent): void {
    if (this.settled) return;
    switch (event.type) {
      case 'audioFileCount':
        this.onCount(event.count);
        break;
      case 'audioFileInfo':
        this.recordTime = event.info.recordTime;
        this.totalSize = event.info.dataSize;
        this.arm();
        this.emitProgress();
        break;
      case 'audioFrame': {
        this.arm();
        const done = this.assembler.offer(event.frame);
        this.emitProgress();
        if (done) this.finish();
        break;
      }
      default:
        break;
    }
  }

  /** Owner forwards transport/device errors here to abort the flow. */
  fail(message: string): void {
    if (this.settled) return;
    this.settle();
    this.rejectFn?.(new Error(message));
  }

  private onCount(count: number): void {
    if (this.extracting) return; // ignore duplicate count replies
    if (count <= 0) {
      this.fail('设备中没有录音');
      return;
    }
    this.extracting = true;
    this.arm();
    this.send(encodeStartAudioExtractQuick(count - 1)); // latest = last index
  }

  private finish(): void {
    const data = this.assembler.result();
    const fileIndex = this.assembler.fileIndex ?? -1;
    this.settle();
    this.resolveFn?.({ fileIndex, recordTime: this.recordTime, data });
  }

  private send(packet: Uint8Array): void {
    Promise.resolve(this.write(packet)).catch((e) =>
      this.fail(`发送失败: ${e?.message ?? e}`),
    );
  }

  private emitProgress(): void {
    this.onProgress?.({ received: this.assembler.receivedLength, total: this.totalSize });
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('下载超时（设备无响应）'), this.timeoutMs);
  }

  private settle(): void {
    this.settled = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export interface AutoRecordingHandlers {
  onStart?: () => void;
  onProgress?: (p: DownloadProgress) => void;
  onComplete: (r: RecordingResult) => void;
  onError?: (message: string) => void;
}

/**
 * Passively captures a recording the ring auto-uploads after it is saved — the
 * `receive_auto_audio_file()` path (README §6.3 / protocol.md §5.4). No command
 * is sent: the device streams unsolicited 0x0505 frames (a fresh file_index, no
 * preceding 0x0504) until is_end=1.
 *
 * The owner forwards every ring event to {@link feed} ONLY while no manual
 * download is in flight (so the two never fight over the same frame queue). The
 * receiver lazily starts on the first frame, assembles via {@link AudioAssembler},
 * fires onComplete on is_end, then resets to catch the next recording. Gap
 * recovery (0x0503/0x0506 retransmit) is not implemented; a stalled transfer
 * times out and is discarded.
 */
export class AutoRecordingReceiver {
  private assembler = new AudioAssembler();
  private recordTime: number | null = null;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly handlers: AutoRecordingHandlers,
    private readonly timeoutMs: number = INACTIVITY_TIMEOUT_MS,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Owner forwards ring events here while no manual download is active. */
  feed(event: RingEvent): void {
    switch (event.type) {
      case 'audioFileInfo':
        // Some firmware may still precede an auto-upload with metadata.
        this.begin();
        this.recordTime = event.info.recordTime;
        this.arm();
        break;
      case 'audioFrame': {
        this.begin();
        const done = this.assembler.offer(event.frame);
        this.handlers.onProgress?.({ received: this.assembler.receivedLength, total: null });
        if (done) this.finish();
        else this.arm();
        break;
      }
      default:
        break;
    }
  }

  /** Discard any in-flight capture (e.g. on disconnect / unmount). */
  cancel(): void {
    this.reset();
  }

  private begin(): void {
    if (this.active) return;
    this.active = true;
    this.handlers.onStart?.();
  }

  private finish(): void {
    const data = this.assembler.result();
    const fileIndex = this.assembler.fileIndex ?? -1;
    const recordTime = this.recordTime;
    this.reset();
    this.handlers.onComplete({ fileIndex, recordTime, data });
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const wasActive = this.active;
      this.reset();
      if (wasActive) this.handlers.onError?.('自动录音接收超时，已丢弃未完成数据');
    }, this.timeoutMs);
  }

  private reset(): void {
    this.active = false;
    this.recordTime = null;
    this.assembler = new AudioAssembler();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
