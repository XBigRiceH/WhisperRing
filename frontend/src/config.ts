import { Platform } from 'react-native';

// Local-dev backend. On the Android emulator, 10.0.2.2 = the host's localhost.
// iOS sim / web use localhost. For a PHYSICAL device via Expo Go, replace with
// your host's LAN IP (e.g. http://192.168.1.20:8000).
export const API_BASE_URL =
  Platform.OS === 'android' ? 'http://30.201.216.220:8000' : 'http://localhost:8000';

export const WS_URL = API_BASE_URL.replace(/^http/, 'ws') + '/realtime';
