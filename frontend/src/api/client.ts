import {
  AnalysisResponse,
  ChatMsg,
  CompanionMessageDTO,
  CompanionResponse,
  CoupleResponse,
  CreateCompanionBody,
  DashboardResponse,
  DevLoginResponse,
  IncomingEvent,
  InviteResponse,
  MessageResponse,
  MissYouEventResponse,
  MissYouHistoryResponse,
  MissYouStatsResponse,
  RecallAskResponse,
  RecallHistoryResponse,
  RecordingResponse,
} from './types';

/** REST client over fetch. The dev bearer token is injected on every request. */
export class ApiClient {
  token: string | null = null;

  constructor(private baseUrl: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  devLogin(nickname: string) {
    return this.req<DevLoginResponse>('POST', '/auth/dev-login', { nickname });
  }
  invite() {
    return this.req<InviteResponse>('POST', '/couples/invite');
  }
  accept(code: string) {
    return this.req<CoupleResponse>('POST', '/couples/accept', { code });
  }
  myCouple() {
    return this.req<CoupleResponse>('GET', '/couples/me');
  }
  missYou(triggerType: string, memory?: string) {
    return this.req<MissYouEventResponse>(
      'POST',
      '/events/miss-you',
      memory ? { triggerType, memory } : { triggerType },
    );
  }
  events(since: number) {
    return this.req<{ events: IncomingEvent[] }>('GET', `/events?since=${since}`);
  }
  missYouHistory() {
    return this.req<MissYouHistoryResponse>('GET', '/events/miss-you');
  }
  missYouStats() {
    return this.req<MissYouStatsResponse>('GET', '/events/miss-you/stats');
  }
  pushMessage(text: string, fileIndex?: number) {
    return this.req<MessageResponse>('POST', '/messages', { text, fileIndex });
  }
  analysisOverview() {
    return this.req<AnalysisResponse>('GET', '/analysis/overview');
  }
  dashboard() {
    return this.req<DashboardResponse>('GET', '/analysis/dashboard');
  }
  createCompanion(body: CreateCompanionBody) {
    return this.req<CompanionResponse>('POST', '/companion', body);
  }
  companionMe() {
    return this.req<CompanionResponse>('GET', '/companion/me');
  }
  companionHistory(limit = 50) {
    return this.req<{ messages: CompanionMessageDTO[] }>('GET', `/companion/history?limit=${limit}`);
  }
  leaveCouple() {
    return this.req<{ ok: boolean }>('POST', '/couples/leave');
  }
  recallAsk(question: string) {
    return this.req<RecallAskResponse>('POST', '/recall/ask', { question });
  }
  recallHistory(limit = 50) {
    return this.req<RecallHistoryResponse>('GET', `/recall/history?limit=${limit}`);
  }
  listRecordings() {
    return this.req<RecordingResponse[]>('GET', '/recordings');
  }
}
