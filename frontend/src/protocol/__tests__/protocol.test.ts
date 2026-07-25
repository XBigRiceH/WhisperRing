import {
  AudioAssembler,
  RingCommands,
  crc16,
  decodePacket,
  encodePacket,
  encodeAudioCountRequest,
  encodeStartAudioExtract,
  encodeStartAudioExtractQuick,
  encodeAudioFrameRequest,
  encodeEndAudioExtract,
  encodeClearAudioFiles,
  parseAudioFileCount,
  parseAudioFileInfo,
  parseAudioExtractEnd,
  parseAudioClear,
  DeviceError,
  PacketStream,
  parseEvent,
  ProtocolError,
  RingEvent,
} from '../index';
import { bytesToHex, BinaryWriter, hexToBytes } from '../binary';
import vectors from './vectors.json';

// Golden vectors generated from the Python SDK (backend/scripts/gen_test_vectors.py).
// The same file drives the Kotlin :protocol tests — 3-way parity.

describe('crc16', () => {
  it('matches golden vectors', () => {
    for (const c of vectors.crc16) {
      expect(crc16(hexToBytes(c.data))).toBe(c.crc);
    }
  });
  it('empty is init value 0xFFFF', () => {
    expect(crc16(new Uint8Array(0))).toBe(0xffff);
  });
});

describe('codec', () => {
  it('encode matches golden', () => {
    for (const c of vectors.encode) {
      expect(bytesToHex(encodePacket(c.command, hexToBytes(c.body)))).toBe(c.packet);
    }
  });
  it('decode reverses encode', () => {
    for (const c of vectors.encode) {
      const p = decodePacket(hexToBytes(c.packet));
      expect(p.command).toBe(c.command);
      expect(p.version).toBe(4);
      expect(bytesToHex(p.body)).toBe(c.body);
    }
  });
  it('empty body forces zero crc', () => {
    expect(bytesToHex(encodePacket(0x0101))).toBe('3f00040101000000000000');
  });
  it('corrupt body byte fails crc', () => {
    const original = encodePacket(0x0102, new Uint8Array([1, 2, 3, 4, 5]));
    original[11] = (original[11] + 1) & 0xff;
    expect(() => decodePacket(original)).toThrow(ProtocolError);
  });
  it('rejects version above four', () => {
    const p = encodePacket(0x0101);
    p[2] = 5;
    expect(() => decodePacket(p)).toThrow(/version/);
  });
});

describe('PacketStream', () => {
  const p1 = encodePacket(0x0703, new Uint8Array([0, 0, 0, 111]));
  const p2 = encodePacket(0x0101);
  const p3 = encodePacket(0x0102, new Uint8Array([1, 2, 3, 4]));

  it('golden stream with leading garbage', () => {
    const bytes = hexToBytes(vectors.packetStream.stream);
    const packets = new PacketStream().feed(bytes);
    expect(packets.length).toBe(vectors.packetStream.expected.length);
    vectors.packetStream.expected.forEach((exp: any, i: number) => {
      expect(packets[i].command).toBe(exp.command);
      expect(bytesToHex(packets[i].body)).toBe(exp.body);
    });
  });

  it('single packet split across three chunks', () => {
    const s = new PacketStream();
    expect(s.feed(p1.slice(0, 4)).length).toBe(0);
    expect(s.feed(p1.slice(4, 9)).length).toBe(0);
    expect(s.feed(p1.slice(9)).length).toBe(1);
  });

  it('two packets in one chunk', () => {
    const out = new PacketStream().feed(new Uint8Array([...p1, ...p2]));
    expect(out.map((p) => p.command)).toEqual([0x0703, 0x0101]);
  });

  it('leading garbage resync', () => {
    const out = new PacketStream().feed(new Uint8Array([0x00, 0x11, 0x22, ...p3]));
    expect(out.length).toBe(1);
    expect(bytesToHex(out[0].body)).toBe('01020304');
  });

  it('oversize body clears and throws', () => {
    const bogus = new BinaryWriter()
      .u8(0x3f)
      .u16(4)
      .u16(0x0505)
      .u32(5121)
      .u16(0)
      .build();
    expect(() => new PacketStream().feed(bogus)).toThrow(ProtocolError);
  });
});

describe('event parsers', () => {
  it('parses event timestamps', () => {
    const e = vectors.events;
    const bd = parseEvent(decodePacket(hexToBytes(e.buttonDoublePress.packet))) as Extract<RingEvent, { type: 'buttonDoublePress' }>;
    expect(bd.type).toBe('buttonDoublePress');
    expect(bd.timestampMs).toBe(e.buttonDoublePress.timestampMs);
    expect(parseEvent(decodePacket(hexToBytes(e.imuDoubleTap.packet))).type).toBe('imuDoubleTap');
    expect(parseEvent(decodePacket(hexToBytes(e.buttonSinglePress.packet))).type).toBe('buttonSinglePress');
  });

  it('parses system info all fields', () => {
    const si = vectors.systemInfo;
    const ev = parseEvent(decodePacket(hexToBytes(si.packet))) as Extract<RingEvent, { type: 'systemInfo' }>;
    expect(ev.info.firmwareVersion).toBe(si.fields.firmwareVersion);
    expect(ev.info.systemTime).toBe(si.fields.systemTime);
    expect(ev.info.audioStorageTotal).toBe(si.fields.audioStorageTotal);
    expect(ev.info.audioStorageAvailable).toBe(si.fields.audioStorageAvailable);
    expect(ev.info.batteryPercent).toBe(si.fields.batteryPercent);
    expect(ev.info.batteryCharging).toBe(si.fields.batteryCharging);
    expect(ev.info.sn).toBe(si.fields.sn);
    expect(ev.info.cpuid).toBe(si.fields.cpuid);
    expect(ev.info.model).toBe(si.fields.model);
  });
});

