import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing } from './theme';

export { colors, radius, shadow, spacing };
/** @deprecated import { colors } from './theme' — kept for stragglers. */
export const ROSE = colors.brand;

// ---------------------------------------------------------------- Screen shell

/**
 * Page shell: pink gradient paper + scroll + page padding + scalloped footer.
 * Every screen renders inside one of these so the background/padding is uniform.
 */
export function Screen({
  children,
  scroll = true,
  footer = true,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  footer?: boolean;
  contentStyle?: ViewStyle;
}) {
  const inner = (
    <>
      {children}
      {footer && <FooterWave />}
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[colors.bgTop, colors.bgBottom]}
        style={StyleSheet.absoluteFill}
      />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.screenContent, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

/** Big handwritten-style page title with sticker accents and optional mascot. */
export function PageTitle({
  title,
  subtitle,
  mascot,
  sticker = 'heart',
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  mascot?: boolean;
  sticker?: StickerKind | null;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      {(onBack || right) && (
        <View style={styles.titleTopRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.roundBtn} hitSlop={8}>
              <Text style={{ fontSize: 16, color: colors.brand, fontWeight: '700' }}>‹</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {right ?? <View />}
        </View>
      )}
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text style={styles.h1}>{title}</Text>
            {sticker && <Sticker kind={sticker} size={22} rotate={12} style={{ marginTop: 2 }} />}
          </View>
          {subtitle ? <Text style={styles.h1Sub}>{subtitle}</Text> : null}
        </View>
        {mascot && <RingMascot size={72} />}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------- Stickers

export type StickerKind = 'heart' | 'star' | 'clover' | 'flower' | 'moon' | 'bulb' | 'mail' | 'sparkle';

const STICKER_GLYPH: Record<StickerKind, string> = {
  heart: '💗',
  star: '⭐',
  clover: '🍀',
  flower: '🌸',
  moon: '🌙',
  bulb: '💡',
  mail: '💌',
  sparkle: '✨',
};

/**
 * A hand-account style sticker: glyph on a white pill with a soft shadow and a
 * slight rotation. Overlap card corners via absolute positioning for the
 * "stuck on" look (DESIGN.md §5 — 3-5 per screen, don't wallpaper).
 */
export function Sticker({
  kind,
  size = 28,
  rotate = -8,
  style,
}: {
  kind: StickerKind;
  size?: number;
  rotate?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.sticker,
        shadow,
        {
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.72 }}>{STICKER_GLYPH[kind]}</Text>
    </View>
  );
}

/** The Ring IP: a white tofu-block with blush, dot eyes, a smile and "Ring". */
export function RingMascot({ size = 64, style }: { size?: number; style?: ViewStyle }) {
  const s = size;
  return (
    <View
      style={[
        styles.mascot,
        shadow,
        { width: s, height: s, borderRadius: s * 0.3 },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', gap: s * 0.18, marginTop: s * 0.16 }}>
        <View style={[styles.mascotEye, { width: s * 0.08, height: s * 0.08, borderRadius: s * 0.04 }]} />
        <View style={[styles.mascotEye, { width: s * 0.08, height: s * 0.08, borderRadius: s * 0.04 }]} />
      </View>
      <View
        style={{
          width: s * 0.16,
          height: s * 0.09,
          borderBottomWidth: Math.max(1.5, s * 0.03),
          borderBottomColor: colors.ink,
          borderBottomLeftRadius: s * 0.1,
          borderBottomRightRadius: s * 0.1,
          marginTop: s * 0.02,
        }}
      />
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s * 0.1 }]} pointerEvents="none">
        <View style={{ width: s * 0.13, height: s * 0.09, borderRadius: s * 0.07, backgroundColor: colors.brandSoft }} />
        <View style={{ width: s * 0.13, height: s * 0.09, borderRadius: s * 0.07, backgroundColor: colors.brandSoft }} />
      </View>
      <Text style={{ color: colors.brand, fontWeight: '700', fontSize: Math.max(8, s * 0.17), marginTop: s * 0.03 }}>
        Ring
      </Text>
    </View>
  );
}

/** Scalloped pink cloud footer that closes long pages (DESIGN.md §4). */
export function FooterWave() {
  const bumps = Array.from({ length: 7 });
  return (
    <View style={styles.footerWave} pointerEvents="none">
      <View style={styles.footerRow}>
        {bumps.map((_, i) => (
          <View key={i} style={styles.footerBump} />
        ))}
      </View>
      <Sticker kind="heart" size={18} rotate={-10} style={{ position: 'absolute', left: 18, top: -2 }} />
      <Sticker kind="star" size={16} rotate={14} style={{ position: 'absolute', right: 24, top: 6 }} />
    </View>
  );
}

// -------------------------------------------------------------------- Buttons

export function Button({
  title,
  onPress,
  disabled,
  variant = 'filled',
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'filled' | 'soft' | 'outline';
  icon?: string;
}) {
  const isFilled = variant === 'filled';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        isFilled
          ? { backgroundColor: pressed ? colors.brandDeep : colors.brand }
          : {
              backgroundColor: variant === 'soft' ? colors.brandSoft : colors.card,
              borderWidth: 1.5,
              borderColor: colors.brand,
              opacity: pressed ? 0.75 : 1,
            },
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon ? <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text> : null}
      <Text style={[styles.btnText, !isFilled && { color: colors.brand }]}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------- Cards

export type CardTint = 'white' | 'brand' | 'lilac' | 'butter' | 'mint' | 'sky';

const TINT_BG: Record<CardTint, string> = {
  white: colors.card,
  brand: colors.brandSoft,
  lilac: colors.lilacSoft,
  butter: colors.butterSoft,
  mint: colors.mintSoft,
  sky: colors.skySoft,
};

export function Card({
  children,
  tint = 'white',
  style,
  onPress,
}: {
  children: React.ReactNode;
  tint?: CardTint;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.card, shadow, { backgroundColor: TINT_BG[tint] }, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

/** Card heading: small colored icon + bold title (+ optional right accessory). */
export function CardTitle({
  icon,
  children,
  right,
}: {
  icon?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.cardTitleRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {icon ? <Text style={{ fontSize: 16 }}>{icon}</Text> : null}
        <Text style={styles.cardTitleText}>{children}</Text>
      </View>
      {right}
    </View>
  );
}

/** KPI card: label → big number + unit → warm caption (DESIGN.md §6.5). */
export function StatCard({
  label,
  value,
  unit,
  note,
  emoji,
  tint = colors.brand,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  emoji?: string;
  tint?: string;
}) {
  return (
    <View style={[styles.statCard, shadow]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color: tint }]} numberOfLines={1}>
          {value}
          {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
        </Text>
        {note ? <Text style={styles.statNote}>{note}</Text> : null}
      </View>
      {emoji ? <Text style={{ fontSize: 28 }}>{emoji}</Text> : null}
    </View>
  );
}

// -------------------------------------------------------------- Chips & tags

export type ChipTone = 'brand' | 'mint' | 'lilac' | 'sky' | 'butter';

const CHIP_STYLE: Record<ChipTone, { bg: string; fg: string }> = {
  brand: { bg: colors.brandSoft, fg: colors.brandDeep },
  mint: { bg: colors.mintSoft, fg: '#3D8A61' },
  lilac: { bg: colors.lilacSoft, fg: '#7C64AE' },
  sky: { bg: colors.skySoft, fg: '#4A77C4' },
  butter: { bg: colors.butterSoft, fg: '#A8842B' },
};

export function Chip({ label, tone = 'brand' }: { label: string; tone?: ChipTone }) {
  const c = CHIP_STYLE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function TagToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tag,
        active
          ? { backgroundColor: colors.brandSoft, borderColor: colors.brand }
          : { backgroundColor: colors.card, borderColor: colors.inkFaint },
      ]}
    >
      <Text style={{ color: active ? colors.brand : colors.ink, fontSize: 14, fontWeight: active ? '700' : '400' }}>
        {label}
      </Text>
      {active && (
        <View style={styles.tagCheck}>
          <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>✓</Text>
        </View>
      )}
    </Pressable>
  );
}

