// Design tokens — single source of truth is DESIGN.md (§2–§4). Do not hardcode
// colors/radii/shadows in screens; import from here.

export const colors = {
  // brand
  brand: '#EC5A8A',
  brandSoft: '#F8D7E3',
  brandDeep: '#D94B7B',
  // macaron accents
  lilac: '#B39DDB',
  lilacSoft: '#EDE7F8',
  sky: '#7FA7E8',
  skySoft: '#E3ECFB',
  butter: '#F6C752',
  butterSoft: '#FFF6DC',
  mint: '#7BC89C',
  mintSoft: '#E3F4EA',
  // neutrals (no pure black anywhere)
  ink: '#4A3B55',
  inkSoft: '#8A7C96',
  inkFaint: '#B9AEC4',
  card: '#FFFFFF',
  bgTop: '#FDEFF4',
  bgBottom: '#F9E8F0',
  hairline: '#F3E4EC',
  danger: '#D9534F',
} as const;

export const radius = {
  card: 24,
  inner: 16,
  pill: 999,
  bubble: 20,
  /** The "pointed" corner of a chat bubble (toward its author). */
  bubbleTail: 6,
} as const;

/** The one soft, pink-tinted floating shadow every card shares. */
export const shadow = {
  shadowColor: '#D98BA8',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
} as const;

export const spacing = {
  page: 20,
  gap: 14,
  cardPad: 18,
} as const;
