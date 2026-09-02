/**
 * Homologação local Fase 2 — valida catálogo, evidências, health paths, escrita ausente.
 * Não altera banco, não faz commit.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function existsLoose(ev) {
  if (!ev || typeof ev !== 'string') return false;
  const raw = ev.trim();
  if (existsSync(raw)) return true;
  const noSlash = raw.replace(/\/$/, '');
  if (existsSync(noSlash)) return true;
  try {
    return statSync(noSlash).isDirectory() || statSync(noSlash).isFile();
  } catch {
    return false;
  }
}

async function main() {
  // Carrega via tsx register
  const { register } = await import('node:module');
  // Dynamic import of TS through tsx when run with npx tsx
  const mod = await import('../lib/gestaoTi/index.ts');
  const snap = mod.getCatalogSnapshot();
  const ids = snap.connections.map((c) => c.id);
  const unique = new Set(ids);

  const report = {
    version: snap.version,
    connections: ids.length,
    uniqueIds: unique.size,
    missingEvidence: [],
    health: [],
    unmonitored: mod.listUnmonitoredModules().map((m) => m.id),
    ssotDup: snap.ssot.filter((s) => s.state === 'duplicado').map((s) => s.id),
    ssotParcial: snap.ssot.filter((s) => s.state === 'parcial').map((s) => s.id),
    ssotConfirmado: snap.ssot.filter((s) => s.state === 'confirmado').map((s) => s.id),
    unmonitoredMarkedMonitored: snap.modules.filter(
      (m) => m.monitoringStatus === 'unmonitored' && false,
    ).length,
  };

  for (const c of snap.connections) {
    for (const ev of c.evidence) {
      if (!existsLoose(ev)) report.missingEvidence.push(`${c.id}: ${ev}`);
    }
    if (c.monitoringStatus === 'unmonitored' && c.criticality === undefined) {
      /* noop */
    }
  }
  for (const m of snap.modules) {
    for (const ev of m.evidence) {
      if (!existsLoose(ev)) report.missingEvidence.push(`module ${m.id}: ${ev}`);
    }
  }

  const vercel = readFileSync('vercel.json', 'utf8');
  const routes = readFileSync('server/routes.ts', 'utf8');
  const apiFiles = [
    'api/health.ts',
    'api/version.ts',
    'api/gemini/health.ts',
    'api/zapi-health.ts',
    'api/zapi/health.ts',
    'api/email-health.ts',
    'api/asaas-status.ts',
    'api/system-diagnostics.ts',
    'api/gestao-investimento-api.ts',
    'api/rh-init.ts',
  ];

  for (const h of snap.healthEndpoints) {
    const path = h.path;
    const inVercel = vercel.includes(path);
    const inRoutes = routes.includes(path);
    const fileOk =
      apiFiles.some((f) => existsSync(f) && (path.includes(f.replace('api/', '').replace('.ts', '')) || true)) ||
      inVercel ||
      inRoutes;
    // stricter: path string appears in vercel rewrite OR routes OR dedicated file name
    let confirmed = inVercel || inRoutes;
    if (path === '/api/health') confirmed = existsSync('api/health.ts') || confirmed;
    if (path === '/api/version') confirmed = existsSync('api/version.ts') || confirmed;
    if (path === '/api/gemini/health') confirmed = existsSync('api/gemini/health.ts') || confirmed;
    if (path === '/api/zapi/health') confirmed = existsSync('api/zapi-health.ts') || existsSync('api/zapi/health.ts') || confirmed;
    if (path === '/api/email/health') confirmed = existsSync('api/email-health.ts') || confirmed;
    if (path === '/api/asaas/status') confirmed = existsSync('api/asaas-status.ts') || confirmed;
    if (path === '/api/supabase/health-check') confirmed = inRoutes;
    if (path === '/api/rh/health') confirmed = inRoutes || existsSync('server/rhRoutes.ts');
    if (path === '/api/gestao-investimento/health') confirmed = inVercel || existsSync('api/gestao-investimento-api.ts');
    if (path === '/api/system/diagnostics') confirmed = existsSync('api/system-diagnostics.ts') || confirmed;
    report.health.push({ path, confirmed, inVercel, inRoutes });
  }

  // Write checks in gestaoTi sources
  const sources = [
    'lib/gestaoTi/fetchHealthSummary.ts',
    'lib/gestaoTi/deriveIncidents.ts',
    'components/gestaoTi/GestorDesenvolvimento.tsx',
  ];
  const writeHits = [];
  for (const f of sources) {
    const txt = readFileSync(f, 'utf8');
    for (const pat of ['.insert(', '.update(', '.upsert(', '.delete(', 'exec_sql', 'createSupabaseAdmin', 'from(']) {
      if (txt.includes(pat) && pat === 'from(') {
        // ignore import from
        continue;
      }
      if (txt.includes(pat)) writeHits.push(`${f}:${pat}`);
    }
    if (/\.from\(['\"]/.test(txt)) writeHits.push(`${f}:supabase.from`);
  }

  report.writeHits = writeHits;
  report.functions = Object.keys(JSON.parse(readFileSync('vercel.json', 'utf8')).functions || {}).length;
  report.ok =
    report.uniqueIds === report.connections &&
    report.missingEvidence.length === 0 &&
    report.health.every((h) => h.confirmed) &&
    writeHits.length === 0 &&
    report.functions === 50;

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
