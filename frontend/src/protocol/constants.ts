// v4 wire-protocol constants (see ring_sound.py / README §3).
export const HEADER_MAGIC = 0x3f;
export const PROTOCOL_VERSION = 4;
export const HEADER_SIZE = 11;
export const MAX_BODY_LENGTH = 5120;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export class DeviceError extends Error {
  constructor(public errorCode: number) {
    super(`device error code=${errorCode}`);
    this.name = 'DeviceError';
  }
}

export const RingCommands = {
  SYSTEM_INFO_REQ: 0x0101,
  SYSTEM_INFO_RESP: 0x0102,
  // Recording extraction (protocol.md §5.4).
  AUDIO_COUNT_REQ: 0x0501, // get audio file count (empty body)
  AUDIO_COUNT_RESP: 0x0502,
  AUDIO_EXTRACT_START: 0x0503, // start normal extraction
  AUDIO_FILE_INFO: 0x0504, // recording metadata (also first quick-extract reply)
  AUDIO_DATA_FRAME: 0x0505,
  AUDIO_FRAME_REQ: 0x0506, // request/retry a specific offset
  AUDIO_EXTRACT_END: 0x0507, // end normal extraction
  AUDIO_EXTRACT_END_RESP: 0x0508,
  AUDIO_QUICK_EXTRACT_START: 0x0509, // start quick extraction (device pushes frames)
  AUDIO_CLEAR: 0x050b, // clear ALL recordings (destructive)
  AUDIO_CLEAR_RESP: 0x050c,
  IMU_DOUBLE_TAP: 0x0701, // tap ring body (recording mode)
  GESTURE: 0x0702,
  KEY_DOUBLE_PRESS: 0x0703, // F1 trigger — works in any mode, no mode toggle
  KEY_SINGLE_PRESS: 0x0704, // toggles record/gesture mode (blind)
} as const;
