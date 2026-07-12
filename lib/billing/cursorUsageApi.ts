/**
 * Cliente da API não oficial do dashboard Cursor (cursor.com/dashboard/usage).
 * Requer cookie WorkosCursorSessionToken em CURSOR_SESSION_TOKEN (Vercel).
 */

const CURSOR_ORIGIN = 'https://cursor.com';

export interface CursorTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCents?: number;
}

export interface CursorUsageEvent {
  timestamp: string;
  model: string;
  kind: string;
  requestsCosts?: number;
  usageBasedCosts?: string;
  isTokenBasedCall?: boolean;
  tokenUsage?: CursorTokenUsage;
  owningUser?: string;
  owningTeam?: string;
  cursorTokenFee?: number;
  isChargeable?: boolean;
  isHeadless?: boolean;
  chargedCents?: number;
}

export interface CursorUsageSummary {
  billingCycleStart: string;
  billingCycleEnd: string;
  membershipType?: string;
  limitType?: string;
  isUnlimited?: boolean;
  individualUsage?: {
    plan?: {
      enabled?: boolean;
      used?: number;
      limit?: number;
      remaining?: number;
      totalPercentUsed?: number;
    };
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
  teamUsage?: {
    onDemand?: {
      enabled?: boolean;
      used?: number | string;
      limit?: number | string | null;
      remaining?: number | string | null;
    };
  };
}

export interface CursorUsageEventsResponse {
  totalUsageEventsCount?: number;
  usageEventsDisplay?: CursorUsageEvent[];
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  pro: 'Cursor Pro',
  pro_plus: 'Cursor Pro+',
  ultra: 'Cursor Ultra',
  business: 'Cursor Business',
  enterprise: 'Cursor Enterprise',
  team: 'Cursor Teams',
  free: 'Cursor Free',
};

export function formatCursorMembership(type: string | undefined): string {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return 'Cursor';
  return MEMBERSHIP_LABELS[key] || `Cursor ${type}`;
}

export function parseUsdFromUsageCost(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function eventAmountUsd(evt: CursorUsageEvent): number {
  const cents = Number(evt.chargedCents || 0);
  if (cents > 0) return Math.round(cents) / 100;
  return parseUsdFromUsageCost(evt.usageBasedCosts);
}

function sessionHeaders(sessionToken: string): Record<string, string> {
  return { Cookie: `WorkosCursorSessionToken=${sessionToken.trim()}` };
}

export async function fetchCursorUsageSummary(sessionToken: string): Promise<CursorUsageSummary> {
  const resp = await fetch(`${CURSOR_ORIGIN}/api/usage-summary`, {
    headers: sessionHeaders(sessionToken),
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401 || json?.error === 'not_authenticated') {
    throw new Error('Sessão Cursor expirada — atualize CURSOR_SESSION_TOKEN (cookie WorkosCursorSessionToken em cursor.com)');
  }
  if (!resp.ok) {
    throw new Error(json?.error || json?.message || `Cursor usage-summary HTTP ${resp.status}`);
  }
  if (!json?.billingCycleStart || !json?.billingCycleEnd) {
    throw new Error('Resposta Cursor usage-summary inválida');
  }
  return json as CursorUsageSummary;
}

export async function fetchCursorUsageEventsPage(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<CursorUsageEventsResponse> {
  const resp = await fetch(`${CURSOR_ORIGIN}/api/dashboard/get-filtered-usage-events`, {
    method: 'POST',
    headers: {
      ...sessionHeaders(sessionToken),
      'Content-Type': 'application/json',
      Origin: CURSOR_ORIGIN,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401 || json?.error === 'not_authenticated') {
    throw new Error('Sessão Cursor expirada — atualize CURSOR_SESSION_TOKEN');
  }
  if (!resp.ok) {
    throw new Error(json?.error || json?.message || `Cursor usage-events HTTP ${resp.status}`);
  }
  return json as CursorUsageEventsResponse;
}

export interface FetchCursorEventsOptions {
  startDate?: string;
  endDate?: string;
  teamId?: number;
  userId?: number;
  pageSize?: number;
  maxPages?: number;
}

/** Busca eventos paginados do ciclo de faturamento. */
export async function fetchAllCursorUsageEvents(
  sessionToken: string,
  options: FetchCursorEventsOptions = {},
): Promise<CursorUsageEvent[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 40;
  const all: CursorUsageEvent[] = [];
  let total = Infinity;

  for (let page = 1; page <= maxPages && all.length < total; page += 1) {
    const body: Record<string, unknown> = { page, pageSize };
    if (options.startDate) body.startDate = options.startDate;
    if (options.endDate) body.endDate = options.endDate;
    if (options.teamId != null) body.teamId = options.teamId;
    if (options.userId != null) body.userId = options.userId;

    const json = await fetchCursorUsageEventsPage(sessionToken, body);
    total = Number(json.totalUsageEventsCount ?? all.length);
    const batch = json.usageEventsDisplay || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }

  return all;
}

export function getCursorSessionToken(): string {
  return String(
    process.env.CURSOR_SESSION_TOKEN ||
      process.env.CURSOR_WORKOS_SESSION_TOKEN ||
      '',
  ).trim();
}

export function isCursorSessionConfigured(): boolean {
  return getCursorSessionToken().length > 0;
}