// -------------------------------------------------------------------- Bubbles

/** Chat bubble. Mine = soft pink with ink text (never rose-on-white anymore). */
export function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: colors.brandSoft, borderBottomRightRadius: radius.bubbleTail }
          : { backgroundColor: colors.card, borderBottomLeftRadius: radius.bubbleTail },
      ]}
    >
      <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

// ------------------------------------------------------------ Bars & progress

export function ProgressBar({
  value,
  color = colors.brand,
  height = 10,
}: {
  value: number; // 0..100
  color?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.brandSoft, overflow: 'hidden' }}>
      <View style={{ width: `${clamped}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

// --------------------------------------------------------------------- Inputs

/** Rounded input with an optional character counter (「0/12」 style). */
export function Field({
  value,
  onChangeText,
  placeholder,
  maxLength,
  multiline,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  onSubmitEditing?: () => void;
}) {
  return (
    <View>
      <TextInput
        style={[styles.field, multiline && { minHeight: 96, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        maxLength={maxLength}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing}
      />
      {maxLength != null && (
        <Text style={styles.fieldCount}>
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color={colors.brand} />;
}

// ---------------------------------------------------------------------- Styles

const styles = StyleSheet.create({
  screenContent: {
    padding: spacing.page,
    paddingTop: 64,
    paddingBottom: 0,
    gap: spacing.gap,
    flexGrow: 1,
  },

  titleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: 1 },
  h1Sub: { fontSize: 14, color: colors.inkSoft, marginTop: 6 },

  sticker: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  mascot: {
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  mascotEye: { backgroundColor: colors.ink },

  footerWave: { height: 56, marginTop: 10, marginHorizontal: -spacing.page },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  footerBump: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandSoft,
    marginHorizontal: -8,
    opacity: 0.7,
  },

  btn: {
    flexDirection: 'row',
    paddingVertical: 15,
    // Horizontal breathing room for buttons that hug their content (e.g. in a
    // centered overlay card); full-width buttons are unaffected.
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },

  card: {
    borderRadius: radius.card,
    padding: spacing.cardPad,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitleText: { fontSize: 16, fontWeight: '700', color: colors.ink },

  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: { fontSize: 13, color: colors.inkSoft },
  statValue: { fontSize: 34, fontWeight: '800', marginTop: 2 },
  statUnit: { fontSize: 13, fontWeight: '400', color: colors.inkSoft },
  statNote: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },

  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },

  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
    gap: 6,
  },
  tagCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bubble: {
    borderRadius: radius.bubble,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
    // Width is capped by the caller's wrapper (maxWidth 74% in the chat rows);
    // capping again here compounds (78% × 74%) and leaves a gap beside the avatar.
    ...shadow,
    shadowOpacity: 0.1,
    elevation: 2,
  },

  field: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    borderRadius: radius.inner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  fieldCount: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    fontSize: 11,
    color: colors.inkFaint,
  },
});
