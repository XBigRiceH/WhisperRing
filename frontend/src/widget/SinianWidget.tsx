import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { WidgetData } from './types';

const ROSE = '#E5688F';

function relativeTime(tsMs: number | null): string {
  if (!tsMs) return '还没有思念';
  const diff = Date.now() - tsMs;
  if (diff < 60_000) return '刚刚 tick 了你';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前 tick 你`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前 tick 你`;
  return `${Math.floor(diff / 86_400_000)} 天前 tick 你`;
}

/**
 * Android home-screen widget UI. Rendered by react-native-android-widget into a
 * native RemoteViews tree (so it uses FlexWidget/TextWidget, not RN View/Text).
 * Tapping it deep-links back into the app via the `sinian://` scheme.
 */
export function SinianWidget({ data }: { data: WidgetData }) {
  const who = data.lastFrom ?? 'TA';
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      clickActionData={{ uri: 'sinian://' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#FFF5F8',
        borderRadius: 16,
        padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="想念 · WhisperRing" style={{ fontSize: 13, color: '#8A3A57', fontWeight: 'bold' }} />
        <TextWidget text={`今日 ${data.todayCount}`} style={{ fontSize: 12, color: ROSE }} />
      </FlexWidget>

      <TextWidget
        text={data.lastTickAt ? `💍 ${who}` : '💍 等待 TA 想你'}
        style={{ fontSize: 18, color: '#8A3A57', fontWeight: 'bold' }}
      />
      <TextWidget text={relativeTime(data.lastTickAt)} style={{ fontSize: 12, color: '#9A6B7C' }} />
    </FlexWidget>
  );
}
