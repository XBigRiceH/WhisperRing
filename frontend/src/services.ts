import { ApiClient } from './api/client';
import { RealtimeClient } from './api/realtime';
import { API_BASE_URL, WS_URL } from './config';

// App-wide singletons. The live ring connection is owned by ringService (real
// BLE); see src/ring/ringService.ts.
export const api = new ApiClient(API_BASE_URL);
export const realtime = new RealtimeClient(WS_URL);
