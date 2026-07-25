import { BinaryReader, BinaryWriter } from './binary';
import {
  HEADER_MAGIC,
  HEADER_SIZE,
  MAX_BODY_LENGTH,
  PROTOCOL_VERSION,
  ProtocolError,
} from './constants';
import { crc16 } from './crc16';

export interface Packet {
  command: number;
  body: Uint8Array;
  version: number;
  bodyCrc: number;
}

// CRC is forced to 0 for an empty body (matching encode_packet).
export function encodePacket(command: number, body: Uint8Array = new Uint8Array(0)): Uint8Array {
  const bodyCrc = body.length ? crc16(body) : 0;
  return new BinaryWriter()
    .u8(HEADER_MAGIC)
    .u16(PROTOCOL_VERSION)
    .u16(command & 0xffff)
    .u32(body.length)
    .u16(bodyCrc)
    .bytes(body)
    .build();
}

export function peekBodyLength(data: Uint8Array): number {
  if (data.length < HEADER_SIZE) throw new ProtocolError('header too short');
  const r = new BinaryReader(data);
  r.u8(); // magic
  r.u16(); // version
  r.u16(); // command
  return r.u32();
}

export function decodePacket(raw: Uint8Array): Packet {
  if (raw.length < HEADER_SIZE) throw new ProtocolError('packet shorter than header');
  const r = new BinaryReader(raw);
  const magic = r.u8();
  if (magic !== HEADER_MAGIC) throw new ProtocolError(`bad magic 0x${magic.toString(16)}`);
  const version = r.u16();
  if (version > PROTOCOL_VERSION) throw new ProtocolError(`unsupported version ${version}`);
  const command = r.u16();
  const bodyLength = r.u32();
  if (bodyLength > MAX_BODY_LENGTH) throw new ProtocolError(`body too large: ${bodyLength}`);
  const bodyCrc = r.u16();
  if (raw.length < HEADER_SIZE + bodyLength) throw new ProtocolError('incomplete packet');
  const body = raw.slice(HEADER_SIZE, HEADER_SIZE + bodyLength);
  if (body.length) {
    const actual = crc16(body);
    if (actual !== bodyCrc) {
      throw new ProtocolError(
        `crc mismatch: header=0x${bodyCrc.toString(16)} actual=0x${actual.toString(16)}`,
      );
    }
  }
  return { command, body, version, bodyCrc };
}
