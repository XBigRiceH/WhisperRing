// Byte helpers + big-endian reader/writer. Mirrors the Kotlin :protocol BinaryIo
// and the Python SDK. u32 fits safely in a JS number (< 2^53).

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`odd-length hex: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Manual UTF-8 (no reliance on TextEncoder/TextDecoder across Hermes/Node).
export function utf8Encode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

export class BinaryReader {
  private pos = 0;
  constructor(private data: Uint8Array) {}

  get remaining(): number {
    return this.data.length - this.pos;
  }

  require(n: number): void {
    if (this.remaining < n) throw new Error(`need ${n} bytes, have ${this.remaining}`);
  }

  u8(): number {
    this.require(1);
    return this.data[this.pos++];
  }

  u16(): number {
    this.require(2);
    const v = (this.data[this.pos] << 8) | this.data[this.pos + 1];
    this.pos += 2;
    return v;
  }

  i16(): number {
    const v = this.u16();
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  u32(): number {
    this.require(4);
    const b = this.data;
    // multiplication for the top byte keeps the result unsigned
    const v = b[this.pos] * 0x1000000 + (b[this.pos + 1] << 16) + (b[this.pos + 2] << 8) + b[this.pos + 3];
    this.pos += 4;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.require(n);
    const out = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  stringU16(): string {
    return utf8Decode(this.bytes(this.u16()));
  }
}

export class BinaryWriter {
  private buf: number[] = [];

  u8(v: number): this {
    this.buf.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    this.buf.push((v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  u32(v: number): this {
    this.buf.push(Math.floor(v / 0x1000000) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  bytes(b: Uint8Array): this {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
    return this;
  }

  stringU16(s: string): this {
    const raw = utf8Encode(s);
    this.u16(raw.length);
    this.bytes(raw);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}
