import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager as BleManagerType } from 'react-native-ble-plx';

// Nordic UART Service — the ring's BLE transport (硬件2.0/protocol.md §2).
export const NUS_SERVICE = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const NUS_TX = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // ring notifies app
export const NUS_RX = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // app writes ring

let manager: BleManagerType | null = null;
let initError: string | null = null;

/**
 * Lazily constructs the singleton BleManager. Returns null (and records the
 * reason in bleInitError) when the native module is missing — i.e. in Expo Go,
 * on web, or in Jest — so the UI can degrade to a friendly message instead of
 * crashing. Real BLE requires a development build (npx expo run:android).
 */
export function getBleManager(): BleManagerType | null {
  if (manager) return manager;
  if (initError) return null;
  try {
    const { BleManager } = require('react-native-ble-plx');
    manager = new BleManager();
    return manager;
  } catch (e: any) {
    initError = e?.message ?? String(e);
    return null;
  }
}

export function bleInitError(): string | null {
  return initError;
}

/** Runtime BLE permissions. Android 12+ needs SCAN+CONNECT; older needs location. */
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;
  try {
    if (api >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        res['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
        res['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ble-plx delivers characteristic values as base64. Decode without depending on
// a global atob (not guaranteed across RN runtimes) — Speex bytes must be exact.
const B64_LOOKUP = (() => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  return table;
})();

export function base64ToBytes(b64: string): Uint8Array {
  let len = b64.length;
  while (len > 0 && b64[len - 1] === '=') len--;
  const out = new Uint8Array((len * 3) >> 2);
  let bits = 0;
  let count = 0;
  let o = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i)];
    if (v < 0) continue; // skip whitespace / stray chars
    bits = (bits << 6) | v;
    count += 6;
    if (count >= 8) {
      count -= 8;
      out[o++] = (bits >> count) & 0xff;
    }
  }
  return o === out.length ? out : out.slice(0, o);
}

// ble-plx also expects written values as base64. Encode without relying on a
// global btoa (not guaranteed across RN runtimes).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '=';
  }
  return out;
}
