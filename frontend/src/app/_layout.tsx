import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { coordinator } from '../background/coordinator';
import { setupNotifications } from '../notify';
import AppOverlays from '../ui/AppOverlays';
import { colors } from '../ui/theme';

/**
 * Root layout. Boots the app-wide "always-on" layer (realtime socket, ring
 * double-press handling, auto-reconnect, widget mirroring) exactly once, then
 * renders the navigation stack. The splash route (index) decides where to go.
 */
export default function RootLayout() {
  useEffect(() => {
    void setupNotifications();
    void coordinator.start();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgTop },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboard" />
        <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="memories" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="recordings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="analysis" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="companion-setup" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <AppOverlays />
    </SafeAreaProvider>
  );
}
