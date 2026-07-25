import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChatMsg } from '../api/types';
import { api } from '../services';
import { Bubble, RingMascot, Spinner } from '../ui/kit';
import { colors, radius, shadow } from '../ui/theme';

const SUGGESTIONS = [
  { text: '我们聊过最多的是什么？', icon: '💬', color: colors.brand },
  { text: '上次说想去哪儿玩来着？', icon: '🌍', color: colors.lilac },
  { text: 'TA 最近说过什么开心事？', icon: '✨', color: colors.mint },
];

function fmtClock(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 小奈 · 回忆助手 — 双人模式的记忆问答。问「我们…」，小奈从你们的真实
 * 聊天记录（ChatLab）里找答案。渲染为真人模式的小奈 tab（无返回键）。
 */
export default function RecallChatScreen({ onBack }: { onBack?: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    api
      .recallHistory()
      .then((h) => setMsgs(h.messages))
      .catch(() => {});
  }, []);

  // Always land on the latest message when the tab regains focus; if history
  // is unchanged onContentSizeChange won't fire, so jump explicitly.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 80);
      return () => clearTimeout(t);
    }, []),
  );

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text, createdAt: Date.now() }]);
    setBusy(true);
    try {
      const r = await api.recallAsk(text);
      if (r.answer) setMsgs((m) => [...m, { role: 'ai', text: r.answer, createdAt: Date.now() }]);
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
            <Text style={styles.title}>小奈</Text>
            <Text style={styles.sub}>你们的回忆，我都记得 ✨</Text>
          </View>
        </View>
        <RingMascot size={44} />
      </View>

      {/* ---- 隐私告知（常驻，用户拍板：入口明确告知） ---- */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>💡 提问时，相关聊天记录会发送到云端 AI 帮你回忆</Text>
      </View>

      {/* ---- Messages ---- */}
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.body}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      >
        {msgs.length === 0 && !busy && (
          <View style={styles.emptyWrap}>
            <RingMascot size={72} />
            <Text style={styles.emptyText}>
              问问我你们之间的事吧～{'\n'}比如「我们聊过最多的是什么？」
            </Text>
          </View>
        )}
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
                <Text style={[styles.time, mine && { textAlign: 'right' }]}>{fmtClock(m.createdAt)}</Text>
              </View>
            </View>
          );
        })}
        {busy && <Spinner />}
      </ScrollView>

      {/* ---- Suggested questions ---- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.quickWrap}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 14, alignItems: 'center' }}
      >
        {SUGGESTIONS.map((q) => (
          <Pressable key={q.text} style={[styles.quickPill, { borderColor: q.color }]} onPress={() => void send(q.text)}>
            <Text style={{ fontSize: 12 }}>{q.icon}</Text>
            <Text style={[styles.quickText, { color: q.color }]}>{q.text}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---- Input ---- */}
      <View style={styles.inputRow}>
        <View style={[styles.inputPill, shadow]}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="问问你们之间发生过的事…"
            placeholderTextColor={colors.inkFaint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send()}
          />
          <Pressable
            onPress={() => void send()}
            disabled={busy}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: pressed ? colors.brandDeep : colors.brand },
              busy && { opacity: 0.5 },
            ]}
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

  notice: {
    marginHorizontal: 14,
    backgroundColor: colors.butterSoft,
    borderRadius: radius.inner,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeText: { fontSize: 11, color: '#A8842B' },

  body: { padding: 14, paddingBottom: 20, gap: 2 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 40 },
  emptyText: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
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
  sendBtn: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
  sendText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
