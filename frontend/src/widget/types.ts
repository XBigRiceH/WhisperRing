import AsyncStorage from '@react-native-async-storage/async-storage';

/** Data mirrored into the home-screen widget by the background coordinator. */
export interface WidgetData {
  lastFrom: string | null;
  lastMemory: string | null;
  lastTickAt: number | null;
  todayCount: number;
}

export const WIDGET_STORAGE_KEY = 'sinian_widget_data';

export const DEFAULT_WIDGET_DATA: WidgetData = {
  lastFrom: null,
  lastMemory: null,
  lastTickAt: null,
  todayCount: 0,
};

export async function loadWidgetData(): Promise<WidgetData> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    return raw ? { ...DEFAULT_WIDGET_DATA, ...JSON.parse(raw) } : DEFAULT_WIDGET_DATA;
  } catch {
    return DEFAULT_WIDGET_DATA;
  }
}
