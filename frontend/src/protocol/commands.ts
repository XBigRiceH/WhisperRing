import { BinaryWriter } from './binary';
import { encodePacket } from './codec';
import { RingCommands } from './constants';

// Recording extraction request builders. Each returns a fully encoded v4 packet
// (11-byte header + body) ready to write to the NUS RX characteristic. Ports of
// the ring_sound.py audio request bodies (protocol.md §5.4). All bodies that the
// SDK sends lead with a u16 error_code placeholder fixed to 0.

/** 0x0501 — get the number of stored recordings. Empty body. */
export function encodeAudioCountRequest(): Uint8Array {
  return encodePacket(RingCommands.AUDIO_COUNT_REQ);
}

/** 0x0503 — start the normal extraction flow for a file; device replies 0x0504. */
export function encodeStartAudioExtract(fileIndex: number): Uint8Array {
  const body = new BinaryWriter().u16(0).u32(fileIndex).build();
  return encodePacket(RingCommands.AUDIO_EXTRACT_START, body);
}

/** 0x0509 — start quick extraction; device replies 0x0504 then streams 0x0505. */
export function encodeStartAudioExtractQuick(fileIndex: number): Uint8Array {
  const body = new BinaryWriter().u16(0).u32(fileIndex).build();
  return encodePacket(RingCommands.AUDIO_QUICK_EXTRACT_START, body);
}

/**
 * 0x0506 — request (or retry) the frame at a specific byte offset. The firmware
 * validates a 12-byte struct but only parses the first 10 bytes, so a trailing
 * u16 reserved padding (fixed 0) is required.
 */
export function encodeAudioFrameRequest(fileIndex: number, frameOffset: number): Uint8Array {
  const body = new BinaryWriter().u16(0).u32(fileIndex).u32(frameOffset).u16(0).build();
  return encodePacket(RingCommands.AUDIO_FRAME_REQ, body);
}

/** 0x0507 — end the normal extraction flow; device replies 0x0508. */
export function encodeEndAudioExtract(fileIndex: number): Uint8Array {
  const body = new BinaryWriter().u16(0).u32(fileIndex).build();
  return encodePacket(RingCommands.AUDIO_EXTRACT_END, body);
}

/** 0x050B — clear ALL recordings. Empty body. Destructive; device replies 0x050C. */
export function encodeClearAudioFiles(): Uint8Array {
  return encodePacket(RingCommands.AUDIO_CLEAR);
}
