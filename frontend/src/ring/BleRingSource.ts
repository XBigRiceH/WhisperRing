import type { Device, Subscription } from 'react-native-ble-plx';
import { PacketStream, parseEvent } from '../protocol';
import { base64ToBytes, bytesToBase64, getBleManager, NUS_RX, NUS_SERVICE, NUS_TX } from './bleManager';
import { RingSource } from './RingSource';

// SDK send strategy: split RX writes into fixed 20-byte fragments, last one
// shorter (protocol.md §2). This is a transport choice, not a v4 packet boundary.
const NUS_WRITE_CHUNK = 20;

/**
 * A real Bluetooth ring. Connects to a chosen device, subscribes to the NUS TX
 * characteristic, and feeds every notification chunk through the shared
 * PacketStream + parseEvent pipeline, so the app only ever sees RingEvents.
 */
export class BleRingSource implements RingSource {
  onEvent?: RingSource['onEvent'];
  onState?: RingSource['onState'];
  /** Optional raw-bytes tap for the debug page (hex dump of each TX chunk). */
  onRawChunk?: (bytes: Uint8Array) => void;
  /** Optional error sink so the UI can surface connection/monitor failures. */
  onError?: (message: string) => void;

  private stream = new PacketStream();
  private device: Device | null = null;
  private monitor: Subscription | null = null;
  private disconnectSub: Subscription | null = null;

  constructor(private readonly deviceId: string) {}

  async connect(): Promise<void> {
    const manager = getBleManager();
    if (!manager) {
      this.onError?.('蓝牙不可用（需 development build，Expo Go 不支持）');
      this.onState?.('disconnected');
      return;
    }
    this.stream.reset();
    this.onState?.('connecting');
    try {
      let dev = await manager.connectToDevice(this.deviceId, { requestMTU: 247 });
      dev = await dev.discoverAllServicesAndCharacteristics();
      this.device = dev;

      this.disconnectSub = manager.onDeviceDisconnected(this.deviceId, () => {
        this.cleanup();
        this.onState?.('disconnected');
      });

      this.monitor = dev.monitorCharacteristicForService(
        NUS_SERVICE,
        NUS_TX,
        (error, ch) => {
          if (error) {
            // Cancelled monitor on disconnect is expected — ignore it.
            if (error.errorCode === 2 /* OperationCancelled */) return;
            this.onError?.(error.message);
            return;
          }
          if (!ch?.value) return;
          const bytes = base64ToBytes(ch.value);
          this.onRawChunk?.(bytes);
          try {
            for (const packet of this.stream.feed(bytes)) this.onEvent?.(parseEvent(packet));
          } catch (e: any) {
            this.onError?.(`解析失败: ${e?.message ?? e}`);
          }
        },
      );

      this.onState?.('connected');
    } catch (e: any) {
      this.cleanup();
      this.onError?.(e?.message ?? String(e));
      this.onState?.('disconnected');
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    try {
      await getBleManager()?.cancelDeviceConnection(this.deviceId);
    } catch {
      // already gone
    }
    this.onState?.('disconnected');
  }

  /**
   * Writes an encoded v4 packet to the NUS RX characteristic in fixed 20-byte
   * fragments (last shorter). Use with the protocol command builders, e.g.
   * `writeCommand(encodeStartAudioExtractQuick(index))`.
   */
  async writeCommand(packet: Uint8Array): Promise<void> {
    const dev = this.device;
    if (!dev) {
      this.onError?.('写失败：未连接戒指');
      return;
    }
    try {
      for (let off = 0; off < packet.length; off += NUS_WRITE_CHUNK) {
        const chunk = packet.slice(off, off + NUS_WRITE_CHUNK);
        await dev.writeCharacteristicWithoutResponseForService(
          NUS_SERVICE,
          NUS_RX,
          bytesToBase64(chunk),
        );
      }
    } catch (e: any) {
      this.onError?.(`写失败: ${e?.message ?? e}`);
    }
  }

  private cleanup(): void {
    this.monitor?.remove();
    this.monitor = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.device = null;
  }
}
