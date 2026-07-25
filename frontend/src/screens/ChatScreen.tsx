import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CompanionMessageDTO } from '../api/types';
import { api } from '../services';
import { Bubble, RingMascot, Spinner } from '../ui/kit';
import { colors, radius, shadow } from '../ui/theme';

const QUICK_REPLIES = [
  { text: '当然可以！', icon: '💗', color: colors.brand },
  { text: '改天给你看照片～', icon: '✨', color: colors.lilac },
  { text: '还在研究中啦 😆', icon: '🍃', color: colors.mint },
];

function fmtClock(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 小院 — the AI companion chat. Rendered as the 小奈 tab (no back button) or
 * pushed as /chat from the home entries (with back).
 */
export default function ChatScreen({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<CompanionMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('TA');
  const scroller = useRef<ScrollView>(null);

  // Refresh name + history every time the screen regains focus (e.g. tab switch),
  // so messages sent elsewhere show up without restarting the app.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const me = await api.companionMe();
          if (alive) setName(me.name);
        } catch {}
        try {
          const h = await api.companionHistory();
          if (alive) setMsgs(h.messages);
        } catch {}
      })();
      // Always land on the latest message when the tab regains focus; if history
      // is unchanged onContentSizeChange won't fire, so jump explicitly.
      const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 80);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }, []),
  );

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text, createdAt: Date.now() }]);
    setBusy(true);
    try {
      const r = await api.pushMessage(text);
      if (r.reply) setMsgs((m) => [...m, { role: 'ai', text: r.reply!, createdAt: Date.now() }]);
    } catch {
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[colors.bgTop, colors.bgBottom]} style={StyleSheet.absoluteFill} />

      {/* ---- Header ---- */}
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
              <Text style={{ fontSize: 16, color: colors.brand, fontWeight: '700' }}>‹</Text>
            </Pressable>
          )}
          <View>
            <Text style={styles.title}>小院</Text>
            <Text style={styles.sub}>和 {name} 的小小院子 💗</Text>
          </View>
        </View>
        <Pressable style={styles.settingPill} onPress={() => router.push('/companion-setup')}>
          <Text style={{ fontSize: 12 }}>🌱</Text>
          <Text style={styles.settingText}>院子设置</Text>
        </Pressable>
      </View>

      {/* ---- Messages ---- */}
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.body}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      >
        {msgs.map((m, i) => {
          const mine = m.role === 'user';
          return (
            <View key={i} style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
              {mine ? (
                <View style={styles.myAvatar}>
                  <Text style={{ fontSize: 20 }}>💗</Text>
                </View>
              ) : (
                <RingMascot size={44} />
              )}
              <View style={{ maxWidth: '74%' }}>
                <Bubble mine={mine} text={m.text} />
                <Text style={[styles.time, mine && { textAlign: 'right' }]}>
                  {fmtClock(m.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}
        {busy && <Spinner />}
      </ScrollView>

      {/* ---- Quick replies ---- */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickWrap} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, alignItems: 'center' }}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q.text} style={[styles.quickPill, { borderColor: q.color }]} onPress={() => void send(q.text)}>
            <Text style={{ fontSize: 12 }}>{q.icon}</Text>
            <Text style={[styles.quickText, { color: q.color }]}>{q.text}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---- Input ---- */}
      <View style={styles.inputRow}>
        <View style={[styles.inputPill, shadow]}>
          <Text style={{ fontSize: 16 }}>🌸</Text>
          <TextInput
            style={styles.input}
            placeholder="说点什么…"
            placeholderTextColor={colors.inkFaint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send()}
          />
          <Pressable
            onPress={() => void send()}
            disabled={busy}
            style={({ pressed }) => [styles.sendBtn, { backgroundColor: pressed ? colors.brandDeep : colors.brand }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.sendText}>发送</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  settingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow,
    shadowOpacity: 0.1,
  },
  settingText: { fontSize: 12, color: colors.lilac, fontWeight: '600' },

  body: { padding: 14, paddingBottom: 20, gap: 2 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 3 },
  myAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.1,
  },
  time: { fontSize: 11, color: colors.lilac, marginHorizontal: 6, marginBottom: 4 },

  // Fixed height + no shrink: without these the quick-reply row gets squeezed
  // flatter and flatter by flex layout when the keyboard/messages grow.
  quickWrap: { height: 40, marginBottom: 8, flexGrow: 0, flexShrink: 0 },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  quickText: { fontSize: 13, fontWeight: '600' },

  inputRow: { paddingHorizontal: 12, paddingBottom: 14 },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 8 },
  sendBtn: {
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
