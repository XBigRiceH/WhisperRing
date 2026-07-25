import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../services';
import { loadSession } from '../store/session';
import { RingMascot } from '../ui/kit';
import { colors } from '../ui/theme';

/**
 * Splash / launch gate. Shows the brand text (a logo can replace it later),
 * then routes with replace() so the splash never sits in the back stack:
 *  - fully configured (token + couple) → the tab app,
 *  - otherwise → onboarding.
 */
export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    (async () => {
      const s = await loadSession();
      if (s.token) api.token = s.token;
      const target = s.token && s.coupleId ? '/home' : '/onboard';
      // Keep the splash visible briefly even on a fast load.
      const wait = Math.max(0, 1100 - (Date.now() - startedAt));
      setTimeout(() => {
        if (alive) router.replace(target);
      }, wait);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.bgTop, colors.bgBottom]} style={StyleSheet.absoluteFill} />
      <RingMascot size={96} />
      <Text style={styles.logo}>想念</Text>
      <Text style={styles.tag}>· WhisperRing ·</Text>
      <Text style={styles.sub}>把此刻的想念，戴在指间</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 56, fontWeight: '800', color: colors.ink, letterSpacing: 6, marginTop: 20 },
  tag: { fontSize: 18, color: colors.brand, marginTop: 6, letterSpacing: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginTop: 18 },
});
