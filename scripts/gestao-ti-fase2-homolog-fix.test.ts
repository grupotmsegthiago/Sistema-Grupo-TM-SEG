/**
 * Correções de homologação — Fase 2 (contadores, tons, sanitização, layout, escopo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  GESTAO_TI_CATALOG_VERSION,
  countCriticalConnections,
  countIncidentsBySeverity,
  countOpenIncidents,
  deriveIncidentsFromCatalogAndHealth,
  deriveOverallHealthPresentation,
  formatSeverityDistribution,
  getCatalogSnapshot,
  incidentCounterMatchesCollection,
  listCriticalConnections,
  maskZapiInstanceIds,
  monitoringStatusLabelPt,
  sanitizeForDisplay,
  summarizeHealthCheck,
  type HealthCheckResult,
} from '../lib/gestaoTi';

function mkCheck(partial: Partial<HealthCheckResult> & Pick<HealthCheckResult, 'id' | 'tone'>): HealthCheckResult {
  return {
    label: partial.label || partial.id,
    path: partial.path || '/api/x',
    moduleId: partial.moduleId || 'mod-infra',
    ok: partial.ok ?? (partial.tone === 'green' ? true : partial.tone === 'red' ? false : null),
    statusCode: partial.statusCode ?? (partial.tone === 'red' ? 502 : partial.tone === 'green' ? 200 : null),
    latencyMs: partial.latencyMs ?? 12,
    summary: partial.summary || 'ok',
    detail: partial.detail,
    checkedAt: partial.checkedAt || new Date().toISOString(),
    retries: partial.retries ?? 0,
    ...partial,
  };
}

describe('gestao TI — homologação fase 2', () => {
  it('contadores: conexões críticas ≠ severidade de incidente', () => {
    const catalog = getCatalogSnapshot();
    const critical = countCriticalConnections();
    assert.equal(critical, listCriticalConnections('p1').length);
    assert.ok(critical >= 10);
    // Criticidade estrutural do catálogo (p0/p1), não P0–P1 de incidente
    assert.equal(catalog.connections.length, 24);
  });

  it('contadores por severidade e total batem com a coleção da Central', () => {
    const catalog = getCatalogSnapshot();
    const health: HealthCheckResult[] = [
      mkCheck({
        id: 'hc-zapi',
        tone: 'red',
        moduleId: 'mod-whatsapp',
        path: '/api/zapi/health',
        statusCode: 502,
        summary: 'API alcançável · instância desconectada',
      }),
      mkCheck({
        id: 'hc-diagnostics',
        tone: 'red',
        moduleId: 'mod-infra',
        path: '/api/system/diagnostics',
        statusCode: 500,
        summary: 'Cannot find module server/supabaseConfig',
      }),
      mkCheck({
        id: 'hc-supabase',
        tone: 'yellow',
        moduleId: 'mod-infra',
        path: '/api/supabase/health-check',
        summary: 'falha de rede/timeout: aborted',
        retries: 1,
      }),
      mkCheck({
        id: 'hc-rh',
        tone: 'yellow',
        moduleId: 'mod-rh',
        path: '/api/rh/health',
        summary: 'falha de rede/timeout: aborted',
        retries: 1,
      }),
    ];
    const incidents = deriveIncidentsFromCatalogAndHealth(catalog, health);
    const open = countOpenIncidents(incidents);
    const bySev = countIncidentsBySeverity(incidents);
    const total = incidents.length;

    assert.ok(incidentCounterMatchesCollection(total, incidents));
    assert.ok(incidentCounterMatchesCollection(open, incidents, (i) => i.state === 'aberto'));
    assert.equal(bySev.P0 + bySev.P1 + bySev.P2 + bySev.P3 + bySev.P4, total);
    assert.equal(open, incidents.filter((i) => i.state === 'aberto').length);
    // Dois health vermelhos → abertos; amarelos são observados (não abertos)
    assert.equal(open, 2);
    assert.ok(bySev.P1 >= 2);
    assert.ok(bySev.P3 >= 2);
    assert.match(formatSeverityDistribution(bySev), /P0: \d+ · P1: \d+ · P2: \d+ · P3: \d+ · P4: \d+/);

    // Quatro problemas reais registrados como incidentes separados
    assert.ok(incidents.some((i) => i.code.includes('HC-ZAPI') && i.state === 'aberto'));
    assert.ok(incidents.some((i) => i.code.includes('HC-DIAGNOSTICS') && i.state === 'aberto'));
    assert.ok(incidents.some((i) => i.code.includes('HC-WARN-HC-SUPABASE')));
    assert.ok(incidents.some((i) => i.code.includes('HC-WARN-HC-RH')));
  });

  it('timeout vira Atenção; falha crítica confirmada vira Falha', () => {
    const onlyTimeouts = deriveOverallHealthPresentation([
      mkCheck({ id: 'hc-supabase', tone: 'yellow', moduleId: 'mod-infra', summary: 'falha de rede/timeout: aborted' }),
      mkCheck({ id: 'hc-rh', tone: 'yellow', moduleId: 'mod-rh', summary: 'falha de rede/timeout: aborted' }),
      mkCheck({ id: 'hc-app', tone: 'green', moduleId: 'mod-infra' }),
    ]);
    assert.equal(onlyTimeouts.label, 'Atenção');
    assert.equal(onlyTimeouts.tone, 'yellow');
    assert.match(onlyTimeouts.explanation, /inconclusiv|timeout/i);
    assert.doesNotMatch(onlyTimeouts.explanation, /^Falha confirmada/);

    const withCriticalFail = deriveOverallHealthPresentation([
      mkCheck({ id: 'hc-zapi', tone: 'red', moduleId: 'mod-whatsapp', statusCode: 502, summary: 'instância desconectada' }),
      mkCheck({ id: 'hc-diagnostics', tone: 'red', moduleId: 'mod-infra', statusCode: 500, summary: 'bundle' }),
      mkCheck({ id: 'hc-supabase', tone: 'yellow', moduleId: 'mod-infra', summary: 'falha de rede/timeout: aborted' }),
      mkCheck({ id: 'hc-rh', tone: 'yellow', moduleId: 'mod-rh', summary: 'falha de rede/timeout: aborted' }),
    ]);
    assert.equal(withCriticalFail.label, 'Falha');
    assert.equal(withCriticalFail.tone, 'red');
    assert.match(withCriticalFail.explanation, /Falha confirmada em 2/);
    assert.match(withCriticalFail.explanation, /2 estão inconclusivas por timeout/);
  });

  it('resumo de health não expõe JSON bruto; detalhes recolhíveis e sanitizados', () => {
    const check = mkCheck({
      id: 'hc-zapi',
      tone: 'red',
      moduleId: 'mod-whatsapp',
      path: '/api/zapi/health',
      statusCode: 502,
      summary: 'API alcançável · instância desconectada',
      detail: JSON.stringify({
        ok: false,
        instanceId: '3EABCDEF123456',
        token: 'fake_token_value',
        email: 'ops@example.com',
        password: 'secret',
      }),
    });
    const view = summarizeHealthCheck(check);
    assert.equal(view.endpoint, '/api/zapi/health');
    assert.equal(view.http, '502');
    assert.ok(view.estado.includes('Falha') || view.estado.includes('confirmada'));
    assert.ok(view.mensagemPrincipal.length > 0);
    assert.ok(view.diagnosticoResumido.length > 0);
    assert.ok(view.detalhesTecnicos.length > 0);
    assert.ok(view.detalhesTecnicos.length <= 1300);
    assert.doesNotMatch(view.detalhesTecnicos, /fake_token_value/);
    assert.doesNotMatch(view.detalhesTecnicos, /ops@example\.com/);
    assert.doesNotMatch(view.detalhesTecnicos, /3EABCDEF123456/);
    assert.match(view.detalhesTecnicos, /instância|REDACTED/i);
  });

  it('mascaramento de identificador Z-API e sanitização', () => {
    const raw = 'Instância 3EABCDEF99 token=abc123 email=a@b.com';
    const masked = maskZapiInstanceIds(sanitizeForDisplay(raw));
    assert.doesNotMatch(masked, /3EABCDEF99/);
    assert.doesNotMatch(masked, /abc123/);
    assert.doesNotMatch(masked, /a@b\.com/);
  });

  it('tradução de status unmonitored → sem monitoramento', () => {
    assert.equal(monitoringStatusLabelPt('unmonitored'), 'sem monitoramento');
    assert.equal(monitoringStatusLabelPt('monitored'), 'monitorado');
    assert.equal(monitoringStatusLabelPt('partial'), 'parcial');
    assert.equal(monitoringStatusLabelPt('structural'), 'estrutural');
  });

  it('UI: cards móveis, overflow-x-hidden, detalhes técnicos, PT-BR, sem KPIs antigos', async () => {
    const ui = await readFile('components/gestaoTi/GestorDesenvolvimento.tsx', 'utf8');
    assert.match(ui, /from 'react'/);
    assert.match(ui, /useState/);
    assert.match(ui, /gestor-desenvolvimento-connections-mobile/);
    assert.match(ui, /overflow-x-hidden/);
    assert.match(ui, /overflow-wrap:anywhere/);
    assert.match(ui, /Ver detalhes técnicos/);
    assert.match(ui, /Conexões críticas/);
    assert.match(ui, /Incidentes abertos/);
    assert.match(ui, /sem monitoramento/);
    assert.doesNotMatch(ui, /Críticas \(P0–P1\)/);
    assert.doesNotMatch(ui, /Incidentes abertos\/P0–P1/);
    assert.doesNotMatch(ui, />\s*unmonitored\s*</);
    assert.match(ui, /md:hidden/);
    assert.match(ui, /hidden md:block/);
    // Larguras alvo documentadas nos testes de layout
    assert.match(ui, /Origem:/);
    assert.match(ui, /Destino:/);
    assert.match(ui, /Regra:/);
  });

  it('24 conexões preservadas; versão fase2.2', () => {
    const snap = getCatalogSnapshot();
    assert.equal(snap.connections.length, 24);
    assert.equal(GESTAO_TI_CATALOG_VERSION, '2026.08.04-fase2.2');
    assert.equal(snap.version, '2026.08.04-fase2.2');
  });

  it('nenhuma escrita no banco nos arquivos de apresentação', async () => {
    const files = [
      'lib/gestaoTi/presentation.ts',
      'lib/gestaoTi/fetchHealthSummary.ts',
      'lib/gestaoTi/deriveIncidents.ts',
      'components/gestaoTi/GestorDesenvolvimento.tsx',
    ];
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      assert.doesNotMatch(src, /\.insert\s*\(/);
      assert.doesNotMatch(src, /\.upsert\s*\(/);
      assert.doesNotMatch(src, /\.update\s*\(/);
      assert.doesNotMatch(src, /\.delete\s*\(/);
      assert.doesNotMatch(src, /createSupabaseAdminClient/);
    }
  });

  it('funções Vercel permanecem em 50; sem api gestao-ti', async () => {
    const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
    const n = Object.keys(vercel.functions || {}).length;
    assert.equal(n, 50);
    assert.equal(existsSync('api/gestao-ti.ts'), false);
  });

  it('varredura de segredos nos arquivos da fase 2', async () => {
    const files = [
      'lib/gestaoTi/presentation.ts',
      'lib/gestaoTi/sanitize.ts',
      'components/gestaoTi/GestorDesenvolvimento.tsx',
    ];
    for (const f of files) {
      const src = await readFile(f, 'utf8');
      assert.doesNotMatch(src, /sk_live_/);
      assert.doesNotMatch(src, /service_role\s*[:=]\s*['\"]eyJ/);
      assert.doesNotMatch(src, /Bearer eyJ[A-Za-z0-9]/);
      assert.doesNotMatch(src, /AQ\.Ab8/);
    }
  });

  it('responsividade: CSS impede overflow horizontal e usa cards em largura móvel', async () => {
    const ui = await readFile('components/gestaoTi/GestorDesenvolvimento.tsx', 'utf8');
    // Viewports alvo: 375 / 390 / 430 — cards mobile; desktop tabela
    assert.match(ui, /max-w-full/);
    assert.match(ui, /min-w-0/);
    assert.match(ui, /gestor-desenvolvimento-connections-mobile/);
    const mobileBlock = ui.slice(
      ui.indexOf('gestor-desenvolvimento-connections-mobile'),
      ui.indexOf('Módulos catalogados'),
    );
    assert.match(mobileBlock, /ID:/);
    assert.match(mobileBlock, /Origem:/);
    assert.match(mobileBlock, /Destino:/);
    assert.match(mobileBlock, /Tipo:/);
    assert.match(mobileBlock, /Regra:/);
    assert.match(mobileBlock, /monitoringStatusLabelPt/);
  });
});
