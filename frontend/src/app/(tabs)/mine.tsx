import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { coordinator } from '../../background/coordinator';
import { ringService } from '../../ring/ringService';
import { api } from '../../services';
import {
  clearCouple,
  clearSession,
  DEFAULT_TAP_REACTIONS,
  loadSession,
  saveSession,
  TapReaction,
} from '../../store/session';
import { Button, Card, CardTitle, PageTitle, Screen, TagToggle } from '../../ui/kit';
import { colors } from '../../ui/theme';

const REACTIONS: { key: TapReaction; label: string; hint: string }[] = [
  // { key: 'vibrate', label: '震动', hint: '手机震动提醒' },
  { key: 'push', label: '推送', hint: '发送通知' },
  { key: 'popup', label: '弹窗', hint: '应用内弹窗' },
];

/** 我的: profile, partner management, logout, and double-press reaction settings. */
export default function MineTab() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);
  const [mode, setMode] = useState<'ai' | 'human' | undefined>(undefined);
  const [partner, setPartner] = useState<string | null>(null);
  const [reactions, setReactions] = useState<TapReaction[]>(DEFAULT_TAP_REACTIONS);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const s = await loadSession();
        if (!alive) return;
        setNickname(s.nickname ?? null);
        setMode(s.mode);
        setReactions(s.tapReactions ?? DEFAULT_TAP_REACTIONS);
        try {
          const c = await api.myCouple();
          if (alive) setPartner(c.partnerNickname ?? c.partnerUserId);
        } catch {
          if (alive) setPartner(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  // Persist the reaction set and push it to the always-on coordinator so the
  // next incoming 思念 uses it immediately.
  const toggleReaction = async (k: TapReaction) => {
    const next = reactions.includes(k) ? reactions.filter((x) => x !== k) : [...reactions, k];
    setReactions(next);
    await saveSession({ tapReactions: next });
    coordinator.setReactions(next);
  };

  const confirm = (title: string, message: string, onYes: () => void) =>
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: onYes },
    ]);

  // Dissolve the current couple / companion, keep the login, resume onboarding
  // at the pairing step (replace so 我的 isn't left in the back stack).
  const switchPartner = () =>
    confirm('更换另一半', '将解除当前绑定并重新选择另一半，确定吗？', async () => {
      try {
        await api.leaveCouple();
      } catch {}
      await clearCouple();
      router.replace('/onboard');
    });

  const switchToAi = () =>
    confirm('切换成 AI 恋人', '将解除当前绑定并创建一个 AI 恋人，确定吗？', async () => {
      try {
        await api.leaveCouple();
      } catch {}
      await clearCouple();
      router.push('/companion-setup');
    });

  const logout = () =>
    confirm('退出登录', '将清除本地登录信息并断开戒指，确定吗？', async () => {
      coordinator.logout();
      await ringService.forget();
      await clearSession();
      api.token = null;
      router.replace('/onboard');
    });

  return (
    <Screen>
      <PageTitle title="我的" subtitle="你的资料和小小设置" sticker="flower" />

      <Card>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 26 }}>😊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{nickname ?? '未命名'}</Text>
            <Text style={styles.sub}>
              {mode === 'ai'
                ? `💗 AI 恋人${partner ? ` · ${partner}` : ''}`
                : partner
                  ? `👫 已与 ${partner} 结缘`
                  : '尚未绑定另一半'}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <CardTitle icon="💗">收到 TA 双击时</CardTitle>
        <Text style={styles.hint}>选择收到对方想念时的提醒方式（可多选）</Text>
        <View style={styles.reactions}>
          {REACTIONS.map((r) => (
            <TagToggle
              key={r.key}
              label={r.label}
              active={reactions.includes(r.key)}
              onPress={() => toggleReaction(r.key)}
            />
          ))}
        </View>
        {reactions.length === 0 && (
          <Text style={styles.warn}>⚠️ 未选择任何提醒方式，收到想念时将没有提示</Text>
        )}
      </Card>

      <Card>
        <CardTitle icon="🍀">另一半</CardTitle>
        {mode === 'ai' ? (
          <>
            <Button title="✨ 重新定义 AI 恋人" onPress={() => router.push('/companion-setup')} />
            <Button title="👫 切换成真人另一半" variant="soft" onPress={switchPartner} />
          </>
        ) : (
          <>
            <Button title="🔁 更换 / 解除伴侣绑定" variant="soft" onPress={switchPartner} />
            <Button title="💗 切换成 AI 恋人" variant="soft" onPress={switchToAi} />
          </>
        )}
      </Card>

      <Button title="退出登录" variant="outline" onPress={logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.inkSoft, marginTop: 4 },
  hint: { fontSize: 12, color: colors.inkSoft, marginBottom: 10 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap' },
  warn: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
