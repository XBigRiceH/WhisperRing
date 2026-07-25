import { BinaryReader } from './binary';
import { Packet } from './codec';
import { RingCommands, DeviceError, ProtocolError } from './constants';

export interface SystemInfo {
  firmwareVersion: string;
  systemTime: number;
  audioStorageTotal: number;
  audioStorageAvailable: number;
  batteryPercent: number;
  batteryCharging: boolean;
  sn: string;
  cpuid: string;
  model: string;
}

export interface AudioFrame {
  fileIndex: number;
  frameOffset: number;
  frameSize: number;
  isEnd: boolean;
  data: Uint8Array;
}

// 0x0504 recording metadata (also the first reply of a quick extraction).
export interface AudioFileInfo {
  fileIndex: number;
  recordTime: number; // Unix seconds
  dataSize: number; // encoded (Speex) data-area size in bytes
}

export type RingEvent =
  | { type: 'buttonDoublePress'; timestampMs: number }
  | { type: 'imuDoubleTap'; timestampMs: number }
  | { type: 'buttonSinglePress'; timestampMs: number }
  | { type: 'systemInfo'; info: SystemInfo }
  | { type: 'audioFileCount'; count: number }
  | { type: 'audioFileInfo'; info: AudioFileInfo }
  | { type: 'audioFrame'; frame: AudioFrame }
  | { type: 'audioExtractEnd'; fileIndex: number }
  | { type: 'audioCleared' }
  | { type: 'unknown'; command: number; body: Uint8Array };

function ensureSuccess(code: number): void {
  if (code !== 0) throw new DeviceError(code);
}

// Event reports (0x0701/0x0703/0x0704) carry NO error_code — body is a bare u32.
function timestamp(body: Uint8Array): number {
  const r = new BinaryReader(body);
  const ts = r.u32();
  if (r.remaining !== 0) throw new ProtocolError('unexpected trailing bytes in event body');
  return ts;
}

export function parseSystemInfo(body: Uint8Array): SystemInfo {
  const r = new BinaryReader(body);
  ensureSuccess(r.u16());
  return {
    firmwareVersion: r.stringU16(),
    systemTime: r.u32(),
    audioStorageTotal: r.u32(),
    audioStorageAvailable: r.u32(),
    batteryPercent: r.u16(),
    batteryCharging: r.u8() !== 0,
    sn: r.stringU16(),
    cpuid: r.stringU16(),
    model: r.stringU16(),
  };
}

export function parseAudioFrame(body: Uint8Array): AudioFrame {
  const r = new BinaryReader(body);
  ensureSuccess(r.u16());
  const fileIndex = r.u32();
  const frameOffset = r.u32();
  const frameSize = r.u32();
  const isEnd = r.u8() !== 0;
  if (r.remaining !== frameSize) {
    throw new ProtocolError(`frame_size ${frameSize} != remaining ${r.remaining}`);
  }
  return { fileIndex, frameOffset, frameSize, isEnd, data: r.bytes(frameSize) };
}

// 0x0502 recording count response.
export function parseAudioFileCount(body: Uint8Array): number {
  const r = new BinaryReader(body);
  ensureSuccess(r.u16());
  return r.u32();
}

// 0x0504 recording metadata response.
export function parseAudioFileInfo(body: Uint8Array): AudioFileInfo {
  const r = new BinaryReader(body);
  ensureSuccess(r.u16());
  const info = { fileIndex: r.u32(), recordTime: r.u32(), dataSize: r.u32() };
  if (r.remaining !== 0) throw new ProtocolError('unexpected trailing audio file info bytes');
  return info;
}

// 0x0508 end-extraction response — error_code + file_index.
export function parseAudioExtractEnd(body: Uint8Array): number {
  const r = new BinaryReader(body);
  ensureSuccess(r.u16());
  return r.u32();
}

// 0x050C clear-recordings response — error_code only.
export function parseAudioClear(body: Uint8Array): void {
  ensureSuccess(new BinaryReader(body).u16());
}

export function parseEvent(packet: Packet): RingEvent {
  switch (packet.command) {
    case RingCommands.KEY_DOUBLE_PRESS:
      return { type: 'buttonDoublePress', timestampMs: timestamp(packet.body) };
    case RingCommands.IMU_DOUBLE_TAP:
      return { type: 'imuDoubleTap', timestampMs: timestamp(packet.body) };
    case RingCommands.KEY_SINGLE_PRESS:
      return { type: 'buttonSinglePress', timestampMs: timestamp(packet.body) };
    case RingCommands.SYSTEM_INFO_RESP:
      return { type: 'systemInfo', info: parseSystemInfo(packet.body) };
    case RingCommands.AUDIO_COUNT_RESP:
      return { type: 'audioFileCount', count: parseAudioFileCount(packet.body) };
    case RingCommands.AUDIO_FILE_INFO:
      return { type: 'audioFileInfo', info: parseAudioFileInfo(packet.body) };
    case RingCommands.AUDIO_DATA_FRAME:
      return { type: 'audioFrame', frame: parseAudioFrame(packet.body) };
    case RingCommands.AUDIO_EXTRACT_END_RESP:
      return { type: 'audioExtractEnd', fileIndex: parseAudioExtractEnd(packet.body) };
    case RingCommands.AUDIO_CLEAR_RESP:
      parseAudioClear(packet.body);
      return { type: 'audioCleared' };
    default:
      return { type: 'unknown', command: packet.command, body: packet.body };
  }
}

/**
 * Assembles auto-uploaded recording frames into the raw Speex `.bin` — port of
 * the receive_auto_audio_file assembly (offset-ordered, is_end terminates).
 */
export class AudioAssembler {
  fileIndex: number | null = null;
  isComplete = false;
  private received: number[] = [];
  private pending = new Map<number, Uint8Array>();
  private endOffset: number | null = null;

  offer(frame: AudioFrame): boolean {
    if (this.fileIndex === null) this.fileIndex = frame.fileIndex;
    else if (this.fileIndex !== frame.fileIndex) throw new ProtocolError('file_index mismatch');
    this.addFrame(frame.frameOffset, frame.data, frame.isEnd);
    this.drainPending();
    if (this.endOffset !== null && this.received.length >= this.endOffset) this.isComplete = true;
    return this.isComplete;
  }

  private addFrame(offset: number, data: Uint8Array, isEnd: boolean): void {
    const frameEnd = offset + data.length;
    if (isEnd && this.endOffset === null) this.endOffset = frameEnd;
    const recvLen = this.received.length;
    if (frameEnd <= recvLen) return; // duplicate
    if (offset <= recvLen) {
      for (let i = recvLen - offset; i < data.length; i++) this.received.push(data[i]);
    } else {
      this.pending.set(offset, data); // future frame
    }
  }

  private drainPending(): void {
    for (;;) {
      if (this.pending.size === 0) break;
      let first = Infinity;
      for (const k of this.pending.keys()) if (k < first) first = k;
      if (first > this.received.length) break;
      const data = this.pending.get(first)!;
      this.pending.delete(first);
      this.addFrame(first, data, false);
    }
  }

  /** Bytes assembled so far (cheap — for progress display without a slice copy). */
  get receivedLength(): number {
    return this.received.length;
  }

  result(): Uint8Array {
    const bytes = new Uint8Array(this.received);
    if (this.endOffset !== null && this.endOffset <= bytes.length) return bytes.slice(0, this.endOffset);
    return bytes;
  }
}
