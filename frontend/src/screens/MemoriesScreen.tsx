import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MissYouHistoryItem } from '../api/types';
import { api } from '../services';
import { Card, CardTitle, PageTitle, Screen, Spinner, Sticker } from '../ui/kit';
import { colors } from '../ui/theme';

function fmtTime(tsMs: number): string {
  const d = new Date(tsMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 想念信箱 — every 思念 the partner has ever sent (GET /events/miss-you,
 * 全部历史、后端按时间倒序). Standalone route (with back) or embedded as the
 * human-mode 小奈 tab.
 */
export default function MemoriesScreen({ onBack }: { onBack?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<MissYouHistoryItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api
        .missYouHistory()
        .then((r) => {
          if (alive) setEvents(r.events);
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen>
      <PageTitle
        title="想念信箱"
        subtitle="TA 每一次想你，都被好好记住了 ✨"
        sticker="mail"
        onBack={onBack}
      />

      {loading && <Spinner />}

      {!loading && events.length === 0 && (
        <Card tint="butter">
          <CardTitle icon="💌">还没有收到想念</CardTitle>
          <Text style={styles.emptyText}>等 TA 双击戒指，想念就会飞到这里来～</Text>
        </Card>
      )}

      {events.map((e, i) => (
        <Card key={e.id} style={{ overflow: 'visible' }}>
          {i === 0 && (
            <Sticker kind="heart" size={20} rotate={10} style={{ position: 'absolute', top: -10, right: 10 }} />
          )}
          <Text style={styles.memory}>{e.memory ?? '此刻，有人正在想你'}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.from}>来自 {e.fromNickname ?? 'TA'}</Text>
            <Text style={styles.time}>{e.createdAt ? fmtTime(e.createdAt) : ''}</Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyText: { fontSize: 13, color: colors.inkSoft },
  memory: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  from: { fontSize: 12, color: colors.brand, fontWeight: '600' },
  time: { fontSize: 12, color: colors.inkFaint },
});
