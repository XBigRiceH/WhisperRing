import { decodePacket, Packet, peekBodyLength } from './codec';
import { HEADER_MAGIC, HEADER_SIZE, MAX_BODY_LENGTH, ProtocolError } from './constants';

/**
 * Reassembles BLE notification chunks into whole packets — port of PacketStream.
 * Buffers bytes, resyncs on the 0x3F magic (discarding pre-magic garbage), and
 * slices out complete packets. Oversize body_length clears the buffer + throws.
 */
export class PacketStream {
  private buffer: number[] = [];

  feed(data: Uint8Array): Packet[] {
    for (let i = 0; i < data.length; i++) this.buffer.push(data[i]);
    const packets: Packet[] = [];
    for (;;) {
      if (this.buffer.length === 0) return packets;

      const magicIndex = this.buffer.indexOf(HEADER_MAGIC);
      if (magicIndex < 0) {
        this.buffer.length = 0;
        return packets;
      }
      if (magicIndex > 0) this.buffer.splice(0, magicIndex);

      if (this.buffer.length < HEADER_SIZE) return packets;

      const header = new Uint8Array(this.buffer.slice(0, HEADER_SIZE));
      const bodyLength = peekBodyLength(header);
      if (bodyLength > MAX_BODY_LENGTH) {
        this.buffer.length = 0;
        throw new ProtocolError(`Body too large: ${bodyLength} bytes`);
      }
      const packetLength = HEADER_SIZE + bodyLength;
      if (this.buffer.length < packetLength) return packets;

      const packetBytes = new Uint8Array(this.buffer.slice(0, packetLength));
      this.buffer.splice(0, packetLength);
      packets.push(decodePacket(packetBytes));
    }
  }

  reset(): void {
    this.buffer.length = 0;
  }
}
