import type { HealthCheckResult, HealthEndpointDef, HealthTone } from './types.js';
import { maskZapiInstanceIds, sanitizeForDisplay, sanitizeLogText } from './sanitize.js';

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toneFromResult(ok: boolean | null, statusCode: number | null, attempts: number): HealthTone {
  if (ok === true) return 'green';
  if (ok === false && statusCode != null) return 'red';
  // Sem resposta definitiva após retries → atenção (amarelo), não vermelho definitivo.
  if (attempts > 0 && ok === null) return 'yellow';
  return 'gray';
}

function executiveSummaryFromBody(
  bodyText: string,
  resOk: boolean,
  statusCode: number,
): { summary: string; detail: string; logicalOk: boolean | null } {
  const detail = maskZapiInstanceIds(sanitizeLogText(bodyText.slice(0, 1600), 1200));
  let logicalOk: boolean | null = resOk;
  let summary = '';

  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    if (typeof json?.ok === 'boolean') logicalOk = json.ok && resOk;
    else if (typeof json?.status === 'string') {
      logicalOk = resOk && /ok|ready|up|healthy/i.test(String(json.status));
    }
    if (json?.schemaReady === false) {
      logicalOk = false;
    }

    const bits: string[] = [];
    if (json?.buildId) bits.push(`buildId=${String(json.buildId).slice(0, 12)}`);
    if (json?.version && json?.buildId) {
      summary = maskZapiInstanceIds(
        sanitizeForDisplay(`v${json.version} build=${String(json.buildId).slice(0, 12)}`),
      );
    }
    if (typeof json.reachable === 'boolean') {
      bits.push(json.reachable ? 'API alcançável' : 'API não alcançável');
    }
    if (typeof json.connected === 'boolean') {
      bits.push(json.connected ? 'instância conectada' : 'instância desconectada');
    }
    if (typeof json.error === 'string' && json.error) {
      bits.push(maskZapiInstanceIds(sanitizeForDisplay(json.error)).slice(0, 140));
    }
    if (typeof json.message === 'string' && json.message && !summary) {
      bits.push(maskZapiInstanceIds(sanitizeForDisplay(json.message)).slice(0, 140));
    }
    if (!summary) {
      summary = bits.length
        ? bits.join(' · ')
        : maskZapiInstanceIds(sanitizeForDisplay(bodyText.slice(0, 180)));
    }
  } catch {
    summary = maskZapiInstanceIds(sanitizeForDisplay(bodyText.slice(0, 180)));
  }

  if (!resOk) logicalOk = false;
  if (!summary) summary = resOk ? 'ok' : `HTTP ${statusCode}`;
  return { summary, detail, logicalOk };
}

async function fetchOnce(
  path: string,
  authFetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<{
  ok: boolean | null;
  statusCode: number | null;
  summary: string;
  detail: string;
  latencyMs: number;
}> {
  const started = Date.now();
  try {
    const res = await authFetchFn(path, { signal });
    const latencyMs = Date.now() - started;
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    const { summary, detail, logicalOk } = executiveSummaryFromBody(bodyText, res.ok, res.status);
    return { ok: logicalOk, statusCode: res.status, summary, detail, latencyMs };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const summary = maskZapiInstanceIds(
      sanitizeForDisplay(`falha de rede/timeout: ${msg}`),
    );
    return {
      ok: null,
      statusCode: null,
      summary,
      detail: summary,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Consome health checks existentes com 1 retry controlado.
 * Não marca falha definitiva sem retry quando a falha é de rede/timeout.
 */
export async function fetchHealthSummary(
  endpoints: HealthEndpointDef[],
  authFetchFn: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  for (const ep of endpoints) {
    let retries = 0;
    let last = await (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        return await fetchOnce(ep.path, authFetchFn, ctrl.signal);
      } finally {
        clearTimeout(t);
      }
    })();

    const shouldRetry = last.ok === null || (last.ok === false && last.statusCode != null && last.statusCode >= 500);
    if (shouldRetry) {
      retries = 1;
      await sleep(RETRY_DELAY_MS);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        last = await fetchOnce(ep.path, authFetchFn, ctrl.signal);
      } finally {
        clearTimeout(t);
      }
    }

    results.push({
      id: ep.id,
      label: ep.label,
      path: ep.path,
      moduleId: ep.moduleId,
      tone: toneFromResult(last.ok, last.statusCode, retries),
      ok: last.ok,
      statusCode: last.statusCode,
      latencyMs: last.latencyMs,
      summary: last.summary,
      detail: last.detail,
      checkedAt: new Date().toISOString(),
      retries,
    });
  }

  return results;
}

/**
 * Tom agregado simples (legado). Preferir deriveOverallHealthPresentation
 * para diferenciar falha crítica vs timeout.
 */
export function overallToneFromHealth(results: HealthCheckResult[]): HealthTone {
  if (!results.length) return 'gray';
  if (results.some((r) => r.tone === 'red')) return 'red';
  if (results.some((r) => r.tone === 'yellow')) return 'yellow';
  if (results.every((r) => r.tone === 'green')) return 'green';
  return 'yellow';
}
