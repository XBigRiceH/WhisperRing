// Verbatim port of crc16_compute() (ring_sound.py) — init 0xFFFF, per-byte
// swap+fold. Ported arithmetically to guarantee bit-for-bit parity with the
// device, the Python SDK, and the Kotlin :protocol port. Every step masks 16 bits.
export function crc16(data: Uint8Array, initial = 0xffff): number {
  let crc = initial & 0xffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0xff;
    crc = ((crc >>> 8) | ((crc << 8) & 0xffff)) & 0xffff;
    crc ^= byte;
    crc &= 0xffff;
    crc ^= (crc & 0xff) >>> 4;
    crc &= 0xffff;
    crc ^= (crc << 8) << 4;
    crc &= 0xffff;
    crc ^= ((crc & 0xff) << 4) << 1;
    crc &= 0xffff;
  }
  return crc;
}
