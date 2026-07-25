import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WIDGET_STORAGE_KEY, WidgetData } from './types';

export { loadWidgetData } from './types';
export type { WidgetData } from './types';

/**
 * Mirror the latest state into the home-screen widget.
 *
 * Always persists the payload (so a fresh widget render / iOS target can read
 * it), then — on Android with the native widget module present — asks the OS to
 * re-render the widget immediately. Guarded so it safely no-ops on iOS, web, and
 * in Expo Go where the native module is absent.
 */
export async function updateWidget(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(data));
  } catch {}

  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const React = require('react');
    const { SinianWidget } = require('./SinianWidget');
    requestWidgetUpdate({
      widgetName: 'Sinian',
      renderWidget: () => React.createElement(SinianWidget, { data }),
      widgetNotFound: () => {},
    });
  } catch {
    // Native widget module unavailable (Expo Go / not a dev build) — ignore.
  }
}
