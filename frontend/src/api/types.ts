// Wire DTOs — mirror backend/app/schemas.py.

export interface DevLoginResponse {
  userId: string;
  token: string;
  nickname: string | null;
}

export interface RingResponse {
  id: string;
  mac: string;
  sn: string;
  model: string | null;
  uniqueNo: string | null;
}

export interface InviteResponse {
  code: string;
  expiresAt: number;
}

export interface CoupleResponse {
  coupleId: string;
  uniqueCode: string;
  partnerUserId: string;
  partnerNickname: string | null;
  chatlabSession: string | null;
}

export interface MissYouEventResponse {
  id: string;
  fromUserId: string;
  toUserId: string;
  triggerType: string;
  memory: string | null;
  createdAt: number;
  delivered: boolean;
}

export interface IncomingEvent {
  id: string;
  fromUserId: string;
  fromNickname: string | null;
  memory: string | null;
  triggerType: string;
  createdAt: number;
}

// --- miss-you history (GET /events/miss-you) — 全部历史，不区分已读/未读 ---
export interface MissYouHistoryItem {
  id: string;
  fromUserId: string | null;
  fromNickname: string | null;
  memory: string | null;
  triggerType: string | null;
  createdAt: number | null;
  deliveredAt: number | null;
  readAt: number | null;
}

export interface MissYouHistoryResponse {
  events: MissYouHistoryItem[];
}

// --- miss-you stats (GET /events/miss-you/stats) — 累计发送/接收总数 ---
export interface MissYouStatsResponse {
  sent: number;
  received: number;
}

export interface MessageResponse {
  pushed: boolean;
  detail: string | null;
  reply: string | null; // AI 伴侣的即时回复（双人模式为 null）
}

// --- companion (single-person AI partner) ---
export interface CompanionResponse {
  coupleId: string;
  aiUserId: string;
  name: string;
  gender: string;
  traits: string[];
}

export interface CompanionMessageDTO {
  role: 'user' | 'ai';
  text: string;
  createdAt: number;
}

export interface CreateCompanionBody {
  name: string;
  gender: string;
  traits: string[];
}

export interface AnalysisResponse {
  session: string;
  overview: Record<string, unknown> | null;
}

// --- Dashboard (GET /analysis/dashboard) — mirrors ChatLab /_web analytics ---

export interface WeekdayStat {
  weekday: number; // 1..7
  messageCount: number;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  messageCount: number;
}

export interface RelationshipMember {
  memberId: number;
  name: string;
  totalInitiateCount: number;
  totalCloseCount: number;
}

export interface Relationship {
  members: RelationshipMember[];
  responseLatency: { memberId: number; name: string; avgResponseTime: number }[];
  perseverance: { memberId: number; name: string; totalDoubleTexts: number }[];
  iceBreakers: { month: string; memberId: number; name: string; count: number }[];
  totalSessions: number;
}

export interface JourneyRange {
  firstMessageTs: number;
  lastMessageTs: number;
  spanDays: number;
  spanMonths: number;
  activeDays: number;
  activeMonths: number;
}

export interface Journey {
  range: JourneyRange;
  months: { month: string; messageCount: number; activeDays: number; segmentCount: number }[];
  peakMonth: { month: string; messageCount: number; activeDays: number; segmentCount: number } | null;
  longestSegment: {
    durationSeconds: number;
    messageCount: number;
    initiator: { memberId: number; name: string };
  } | null;
  longestSilence: {
    durationSeconds: number;
    reopenedBy: { memberId: number; name: string };
  } | null;
}

export interface MessageLength {
  grouped: { range: string; count: number }[];
  detail: { len: number; count: number }[];
}

export interface WordFrequency {
  words: { word: string; count: number; percentage: number }[];
  totalWords: number;
  totalMessages: number;
  uniqueWords: number;
}

export interface LangMember {
  memberId: number;
  name: string;
  totalMessages: number;
  totalWords: number;
  uniqueWords: number;
  lexicalDiversity: number;
  topWords: { word: string; count: number }[];
  modalParticles: { word: string; count: number }[];
  punctuation: {
    ellipsis: number;
    exclamation: number;
    question: number;
    tilde: number;
    period: number;
    noPunct: number;
    total: number;
  };
}

export interface LanguagePreference {
  members: LangMember[];
  sharedWords: { word: string; countA: number; countB: number }[];
  similarityScore: number;
}

export interface DashboardResponse {
  disabled?: boolean;
  reason?: string;
  session?: string;
  range?: { startTs: number; endTs: number };
  weekday: WeekdayStat[] | null;
  relationship: Relationship | null;
  journey: Journey | null;
  messageLength: MessageLength | null;
  longMessageCount: number | null;
  daily: DailyStat[] | null;
  wordFrequency: WordFrequency | null;
  languagePreference: LanguagePreference | null;
}

export interface RecordingResponse {
  id: string;
  userId: string;
  originalFilename: string | null;
  durationMs: number | null;
  sourceType: string | null;
  decodeStatus: string; // 'decoded' | 'failed'
  decodeError: string | null;
  binSize: number;
  wavSize: number | null;
  uploadedAt: number;
  downloadUrl: string | null;
  asrStatus: string | null; // 'pending' | 'running' | 'done' | 'failed' | null
  asrText: string | null;
  asrError: string | null;
}

// --- recall (双人回忆问答) ---
export interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  createdAt: number;
}

export interface RecallAskResponse {
  answer: string;
}

export interface RecallHistoryResponse {
  messages: ChatMsg[];
}
