import type { HealthCheckResult, HealthEndpointDef, HealthTone } from './types.js';
import { sanitizeForDisplay } from './sanitize.js';

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

async function fetchOnce(
  path: string,
  authFetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal,
): Promise<{ ok: boolean | null; statusCode: number | null; summary: string; latencyMs: number }> {
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
    let summary = sanitizeForDisplay(bodyText.slice(0, 400));
    let logicalOk: boolean | null = res.ok;
    try {
      const json = JSON.parse(bodyText);
      if (typeof json?.ok === 'boolean') logicalOk = json.ok && res.ok;
      else if (typeof json?.status === 'string') {
        logicalOk = res.ok && /ok|ready|up|healthy/i.test(json.status);
      }
      if (json?.schemaReady === false) {
        logicalOk = false;
        summary = sanitizeForDisplay(`schemaReady=false ${summary}`);
      }
      if (json?.buildId) summary = sanitizeForDisplay(`buildId=${json.buildId}`);
      if (json?.version && json?.buildId) {
        summary = sanitizeForDisplay(`v${json.version} build=${json.buildId}`);
      }
    } catch {
      // texto puro
    }
    if (!res.ok) logicalOk = false;
    return { ok: logicalOk, statusCode: res.status, summary, latencyMs };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: null,
      statusCode: null,
      summary: sanitizeForDisplay(`falha de rede/timeout: ${msg}`),
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
      checkedAt: new Date().toISOString(),
      retries,
    });
  }

  return results;
}

export function overallToneFromHealth(results: HealthCheckResult[]): HealthTone {
  if (!results.length) return 'gray';
  if (results.some((r) => r.tone === 'red')) return 'red';
  if (results.some((r) => r.tone === 'yellow')) return 'yellow';
  if (results.every((r) => r.tone === 'green')) return 'green';
  return 'yellow';
}
