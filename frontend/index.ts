import { Platform } from 'react-native';

// Register the Android home-screen widget task handler before the app renders,
// so the OS can render the widget even when the app isn't foregrounded. Guarded
// so it no-ops where the native module is absent (iOS / web / Expo Go).
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widget/taskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // native widget module unavailable — ignore
  }
}

// Register Expo Router LAST (via require, not a hoisted import) so all
// side-effects above are wired up before the root layout mounts.
require('expo-router/entry');
