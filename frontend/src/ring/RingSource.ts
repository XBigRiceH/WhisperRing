import { RingEvent } from '../protocol';

export type RingConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * A source of ring events. Backed by real BLE hardware and always surfaces
 * parsed RingEvents to the app.
 */
export interface RingSource {
  onEvent?: (event: RingEvent) => void;
  onState?: (state: RingConnectionState) => void;
  connect(): void;
  disconnect(): void;
  /**
   * Sends an already-encoded v4 packet to the ring (NUS RX). Optional because
   * not every transport supports writes; recording extraction commands need it.
   */
  writeCommand?(packet: Uint8Array): void | Promise<void>;
}
