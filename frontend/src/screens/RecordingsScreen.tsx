import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingResponse } from '../api/types';
import { API_BASE_URL } from '../config';
import { api } from '../services';
import { loadSession } from '../store/session';
import { Card, CardTitle, Chip, PageTitle, Screen, Spinner } from '../ui/kit';
import { colors, radius, shadow } from '../ui/theme';

function fmtTime(tsMs: number): string {
  const d = new Date(tsMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** WAV 缓存目录：cache/recordings/<id>.wav，重进页面不用重复下载。 */
function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'recordings');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * 语音列表 — GET /recordings（自己 + 伴侣上传的戒指录音，后端按时间倒序）。
 * 通过 userId 区分「我发出的 / TA 发来的」；有 ASR 结果时直接显示文字；
 * 点击播放按钮会先把 WAV 下载到本地缓存再播放。
 */
export default function RecordingsScreen({ onBack }: { onBack?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingResponse[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // 正在下载缓存的录音 id（此时按钮转为 ⏳）。
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // 当前装进播放器的录音 id。
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // 让 iOS 静音键不影响播放。
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const s = await loadSession();
        if (!alive) return;
        setMyUserId(s.userId ?? null);
        if (s.token) api.token = s.token;
        try {
          const list = await api.listRecordings();
          if (alive) {
            setRecordings(list);
            setError(null);
          }
        } catch (e) {
          if (alive) setError(String(e));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  /** 确保 WAV 在本地缓存里，返回可播放的 File。已缓存则直接复用。 */
  const ensureCached = async (rec: RecordingResponse): Promise<File> => {
    const file = new File(cacheDir(), `${rec.id}.wav`);
    if (file.exists && (file.size ?? 0) > 0) return file;
    const headers: Record<string, string> = {};
    if (api.token) headers.Authorization = `Bearer ${api.token}`;
    await File.downloadFileAsync(API_BASE_URL + rec.downloadUrl, file, {
      headers,
      idempotent: true,
    });
    return file;
  };

  const onPlayPress = async (rec: RecordingResponse) => {
    if (!rec.downloadUrl || downloadingId) return;
    // 同一条：在播放则暂停，否则从头/断点继续。
    if (loadedId === rec.id) {
      if (status.playing) {
        player.pause();
      } else {
        if (status.didJustFinish) await player.seekTo(0);
        player.play();
      }
      return;
    }
    setDownloadingId(rec.id);
    try {
      const file = await ensureCached(rec);
      player.replace({ uri: file.uri });
      player.play();
      setLoadedId(rec.id);
      setError(null);
    } catch (e) {
      setError(`下载失败：${String(e)}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const playIcon = (rec: RecordingResponse): string => {
    if (downloadingId === rec.id) return '⏳';
    if (loadedId === rec.id && status.playing) return '⏸';
    return '▶';
  };

  return (
    <Screen>
      <PageTitle
        title="语音列表"
        subtitle="戒指录下的每一段声音，都在这里 🎙️"
        sticker="sparkle"
        onBack={onBack}
      />

      {loading && <Spinner />}

      {error ? (
        <Card tint="butter">
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {!loading && recordings.length === 0 && !error && (
        <Card tint="butter">
          <CardTitle icon="🎙️">还没有语音</CardTitle>
          <Text style={styles.emptyText}>长按戒指录一段话，它就会出现在这里～</Text>
        </Card>
      )}

      {recordings.map((rec) => {
        const mine = rec.userId === myUserId;
        const playable = rec.downloadUrl != null;
        const duration = fmtDuration(rec.durationMs);
        return (
          <Card key={rec.id}>
            <View style={styles.headerRow}>
              <Chip label={mine ? '我发出的' : 'TA 发来的'} tone={mine ? 'brand' : 'mint'} />
              <Text style={styles.time}>{fmtTime(rec.uploadedAt)}</Text>
            </View>

            {rec.asrText ? (
              <Text style={styles.asrText}>「{rec.asrText}」</Text>
            ) : rec.asrStatus === 'pending' || rec.asrStatus === 'running' ? (
              <Text style={styles.asrHint}>语音识别中…</Text>
            ) : null}

            <View style={styles.bottomRow}>
              <Text style={styles.meta}>
                {playable
                  ? `${duration ? `时长 ${duration}` : '语音'}`
                  : `解码失败：${rec.decodeError ?? '未知原因'}`}
              </Text>
              <Pressable
                onPress={() => onPlayPress(rec)}
                disabled={!playable}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.playBtn,
                  { backgroundColor: mine ? colors.brandSoft : colors.mintSoft },
                  !playable && { opacity: 0.35 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.playIcon}>{playIcon(rec)}</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyText: { fontSize: 13, color: colors.inkSoft },
  errorText: { fontSize: 12, color: '#A8842B' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 12, color: colors.inkFaint },
  asrText: { fontSize: 15, color: colors.ink, lineHeight: 22, marginTop: 10 },
  asrHint: { fontSize: 13, color: colors.inkFaint, marginTop: 10, fontStyle: 'italic' },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  meta: { flex: 1, fontSize: 12, color: colors.inkSoft, marginRight: 10 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  playIcon: { fontSize: 18, color: colors.ink },
});
