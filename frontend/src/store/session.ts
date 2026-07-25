import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ring_session';

/** What the app should do when a 思念 from the partner arrives (multi-select). */
export type TapReaction = 'vibrate' | 'push' | 'popup';

export const DEFAULT_TAP_REACTIONS: TapReaction[] = ['vibrate', 'push', 'popup'];

export interface Session {
  userId?: string;
  token?: string;
  nickname?: string;
  coupleId?: string;
  mode?: 'ai' | 'human';
  companionName?: string;
  /** Last connected ring — persisted so a fresh launch can auto-reconnect. */
  ringMac?: string;
  ringName?: string;
  /** Reactions to run on an incoming partner double-press. */
  tapReactions?: TapReaction[];
}

export async function loadSession(): Promise<Session> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : {};
}

export async function saveSession(patch: Partial<Session>): Promise<Session> {
  const current = await loadSession();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Forget only the persisted ring (used when the user disconnects deliberately). */
export async function clearRing(): Promise<void> {
  const current = await loadSession();
  delete current.ringMac;
  delete current.ringName;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

/** Drop the partner binding (couple / AI companion) while keeping the login. */
export async function clearCouple(): Promise<void> {
  const current = await loadSession();
  delete current.coupleId;
  delete current.mode;
  delete current.companionName;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
