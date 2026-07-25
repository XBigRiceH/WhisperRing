import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

// Two-person semantic palette (DESIGN.md §2.4): pink = me/A, blue = partner/B.
export const HER = colors.brand;
export const HIM = colors.sky;
const TRACK = colors.brandSoft;

/** A big KPI number with a label and optional caption. */
export function StatTile({
  value,
  label,
  caption,
  tint = colors.ink,
}: {
  value: string | number;
  label: string;
  caption?: string;
  tint?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {caption ? <Text style={styles.tileCaption}>{caption}</Text> : null}
    </View>
  );
}

/** Horizontal bars: one row each, width proportional to the max value. */
export function HBars({
  data,
  color = HER,
  suffix = '',
}: {
  data: { label: string; value: number }[];
  color?: string;
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 7 }}>
      {data.map((d, i) => (
        <View key={i} style={styles.hbarRow}>
          <Text style={styles.hbarLabel} numberOfLines={1}>
            {d.label}
          </Text>
          <View style={styles.hbarTrack}>
            <View
              style={[
                styles.hbarFill,
                { width: `${Math.max(4, (d.value / max) * 100)}%`, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={styles.hbarValue}>
            {d.value}
            {suffix}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Round-top vertical bars with value labels. Scrolls when there are many. */
export function VBars({
  data,
  color = HER,
  height = 120,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 22;
  const body = (
    <View style={[styles.vbarsRow, { height: height + 34 }]}>
      {data.map((d, i) => (
        <View key={i} style={[styles.vbarCol, { width: barW + 10 }]}>
          <Text style={styles.vbarValue}>{d.value || ''}</Text>
          <View
            style={{
              height: Math.max(4, (d.value / max) * height),
              width: barW,
              backgroundColor: color,
              borderRadius: barW / 2,
            }}
          />
          <Text style={styles.vbarLabel} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
  return data.length > 8 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {body}
    </ScrollView>
  ) : (
    body
  );
}

/** A two-person pink-vs-blue split bar with in-bar percentages. */
export function VsBar({
  labelA,
  valueA,
  labelB,
  valueB,
  suffix = '',
}: {
  labelA: string;
  valueA: number;
  labelB: string;
  valueB: number;
  suffix?: string;
}) {
  const total = valueA + valueB || 1;
  const pctA = Math.round((valueA / total) * 100);
  const widthA = Math.max(12, Math.min(88, pctA));
  return (
    <View style={{ marginVertical: 6 }}>
      <View style={styles.vsHead}>
        <Text style={[styles.vsName, { color: HER }]}>
          {labelA} · {valueA}
          {suffix}
        </Text>
        <Text style={[styles.vsName, { color: HIM }]}>
          {valueB}
          {suffix} · {labelB}
        </Text>
      </View>
      <View style={styles.vsTrack}>
        <View style={[styles.vsA, { width: `${widthA}%` }]}>
          <Text style={styles.vsPct}>{pctA}%</Text>
        </View>
        <View style={styles.vsB}>
          <Text style={styles.vsPct}>{100 - pctA}%</Text>
        </View>
      </View>
    </View>
  );
}

/** A hero percentage — big number over a rounded progress track (0–100). */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View style={styles.score}>
      <Text style={styles.scoreNum}>
        {clamped}
        <Text style={styles.scorePct}>%</Text>
      </Text>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${clamped}%` }]} />
      </View>
    </View>
  );
}

const CLOUD_COLORS = [colors.brand, colors.lilac, colors.sky, colors.mint, '#D9A23B'];

/** Word chips sized by frequency — macaron-colored tag cloud. */
export function TagCloud({
  words,
}: {
  words: { word: string; count: number }[];
  color?: string; // kept for call-site compatibility; colors now rotate
}) {
  const max = Math.max(1, ...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  return (
    <View style={styles.cloud}>
      {words.map((w, i) => {
        const t = max === min ? 1 : (w.count - min) / (max - min);
        const size = 13 + Math.round(t * 12); // 13..25
        return (
          <Text
            key={i}
            style={{
              fontSize: size,
              fontWeight: t > 0.6 ? '700' : '400',
              color: CLOUD_COLORS[i % CLOUD_COLORS.length],
              opacity: 0.6 + t * 0.4,
              marginRight: 10,
              marginVertical: 3,
            }}
          >
            {w.word}
          </Text>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, hint, icon }: { title: string; hint?: string; icon?: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Text style={{ fontSize: 15 }}>{icon}</Text> : null}
        <Text style={styles.section}>{title}</Text>
      </View>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 74, alignItems: 'center', paddingVertical: 6 },
  tileValue: { fontSize: 24, fontWeight: '800' },
  tileLabel: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  tileCaption: { fontSize: 10, color: colors.inkFaint, marginTop: 1 },

  hbarRow: { flexDirection: 'row', alignItems: 'center' },
  hbarLabel: { width: 64, fontSize: 12, color: colors.ink },
  hbarTrack: { flex: 1, height: 12, backgroundColor: TRACK, borderRadius: 6, overflow: 'hidden' },
  hbarFill: { height: 12, borderRadius: 6 },
  hbarValue: { width: 44, textAlign: 'right', fontSize: 12, color: colors.inkSoft },

  vbarsRow: { flexDirection: 'row', alignItems: 'flex-end' },
  vbarCol: { alignItems: 'center', justifyContent: 'flex-end' },
  vbarValue: { fontSize: 10, color: colors.inkSoft, marginBottom: 3 },
  vbarLabel: { fontSize: 10, color: colors.inkFaint, marginTop: 5, maxWidth: 40, textAlign: 'center' },

  vsHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  vsName: { fontSize: 13, fontWeight: '600' },
  vsTrack: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  vsA: { backgroundColor: HER, justifyContent: 'center', paddingLeft: 10 },
  vsB: { flex: 1, backgroundColor: HIM, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 10 },
  vsPct: { color: 'white', fontSize: 11, fontWeight: '700' },

  score: { alignItems: 'center', paddingVertical: 4 },
  scoreNum: { fontSize: 56, fontWeight: '800', color: colors.brand, lineHeight: 62 },
  scorePct: { fontSize: 26, fontWeight: '700' },
  scoreLabel: { fontSize: 14, color: colors.inkSoft, marginTop: 2 },
  scoreTrack: {
    width: '100%',
    height: 12,
    backgroundColor: TRACK,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 12,
  },
  scoreFill: { height: 12, backgroundColor: colors.brand, borderRadius: 6 },

  cloud: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: -4,
    paddingHorizontal: 4,
  },
  section: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sectionHint: { fontSize: 11, color: colors.inkSoft },
});
