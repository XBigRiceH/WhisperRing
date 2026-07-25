import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { coordinator, useCoordinator } from '../background/coordinator';
import { ringService, useRingService } from '../ring/ringService';
import { Button, RingMascot } from './kit';
import { colors, radius, shadow } from './theme';

/**
 * App-wide overlays that must render above every tab/screen:
 *  - ring auto-reconnect status (spinner while retrying, prompt on failure),
 *  - an incoming-思念 popup when the user's reaction includes 'popup',
 *  - a transient toast for send/receive results.
 *
 * Mounted once in the root layout so it survives tab navigation.
 */
export default function AppOverlays() {
  const svc = useRingService();
  const co = useCoordinator();
  const router = useRouter();

  return (
    <>
      {(svc.reconnecting || svc.reconnectFailed) && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.card, shadow]}>
            {svc.reconnecting ? (
              <>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.title}>正在重连戒指…</Text>
                <Text style={styles.sub}>戒指已断开，正在用上次的设备重新连接</Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>戒指重连失败</Text>
                <Text style={styles.sub}>多次尝试仍无法连接，请到连接页面重新连接</Text>
                <View style={{ height: 12 }} />
                <Button
                  title="去连接页面"
                  onPress={() => {
                    ringService.dismissReconnect();
                    router.replace('/ring');
                  }}
                />
              </>
            )}
          </View>
        </View>
      )}

      {co.popup && (
        <Pressable style={styles.overlay} onPress={() => coordinator.dismissPopup()}>
          <View style={[styles.card, shadow]}>
            <RingMascot size={64} />
            <Text style={styles.title}>{co.popup.from ?? 'TA'} 在想你</Text>
            <Text style={styles.sub}>{co.popup.memory ?? '此刻，有人正在想你'}</Text>
            <View style={{ height: 12 }} />
            <Button title="收到 💗" onPress={() => coordinator.dismissPopup()} />
          </View>
        </Pressable>
      )}

      {co.toast && <Toast text={co.toast} onDone={() => coordinator.clearToast()} />}
    </>
  );
}

// Auto-dismissing toast pinned near the bottom of the screen.
function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <Text style={styles.toast}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(74,59,85,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 6,
  },
  // alignSelf: 'stretch' + textAlign: 'center' — bold CJK text measured by its
  // intrinsic width gets its last glyph clipped on Android; stretching avoids it.
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 8,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  sub: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  toastWrap: { position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center' },
  toast: {
    backgroundColor: 'rgba(217,75,123,0.94)',
    color: 'white',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