describe('AudioAssembler', () => {
  function frames() {
    return vectors.audioFrames.frames.map(
      (hex: string) => (parseEvent(decodePacket(hexToBytes(hex))) as Extract<RingEvent, { type: 'audioFrame' }>).frame,
    );
  }
  const expected = hexToBytes(vectors.audioFrames.assembled);

  it('assembles in-order frames', () => {
    const asm = new AudioAssembler();
    let done = false;
    for (const f of frames()) done = asm.offer(f);
    expect(done).toBe(true);
    expect(bytesToHex(asm.result())).toBe(bytesToHex(expected));
  });

  it('reorders out-of-order frames', () => {
    const asm = new AudioAssembler();
    for (const f of frames().reverse()) asm.offer(f);
    expect(asm.isComplete).toBe(true);
    expect(bytesToHex(asm.result())).toBe(bytesToHex(expected));
  });

  it('incomplete without end frame', () => {
    const asm = new AudioAssembler();
    const fs = frames();
    for (const f of fs.slice(0, fs.length - 1)) asm.offer(f);
    expect(asm.isComplete).toBe(false);
  });
});

describe('recording command builders', () => {
  function bodyOf(packet: Uint8Array): string {
    return bytesToHex(decodePacket(packet).body);
  }

  it('0x0501 count request has empty body', () => {
    const p = decodePacket(encodeAudioCountRequest());
    expect(p.command).toBe(RingCommands.AUDIO_COUNT_REQ);
    expect(p.body.length).toBe(0);
  });

  it('0x0503 / 0x0509 start extract carry error_code=0 + file_index', () => {
    const normal = decodePacket(encodeStartAudioExtract(7));
    expect(normal.command).toBe(RingCommands.AUDIO_EXTRACT_START);
    expect(bytesToHex(normal.body)).toBe('000000000007');
    const quick = decodePacket(encodeStartAudioExtractQuick(7));
    expect(quick.command).toBe(RingCommands.AUDIO_QUICK_EXTRACT_START);
    expect(bytesToHex(quick.body)).toBe('000000000007');
  });

  it('0x0506 frame request keeps trailing u16 reserved padding', () => {
    const p = decodePacket(encodeAudioFrameRequest(7, 0x1900));
    expect(p.command).toBe(RingCommands.AUDIO_FRAME_REQ);
    // error_code(0) + file_index(7) + frame_offset(0x1900) + reserved(0)
    expect(bytesToHex(p.body)).toBe('00000000000700001900 0000'.replace(/\s/g, ''));
    expect(p.body.length).toBe(12);
  });

  it('0x0507 end extract carries error_code=0 + file_index', () => {
    expect(bodyOf(encodeEndAudioExtract(9))).toBe('000000000009');
  });

  it('0x050B clear has empty body', () => {
    const p = decodePacket(encodeClearAudioFiles());
    expect(p.command).toBe(RingCommands.AUDIO_CLEAR);
    expect(p.body.length).toBe(0);
  });
});

describe('recording response parsers', () => {
  it('0x0502 count response', () => {
    const body = new BinaryWriter().u16(0).u32(3).build();
    expect(parseAudioFileCount(body)).toBe(3);
    const ev = parseEvent({ command: RingCommands.AUDIO_COUNT_RESP, body, version: 4, bodyCrc: 0 });
    expect(ev).toEqual({ type: 'audioFileCount', count: 3 });
  });

  it('0x0504 file info response', () => {
    const body = new BinaryWriter().u16(0).u32(7).u32(1700000000).u32(66000).build();
    expect(parseAudioFileInfo(body)).toEqual({ fileIndex: 7, recordTime: 1700000000, dataSize: 66000 });
    const ev = parseEvent({ command: RingCommands.AUDIO_FILE_INFO, body, version: 4, bodyCrc: 0 });
    expect(ev.type).toBe('audioFileInfo');
  });

  it('0x0504 rejects trailing bytes', () => {
    const body = new BinaryWriter().u16(0).u32(7).u32(1).u32(2).u8(0xff).build();
    expect(() => parseAudioFileInfo(body)).toThrow(ProtocolError);
  });

  it('0x0508 end-extract response returns file_index', () => {
    const body = new BinaryWriter().u16(0).u32(9).build();
    expect(parseAudioExtractEnd(body)).toBe(9);
    const ev = parseEvent({ command: RingCommands.AUDIO_EXTRACT_END_RESP, body, version: 4, bodyCrc: 0 });
    expect(ev).toEqual({ type: 'audioExtractEnd', fileIndex: 9 });
  });

  it('0x050C clear response', () => {
    const body = new BinaryWriter().u16(0).build();
    expect(() => parseAudioClear(body)).not.toThrow();
    const ev = parseEvent({ command: RingCommands.AUDIO_CLEAR_RESP, body, version: 4, bodyCrc: 0 });
    expect(ev).toEqual({ type: 'audioCleared' });
  });

  it('non-zero error_code raises DeviceError', () => {
    const body = new BinaryWriter().u16(3).u32(0).build(); // FILE_NOT_EXIST
    expect(() => parseAudioFileCount(body)).toThrow(DeviceError);
  });
});
