import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { coordinator, useCoordinator } from '../../background/coordinator';
import { useRingService } from '../../ring/ringService';
import { api } from '../../services';
import { loadSession } from '../../store/session';
import { Card, CardTitle, Chip, PageTitle, RingMascot, Screen, Sticker } from '../../ui/kit';
import { colors, radius, shadow } from '../../ui/theme';

function relativeTime(tsMs: number | null): string {
  if (!tsMs) return '';
  const diff = Date.now() - tsMs;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const TIPS = [
  '今天也记得对自己温柔一点哦～',
  '想 TA 的时候，双击戒指就好',
  '偶尔说一句晚安，也是一种想念',
  '把此刻的想念，戴在指间',
];

/** 想念 tab (home): device summary, chat entries, recent 思念, quick actions. */
export default function HomeTab() {
  const router = useRouter();
  const co = useCoordinator();
  const svc = useRingService();
  const connected = svc.state === 'connected';

  const [partner, setPartner] = useState<string | null>(null);
  const [mode, setMode] = useState<'ai' | 'human' | undefined>(undefined);
  // 发送想念 compose dialog (custom memory text, optional).
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const tip = TIPS[new Date().getDate() % TIPS.length];

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const s = await loadSession();
        if (alive) setMode(s.mode);
        try {
          const c = await api.myCouple();
          if (alive) setPartner(c.partnerNickname ?? c.partnerUserId);
        } catch {}
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const sendCompose = () => {
    const memory = composeText.trim();
    coordinator.sendMissYou('app_tap', memory || undefined);
    setComposeOpen(false);
    setComposeText('');
  };

  return (
    <Screen>
      <PageTitle
        title="想念 · WhisperRing"
        subtitle="连接你的 WhisperRing，让想念随时被记录与回应"
        mascot
      />

      {/* ---- Device summary ---- */}
      <Card style={{ overflow: 'visible' }}>
        <Sticker kind="star" size={22} rotate={12} style={{ position: 'absolute', bottom: -8, right: 14 }} />
        <CardTitle icon="🔵">{connected ? '设备已连接' : '设备未连接'}</CardTitle>
        <View style={styles.deviceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceName}>{svc.connectedName ?? 'WhisperRing'}</Text>
            {svc.connectedId ? <Text style={styles.deviceMac}>MAC: {svc.connectedId}</Text> : null}
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              {connected ? (
                <Chip label="信号良好" tone="mint" />
              ) : (
                <Chip label={svc.reconnecting ? '重连中…' : '未连接'} tone="brand" />
              )}
              <Chip label={co.wsConnected ? '在线' : '离线'} tone={co.wsConnected ? 'mint' : 'lilac'} />
            </View>
          </View>
          <RingMascot size={64} />
        </View>
        <Pressable style={styles.scanBtn} onPress={() => router.navigate('/ring')}>
          <Text style={styles.scanBtnText}>{connected ? '管理设备' : '扫描设备'}</Text>
        </Pressable>
      </Card>

      {/* ---- Chat entries（暂时不用，先注释保留） ----
      <Card>
        <CardTitle icon="💗">想念相关入口</CardTitle>
        <View style={styles.entryRow}>
          <EntryCard
            emoji="💗"
            title="和 AI 聊聊"
            sub={mode === 'ai' ? '24 小时陪伴你' : '点击去切换'}
            bg={colors.brandSoft}
            fg={colors.brand}
            dim={mode !== 'ai'}
            onPress={() => (mode === 'ai' ? router.push('/chat') : router.navigate('/mine'))}
          />
          <EntryCard
            emoji="👥"
            title="和真人聊一半"
            sub={mode === 'human' ? '问问小奈你们的回忆' : '点击去切换'}
            bg={colors.lilacSoft}
            fg={colors.lilac}
            dim={mode !== 'human'}
            onPress={() => (mode === 'human' ? router.navigate('/nai') : router.navigate('/mine'))}
          />
        </View>
        {partner ? (
          <Text style={styles.partnerLine}>
            {mode === 'ai' ? `💗 你的 AI 恋人 · ${partner}` : `👫 与 ${partner} 已结缘`}
          </Text>
        ) : null}
      </Card>
      */}

      {/* ---- Recent 思念 ---- */}
      <Card>
        <CardTitle
          icon="⭐"
          right={
            <Pressable onPress={() => router.push('/memories')} hitSlop={8}>
              <Text style={styles.seeAll}>查看全部 ›</Text>
            </Pressable>
          }
        >
          想念记录
        </CardTitle>
        <View style={styles.recentRow}>
          <View style={styles.recentStat}>
            <Text style={styles.recentLabel}>已想念</Text>
            <Text style={styles.recentValue}>
              {co.sentToday} <Text style={styles.recentUnit}>次</Text>
            </Text>
          </View>
          <View style={styles.recentDivider} />
          <View style={styles.recentStat}>
            <Text style={styles.recentLabel}>已收到</Text>
            <Text style={styles.recentValue}>
              {co.receivedToday} <Text style={styles.recentUnit}>次</Text>
            </Text>
          </View>
          <View style={styles.recentDivider} />
          <View style={{ flex: 1.6, paddingLeft: 12 }}>
            <Text style={styles.recentLabel}>最近一次想念</Text>
            <Text style={styles.recentMemory} numberOfLines={2}>
              {co.lastMemory ?? '还没有想念，快按一下戒指吧'}
            </Text>
            {co.lastFrom ? (
              <Text style={styles.recentFrom}>
                来自 {co.lastFrom}
                {co.lastTickAt ? ` · ${relativeTime(co.lastTickAt)}` : ''}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* ---- Quick actions ---- */}
      <Card>
        <CardTitle icon="🌱">快捷操作</CardTitle>
        <View style={styles.quickRow}>
          <QuickAction emoji="💬" bg={colors.brandSoft} label="发送想念" onPress={() => setComposeOpen(true)} />
          {/* 暂时不用，先注释保留
          <QuickAction emoji="💌" bg={colors.butterSoft} label="想念信箱" onPress={() => router.push('/memories')} />
          */}
          <QuickAction emoji="🎙️" bg={colors.butterSoft} label="语音列表" onPress={() => router.push('/recordings')} />
          <QuickAction emoji="📊" bg={colors.mintSoft} label="情感分析" onPress={() => router.push('/analysis')} />
          {/* 暂时不用，先注释保留
          <QuickAction emoji="⚙️" bg={colors.lilacSoft} label="设置" onPress={() => router.navigate('/mine')} />
          */}
        </View>
      </Card>

      {/* ---- Tip ---- */}
      <Card tint="butter" style={{ overflow: 'visible' }}>
        <Sticker kind="star" size={20} rotate={10} style={{ position: 'absolute', bottom: -8, right: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22 }}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>想念小贴士</Text>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        </View>
      </Card>
      {/* ---- 发送想念：自定义内容弹窗 ---- */}
      <Modal visible={composeOpen} transparent animationType="fade" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView
          style={styles.composeOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setComposeOpen(false)} />
          <View style={[styles.composeCard, shadow]}>
            <Text style={styles.composeTitle}>💬 发送想念</Text>
            <Text style={styles.composeSub}>写点什么给 TA 吧，不写也可以直接发送</Text>
            <TextInput
              style={styles.composeInput}
              placeholder="比如：今天路过我们第一次约会的咖啡店，想你了"
              placeholderTextColor={colors.inkFaint}
              value={composeText}
              onChangeText={setComposeText}
              multiline
              maxLength={200}
              autoFocus
            />
            <View style={styles.composeBtnRow}>
              <Pressable style={styles.composeCancel} onPress={() => setComposeOpen(false)}>
                <Text style={styles.composeCancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.composeSend,
                  { backgroundColor: pressed ? colors.brandDeep : colors.brand },
                ]}
                onPress={sendCompose}
              >
                <Text style={styles.composeSendText}>{composeText.trim() ? '发送想念 💌' : '直接发送 💌'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function EntryCard({
  emoji,
  title,
  sub,
  bg,
  fg,
  dim,
  onPress,
}: {
  emoji: string;
  title: string;
  sub: string;
  bg: string;
  fg: string;
  dim?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: bg, opacity: dim ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text style={[styles.entryTitle, { color: fg }]}>{title}</Text>
      <Text style={styles.entrySub}>{sub}</Text>
    </Pressable>
  );
}

function QuickAction({
  emoji,
  bg,
  label,
  onPress,
}: {
  emoji: string;
  bg: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceName: { fontSize: 22, fontWeight: '800', color: colors.ink },
  deviceMac: { fontSize: 12, color: colors.inkSoft, marginTop: 4, fontFamily: 'monospace' },
  scanBtn: {
    marginTop: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
    paddingVertical: 13,
    alignItems: 'center',
  },
  scanBtnText: { color: colors.brand, fontSize: 16, fontWeight: '700' },

  entryRow: { flexDirection: 'row', gap: 12 },
  entry: {
    flex: 1,
    borderRadius: radius.inner,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  entryTitle: { fontSize: 15, fontWeight: '700' },
  entrySub: { fontSize: 11, color: colors.inkSoft },
  partnerLine: { fontSize: 12, color: colors.inkSoft, marginTop: 10, textAlign: 'center' },

  seeAll: { fontSize: 13, color: colors.lilac },
  recentRow: { flexDirection: 'row', alignItems: 'stretch' },
  recentStat: { flex: 1, justifyContent: 'center' },
  recentDivider: { width: 1, backgroundColor: colors.hairline, marginHorizontal: 8 },
  recentLabel: { fontSize: 12, color: colors.inkSoft },
  recentValue: { fontSize: 30, fontWeight: '800', color: colors.ink, marginTop: 2 },
  recentUnit: { fontSize: 12, fontWeight: '400', color: colors.inkSoft },
  recentMemory: { fontSize: 13, color: colors.ink, marginTop: 4, lineHeight: 19 },
  recentFrom: { fontSize: 12, color: colors.brand, marginTop: 4, fontWeight: '600' },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { alignItems: 'center', flex: 1, gap: 6 },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  quickLabel: { fontSize: 12, color: colors.ink },

  tipTitle: { fontSize: 14, fontWeight: '700', color: '#A8842B' },
  tipText: { fontSize: 12, color: '#A8842B', marginTop: 2, opacity: 0.85 },

  composeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(74,59,85,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  composeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  composeTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  composeSub: { fontSize: 12, color: colors.inkSoft, marginTop: 4 },
  composeInput: {
    marginTop: 12,
    minHeight: 84,
    borderRadius: radius.inner,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.bgTop,
    padding: 12,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  composeBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  composeCancel: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingVertical: 12,
    alignItems: 'center',
  },
  composeCancelText: { fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  composeSend: {
    flex: 1.6,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  composeSendText: { fontSize: 15, fontWeight: '700', color: 'white' },
});
