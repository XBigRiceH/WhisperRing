import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DashboardResponse, LangMember } from '../api/types';
import { api } from '../services';
import { Button, Card, CardTitle, PageTitle, Screen, Spinner, Sticker } from '../ui/kit';
import { colors, radius, shadow } from '../ui/theme';
import {
  HBars,
  HER,
  HIM,
  ScoreRing,
  SectionTitle,
  StatTile,
  TagCloud,
  VBars,
  VsBar,
} from '../ui/charts';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function fmtDuration(s: number): string {
  if (s >= 86400) return `${(s / 86400).toFixed(1)} 天`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)} 小时`;
  if (s >= 60) return `${Math.round(s / 60)} 分钟`;
  return `${s} 秒`;
}

/** Warm one-liner for the hero score (client-side copy, DESIGN.md §8). */
function praiseFor(score: number): string {
  if (score >= 80) return '太棒了！你们的默契又提升啦～继续保持这份甜蜜！';
  if (score >= 50) return '你们越来越有默契了，多聊聊会更甜哦～';
  return '刚刚开始也没关系，每一句都在拉近你们的距离 💗';
}

export default function AnalysisScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then((r) => {
        if (r.disabled) {
          setData(null);
          setNote(r.reason ?? 'ChatLab 未接入');
        } else {
          setData(r);
        }
      })
      .catch((e) => {
        setData(null);
        setNote(String(e?.message ?? e));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Spinner />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <PageTitle title="情感分析" subtitle="你与 WhisperRing 的情感小数据分析" mascot onBack={onBack} />
        <Card tint="butter">
          <CardTitle icon="📊">还没有可分析的数据</CardTitle>
          <Text style={styles.bannerText}>
            {note ? `（${note}）` : ''}多聊几句、让戒指录下你们的对话，分析会自动生成～
          </Text>
        </Card>
      </Screen>
    );
  }

  const d = data;
  const rel = d.relationship;
  const jr = d.journey;
  const lang = d.languagePreference;
  const score = lang ? Math.round(lang.similarityScore) : null;

  return (
    <Screen>
      <PageTitle title="情感分析" subtitle="你与 WhisperRing 的情感小数据分析" mascot onBack={onBack} />

      {/* ---- Hero: 默契度 + 夸奖 ---- */}
      {lang && score != null && (
        <Card style={{ overflow: 'visible' }}>
          <Sticker kind="star" size={24} rotate={12} style={{ position: 'absolute', top: -10, right: 14 }} />
          <CardTitle icon="💗">情感连接度</CardTitle>
          <ScoreRing score={score} label="用词默契度" />
          <View style={styles.praise}>
            <Text style={styles.praiseText}>✨ {praiseFor(score)}</Text>
          </View>
        </Card>
      )}

      {/* ---- KPI ---- */}
      {jr && lang && (
        <Card>
          <View style={styles.kpiRow}>
            <StatTile value={jr.range.spanDays} label="相伴(天)" />
            <StatTile value={jr.range.activeDays} label="畅聊(天)" tint={HIM} />
            <StatTile value={lang.members.reduce((n, m) => n + m.totalMessages, 0)} label="消息(条)" tint={HER} />
            <StatTile value={d.wordFrequency?.uniqueWords ?? '—'} label="高频词" />
          </View>
        </Card>
      )}

      {/* ---- 谁更主动 ---- */}
      {rel && rel.members.length >= 2 && (
        <>
          <SectionTitle icon="💗" title="谁更主动" hint="发起 · 结束 · 回复" />
          <Card>
            <Text style={styles.cap}>谁先开口</Text>
            <VsBar
              labelA={rel.members[0].name}
              valueA={rel.members[0].totalInitiateCount}
              labelB={rel.members[1].name}
              valueB={rel.members[1].totalInitiateCount}
              suffix=" 次"
            />
            <Text style={styles.cap}>谁先收尾</Text>
            <VsBar
              labelA={rel.members[0].name}
              valueA={rel.members[0].totalCloseCount}
              labelB={rel.members[1].name}
              valueB={rel.members[1].totalCloseCount}
              suffix=" 次"
            />
            {rel.responseLatency.length > 0 && (
              <>
                <Text style={[styles.cap, { marginTop: 10 }]}>平均回复时长（越小越快）</Text>
                <View style={styles.latencyRow}>
                  {rel.responseLatency.map((m) => (
                    <View key={m.memberId} style={styles.latencyChip}>
                      <Text style={styles.latencyName}>{m.name}</Text>
                      <Text style={styles.latencyVal}>{fmtDuration(m.avgResponseTime)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
          {rel.perseverance.length > 0 && (
            <Card tint="brand">
              <Text style={styles.crownText}>
                👑 “夺命连环call” 之王：
                {rel.perseverance.map((p) => `${p.name} ${p.totalDoubleTexts} 次`).join('、')}
              </Text>
            </Card>
          )}
        </>
      )}

      {/* ---- 相处历程 ---- */}
      {jr && (
        <>
          <SectionTitle icon="🍀" title="相处历程" />
          <Card>
            <View style={styles.milestones}>
              {jr.peakMonth && (
                <Milestone
                  emoji="🔥"
                  title="最热月份"
                  main={jr.peakMonth.month}
                  sub={`${jr.peakMonth.messageCount} 条 · ${jr.peakMonth.activeDays} 天在聊`}
                />
              )}
              {jr.longestSegment && (
                <Milestone
                  emoji="⏱️"
                  title="最长畅聊"
                  main={fmtDuration(jr.longestSegment.durationSeconds)}
                  sub={`${jr.longestSegment.messageCount} 条 · ${jr.longestSegment.initiator.name} 发起`}
                />
              )}
              {jr.longestSilence && (
                <Milestone
                  emoji="🌙"
                  title="最长沉默"
                  main={fmtDuration(jr.longestSilence.durationSeconds)}
                  sub={`${jr.longestSilence.reopenedBy.name} 先打破`}
                />
              )}
            </View>
          </Card>
          {jr.months.length > 0 && (
            <Card>
              <CardTitle icon="📅">每月消息量</CardTitle>
              <VBars data={jr.months.map((m) => ({ label: m.month.slice(5), value: m.messageCount }))} color={HIM} />
            </Card>
          )}
        </>
      )}

      {/* ---- 消息节奏 ---- */}
      {(d.daily || d.weekday) && (
        <>
          <SectionTitle icon="🎵" title="消息节奏" />
          {d.daily && d.daily.length > 0 && (
            <Card>
              <CardTitle icon="🌤️">每日消息</CardTitle>
              <VBars data={d.daily.map((x) => ({ label: x.date.slice(5), value: x.messageCount }))} />
            </Card>
          )}
          {d.weekday && (
            <Card>
              <CardTitle icon="📆">星期分布（周一–周日）</CardTitle>
              <VBars
                data={d.weekday.map((x) => ({
                  label: WEEKDAYS[(x.weekday - 1) % 7],
                  value: x.messageCount,
                }))}
                color={HIM}
              />
            </Card>
          )}
        </>
      )}

      {/* ---- 表达风格 ---- */}
      {d.messageLength && (
        <>
          <SectionTitle
            icon="🎨"
            title="表达风格"
            hint={d.longMessageCount != null ? `长消息(>30字) ${d.longMessageCount} 条` : undefined}
          />
          <Card>
            <CardTitle icon="✏️">消息长度分布（字数）</CardTitle>
            <VBars
              data={d.messageLength.grouped.filter((g) => g.count > 0).map((g) => ({ label: g.range, value: g.count }))}
              color={HER}
            />
          </Card>
        </>
      )}

      {/* ---- 高频词 ---- */}
      {d.wordFrequency && d.wordFrequency.words.length > 0 && (
        <>
          <SectionTitle icon="💬" title="你们的高频词" hint={`共 ${d.wordFrequency.uniqueWords} 个高频词`} />
          <Card>
            <TagCloud words={d.wordFrequency.words.slice(0, 30)} />
          </Card>
          <Card>
            <CardTitle icon="🏆">Top 8</CardTitle>
            <HBars
              data={d.wordFrequency.words.slice(0, 8).map((w) => ({ label: w.word, value: w.count }))}
              suffix=" 次"
            />
          </Card>
        </>
      )}

      {/* ---- 双人语言画像 ---- */}
      {lang && lang.members.length >= 2 && (
        <>
          <SectionTitle icon="⭐" title="双人语言画像" />
          <View style={styles.profileRow}>
            <ProfileCard m={lang.members[0]} color={HER} bg={colors.brandSoft} />
            <ProfileCard m={lang.members[1]} color={HIM} bg={colors.skySoft} />
          </View>
          {lang.sharedWords.length > 0 && (
            <Card>
              <CardTitle icon="💞">你们的默契词</CardTitle>
              <View style={styles.sharedRow}>
                {lang.sharedWords.map((w) => (
                  <View key={w.word} style={styles.sharedChip}>
                    <Text style={styles.sharedWord}>{w.word}</Text>
                    <Text style={styles.sharedCount}>{w.countA + w.countB}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}

      <Button title="返回首页" variant="soft" onPress={onBack} />
    </Screen>
  );
}

function Milestone({ emoji, title, main, sub }: { emoji: string; title: string; main: string; sub: string }) {
  return (
    <View style={styles.milestone}>
      <Text style={styles.mEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.mTitle}>{title}</Text>
        <Text style={styles.mMain}>{main}</Text>
        <Text style={styles.mSub}>{sub}</Text>
      </View>
    </View>
  );
}

function ProfileCard({ m, color, bg }: { m: LangMember; color: string; bg: string }) {
  const p = m.punctuation;
  return (
    <View style={[styles.profile, shadow, { backgroundColor: bg }]}>
      <Text style={[styles.profileName, { color }]}>{m.name}</Text>
      <Text style={styles.profileStat}>
        {m.totalMessages} 条 · {m.totalWords} 词
      </Text>
      <Text style={styles.profileStat}>词汇多样性 {m.lexicalDiversity.toFixed(1)}</Text>
      <Text style={styles.profileSub}>标点习惯</Text>
      <Text style={styles.profileFine}>
        ？{p.question} · ！{p.exclamation} · …{p.ellipsis}
      </Text>
      {m.modalParticles.length > 0 && (
        <>
          <Text style={styles.profileSub}>口头禅</Text>
          <Text style={styles.profileFine}>
            {m.modalParticles.slice(0, 3).map((x) => `${x.word}(${x.count})`).join(' ')}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  bannerText: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },

  praise: {
    backgroundColor: colors.butterSoft,
    borderRadius: radius.inner,
    padding: 12,
    marginTop: 14,
  },
  praiseText: { color: '#A8842B', fontSize: 13, lineHeight: 19 },

  kpiRow: { flexDirection: 'row', justifyContent: 'space-between' },

  cap: { fontSize: 13, color: colors.inkSoft, marginBottom: 6, fontWeight: '600' },
  crownText: { fontSize: 13, color: colors.brandDeep, fontWeight: '600' },

  latencyRow: { flexDirection: 'row', gap: 10 },
  latencyChip: {
    flex: 1,
    backgroundColor: colors.lilacSoft,
    borderRadius: radius.inner,
    padding: 10,
    alignItems: 'center',
  },
  latencyName: { fontSize: 12, color: colors.inkSoft },
  latencyVal: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 2 },

  milestones: { gap: 12 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mEmoji: { fontSize: 26 },
  mTitle: { fontSize: 12, color: colors.inkSoft },
  mMain: { fontSize: 17, fontWeight: '700', color: colors.ink },
  mSub: { fontSize: 12, color: colors.inkSoft },

  profileRow: { flexDirection: 'row', gap: 12 },
  profile: {
    flex: 1,
    borderRadius: radius.card,
    padding: 14,
  },
  profileName: { fontSize: 18, fontWeight: '800' },
  profileStat: { fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  profileSub: { fontSize: 11, color: colors.inkSoft, marginTop: 8, fontWeight: '700' },
  profileFine: { fontSize: 12, color: colors.ink, marginTop: 2 },

  sharedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sharedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  sharedWord: { color: colors.brandDeep, fontSize: 14, fontWeight: '600' },
  sharedCount: { color: colors.brand, fontSize: 12 },
});
