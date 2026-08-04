/** Smoke read-only dos health checks locais via fetchHealthSummary (Fase 2). */
import { fetchHealthSummary, getCatalogSnapshot, overallToneFromHealth } from '../lib/gestaoTi/index.ts';

const snap = getCatalogSnapshot();
const pub = snap.healthEndpoints.filter((h) =>
  ['hc-app', 'hc-version', 'hc-invest', 'hc-gemini', 'hc-zapi'].includes(h.id),
);
const authFetch = (url, init) => fetch(`http://127.0.0.1:5000${url}`, init);
const results = await fetchHealthSummary(pub, authFetch);
console.log(
  JSON.stringify(
    {
      overall: overallToneFromHealth(results),
      items: results.map((r) => ({
        id: r.id,
        tone: r.tone,
        ok: r.ok,
        status: r.statusCode,
        retries: r.retries,
        summary: String(r.summary || '').slice(0, 100),
      })),
    },
    null,
    2,
  ),
);
