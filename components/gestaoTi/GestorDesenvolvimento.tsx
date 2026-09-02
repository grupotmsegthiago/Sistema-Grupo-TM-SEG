import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Link2,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import {
  GESTAO_TI_CATALOG_VERSION,
  GESTOR_DESENVOLVIMENTO_SCREEN_ID,
  canAccessGestorDesenvolvimento,
  connectionTypeLabelPt,
  countCriticalConnections,
  countIncidentsBySeverity,
  countOpenIncidents,
  deriveIncidentsFromCatalogAndHealth,
  deriveOverallHealthPresentation,
  fetchHealthSummary,
  formatSeverityDistribution,
  getCatalogSnapshot,
  incidentStateLabelPt,
  listDuplicatedSsot,
  listUnmonitoredModules,
  monitoringStatusLabelPt,
  summarizeHealthCheck,
  type DerivedIncident,
  type HealthCheckResult,
  type HealthTone,
} from '../../lib/gestaoTi';

const TONE_CLASS: Record<HealthTone, string> = {
  green: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  yellow: 'bg-amber-100 text-amber-900 border-amber-300',
  red: 'bg-red-100 text-red-900 border-red-300',
  gray: 'bg-gray-100 text-gray-700 border-gray-300',
  blue: 'bg-sky-100 text-sky-900 border-sky-300',
};

const TONE_DOT: Record<HealthTone, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
  blue: 'bg-sky-500',
};

function ToneBadge({ tone, children }: { tone: HealthTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONE_CLASS[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}

function monitoringTone(status: string): HealthTone {
  if (status === 'monitored') return 'green';
  if (status === 'partial') return 'yellow';
  if (status === 'structural') return 'blue';
  return 'gray'; // sem monitoramento — nunca verde
}

function Card({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-w-0"
      data-testid={testId}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-slate-50/80">
        {icon}
        <h2 className="text-sm font-bold text-slate-800 break-words">{title}</h2>
      </header>
      <div className="p-4 min-w-0">{children}</div>
    </section>
  );
}

function TechnicalDetails({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2" data-testid="gestor-desenvolvimento-tech-details">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Ver detalhes técnicos
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[10px] font-mono bg-slate-50 border border-slate-100 rounded-lg p-2 text-slate-600">
          {text || '—'}
        </pre>
      )}
    </div>
  );
}

function HealthCheckCard({ check }: { check: HealthCheckResult }) {
  const view = summarizeHealthCheck(check);
  return (
    <li className="border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-0" data-testid={`gestor-health-${check.id}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-slate-800 break-words">{check.label}</span>
        <ToneBadge tone={check.tone}>{view.estado}</ToneBadge>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-600">
        <div className="min-w-0">
          <dt className="inline font-semibold text-slate-500">Estado: </dt>
          <dd className="inline break-words [overflow-wrap:anywhere]">{view.estado}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline font-semibold text-slate-500">Endpoint: </dt>
          <dd className="inline font-mono break-all [overflow-wrap:anywhere]">{view.endpoint}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">HTTP: </dt>
          <dd className="inline">{view.http}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">Tempo: </dt>
          <dd className="inline">{view.tempoMs != null ? `${view.tempoMs} ms` : '—'}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">Retry: </dt>
          <dd className="inline">{view.retryCount}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline font-semibold text-slate-500">Mensagem: </dt>
          <dd className="inline break-words [overflow-wrap:anywhere]">{view.mensagemPrincipal}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline font-semibold text-slate-500">Diagnóstico: </dt>
          <dd className="inline break-words [overflow-wrap:anywhere]">{view.diagnosticoResumido}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">Última verificação: </dt>
          <dd className="inline">{view.ultimaVerificacao}</dd>
        </div>
      </dl>
      <TechnicalDetails text={view.detalhesTecnicos} />
    </li>
  );
}

export const GestorDesenvolvimento: React.FC = () => {
  const catalog = getCatalogSnapshot();
  const [health, setHealth] = useState<HealthCheckResult[]>([]);
  const [incidents, setIncidents] = useState<DerivedIncident[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [buildInfo, setBuildInfo] = useState<string>('—');
  const [error, setError] = useState<string | null>(null);

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('userData') || '{}');
    } catch {
      return {};
    }
  })();

  const allowed = canAccessGestorDesenvolvimento({
    role: user.role,
    permissions: user.permissions,
  });

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    setError(null);
    try {
      const results = await fetchHealthSummary(catalog.healthEndpoints, authFetch);
      setHealth(results);
      setIncidents(deriveIncidentsFromCatalogAndHealth(catalog, results));
      const ver = results.find((r) => r.id === 'hc-version');
      if (ver?.summary) setBuildInfo(ver.summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingHealth(false);
    }
  }, [catalog]);

  useEffect(() => {
    if (allowed) void loadHealth();
  }, [allowed, loadHealth]);

  if (!allowed) {
    return (
      <div
        className="p-8 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl"
        data-testid="gestor-desenvolvimento-denied"
      >
        Acesso restrito a perfis Diretoria / Administrador (ou permissão `{GESTOR_DESENVOLVIMENTO_SCREEN_ID}`).
      </div>
    );
  }

  const overall = deriveOverallHealthPresentation(health);
  const criticalConnections = countCriticalConnections();
  const dupSsot = listDuplicatedSsot();
  const unmonitored = listUnmonitoredModules();
  const openIncidentsTotal = countOpenIncidents(incidents);
  const severityCounts = countIncidentsBySeverity(incidents);
  const severityLine = formatSeverityDistribution(severityCounts);

  return (
    <div
      className="space-y-4 pb-16 bg-slate-50/60 p-2 rounded-2xl animate-fade-in max-w-full overflow-x-hidden min-w-0"
      data-testid="gestor-desenvolvimento"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-2 pt-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sky-800">
            <Shield className="w-5 h-5 shrink-0" />
            <h1 className="text-xl font-black tracking-tight break-words">Gestor de Desenvolvimento</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl break-words [overflow-wrap:anywhere]">
            Central técnica somente leitura — catálogo versionado, mapa de conexões e health checks existentes.
            Autocorreção e migrations não estão ativos nesta fase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealth()}
          disabled={loadingHealth}
          className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          data-testid="gestor-desenvolvimento-refresh-health"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
          Atualizar health
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 min-w-0" data-testid="gestor-desenvolvimento-kpis">
        <Kpi label="Saúde geral" value={overall.label} tone={overall.tone} />
        <Kpi label="Módulos" value={String(catalog.modules.length)} tone="blue" />
        <Kpi label="Conexões" value={String(catalog.connections.length)} tone="blue" />
        <Kpi
          label="Conexões críticas"
          value={String(criticalConnections)}
          tone="yellow"
          testId="gestor-kpi-critical-connections"
        />
        <Kpi label="SSOT duplicada/parcial" value={String(dupSsot.length)} tone="yellow" />
        <Kpi label="Sem monitoramento" value={String(unmonitored.length)} tone="gray" />
        <Kpi
          label="Incidentes abertos"
          value={String(openIncidentsTotal)}
          tone={openIncidentsTotal ? 'red' : 'green'}
          sub={severityLine}
          testId="gestor-kpi-open-incidents"
        />
        <Kpi label="Mapa" value={GESTAO_TI_CATALOG_VERSION} tone="blue" />
      </div>

      {health.length > 0 && (
        <p
          className="px-2 text-[11px] text-slate-600 break-words [overflow-wrap:anywhere]"
          data-testid="gestor-desenvolvimento-health-explanation"
        >
          {overall.explanation}
        </p>
      )}

      <div className="px-2 text-[11px] text-slate-500 break-words [overflow-wrap:anywhere]" data-testid="gestor-desenvolvimento-build">
        Último build identificado: <span className="font-mono text-slate-800">{buildInfo}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 break-words [overflow-wrap:anywhere]">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 min-w-0">
        <Card title="Health checks existentes" icon={<Activity className="w-4 h-4 text-emerald-700" />} testId="gestor-desenvolvimento-health">
          <ul className="space-y-2">
            {health.length === 0 && (
              <li className="text-xs text-slate-500">{loadingHealth ? 'Consultando…' : 'Nenhum resultado ainda.'}</li>
            )}
            {health.map((h) => (
              <HealthCheckCard key={h.id} check={h} />
            ))}
          </ul>
        </Card>

        <Card title="Central de incidentes (derivados)" icon={<AlertTriangle className="w-4 h-4 text-amber-700" />} testId="gestor-desenvolvimento-incidents">
          <p className="text-[11px] text-slate-500 mb-2">
            Em memória / leitura — sem persistência improvisada. Prompt Cursor disponível na Fase 6.
          </p>
          <p
            className="text-[11px] font-semibold text-slate-700 mb-3 break-words [overflow-wrap:anywhere]"
            data-testid="gestor-incidents-severity-distribution"
          >
            Total na central: {incidents.length} · Abertos: {openIncidentsTotal} · {severityLine}
          </p>
          <ul className="space-y-2 max-h-[420px] overflow-auto">
            {incidents.slice(0, 40).map((inc) => (
              <li key={inc.code} className="border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-0">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="font-bold text-slate-800 break-all [overflow-wrap:anywhere]">{inc.code}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100">{inc.severity}</span>
                </div>
                <div className="mt-1 font-medium text-slate-700 break-words [overflow-wrap:anywhere]">{inc.title}</div>
                <div className="mt-1 text-slate-500">Módulo: {inc.moduleId}</div>
                <div className="mt-1 text-slate-600 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{inc.evidence}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {incidentStateLabelPt(inc.state)} · qtd {inc.count} · {inc.firstSeenAt}
                </div>
                <div className="mt-1 text-slate-600 break-words [overflow-wrap:anywhere]">Impacto: {inc.impact}</div>
                <button
                  type="button"
                  disabled
                  title="Disponível na Fase 6."
                  className="mt-2 text-[10px] font-bold px-2 py-1 rounded border border-dashed border-slate-300 text-slate-400 cursor-not-allowed"
                >
                  Gerar prompt — Disponível na Fase 6.
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Mapa de conexões (catálogo)" icon={<GitBranch className="w-4 h-4 text-sky-700" />} testId="gestor-desenvolvimento-connections">
        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-auto max-h-[480px]">
          <table className="min-w-full text-[11px]">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">Origem → Destino</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Regra</th>
                <th className="py-2 pr-2">Fonte oficial</th>
                <th className="py-2 pr-2">Crit.</th>
                <th className="py-2 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {catalog.connections.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-2 font-mono text-slate-600 whitespace-nowrap">{c.id}</td>
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-slate-800">{c.origin}</div>
                    <div className="text-slate-500 flex items-center gap-1">
                      <Link2 className="w-3 h-3" /> {c.destination}
                    </div>
                  </td>
                  <td className="py-2 pr-2">{connectionTypeLabelPt(c.type)}</td>
                  <td className="py-2 pr-2 max-w-[200px] break-words">{c.rule}</td>
                  <td className="py-2 pr-2 max-w-[220px] break-words">{c.officialSource}</td>
                  <td className="py-2 pr-2 uppercase font-bold">{c.criticality}</td>
                  <td className="py-2 pr-2">
                    <ToneBadge tone={monitoringTone(c.monitoringStatus)}>
                      {monitoringStatusLabelPt(c.monitoringStatus)}
                    </ToneBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards verticais — sem tabela larga */}
        <ul
          className="md:hidden space-y-3 max-h-[480px] overflow-y-auto overflow-x-hidden"
          data-testid="gestor-desenvolvimento-connections-mobile"
        >
          {catalog.connections.map((c) => (
            <li
              key={c.id}
              className="border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-0"
              data-testid={`gestor-conn-card-${c.id}`}
            >
              <div className="font-mono text-[10px] text-slate-500 break-all">ID: {c.id}</div>
              <div className="mt-1 font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">
                Origem: {c.origin}
              </div>
              <div className="mt-0.5 text-slate-600 break-words [overflow-wrap:anywhere] flex items-start gap-1">
                <Link2 className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Destino: {c.destination}</span>
              </div>
              <div className="mt-1 text-slate-600">Tipo: {connectionTypeLabelPt(c.type)}</div>
              <div className="mt-1 text-slate-600 break-words [overflow-wrap:anywhere]">Regra: {c.rule}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="uppercase font-bold text-slate-700">{c.criticality}</span>
                <ToneBadge tone={monitoringTone(c.monitoringStatus)}>
                  {monitoringStatusLabelPt(c.monitoringStatus)}
                </ToneBadge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 min-w-0">
        <Card title="Módulos catalogados" icon={<Server className="w-4 h-4 text-slate-700" />} testId="gestor-desenvolvimento-modules">
          <ul className="space-y-2">
            {catalog.modules.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-0">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 break-words">{m.name}</div>
                  <div className="text-slate-500 break-words [overflow-wrap:anywhere]">
                    {m.domain} · {m.screens.join(', ') || '—'}
                  </div>
                </div>
                <ToneBadge tone={monitoringTone(m.monitoringStatus)}>
                  {monitoringStatusLabelPt(m.monitoringStatus)}
                </ToneBadge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Fonte única da verdade" icon={<BookOpen className="w-4 h-4 text-violet-700" />} testId="gestor-desenvolvimento-ssot">
          <ul className="space-y-2 max-h-[480px] overflow-auto">
            {catalog.ssot.map((s) => (
              <li key={s.id} className="border border-gray-100 rounded-lg px-3 py-2 text-xs min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 break-words">{s.dataLabel}</span>
                  <ToneBadge
                    tone={
                      s.state === 'confirmado' ? 'green' : s.state === 'duplicado' ? 'red' : s.state === 'parcial' ? 'yellow' : 'gray'
                    }
                  >
                    {s.state}
                  </ToneBadge>
                </div>
                <div className="mt-1 text-slate-600 break-words [overflow-wrap:anywhere]">Oficial: {s.officialSource}</div>
                <div className="mt-1 text-slate-500 break-words [overflow-wrap:anywhere]">Writers: {s.writers.join(' · ')}</div>
                <div className="text-slate-500 break-words [overflow-wrap:anywhere]">Readers: {s.readers.join(' · ')}</div>
                <div className="text-slate-500 break-words [overflow-wrap:anywhere]">Recalc: {s.recalculators.join(' · ') || '—'}</div>
                <div className="mt-1 text-amber-800">Risco divergência: {s.divergenceRisk}</div>
                <div className="mt-1 text-[10px] text-slate-400 font-mono break-all [overflow-wrap:anywhere]">{s.evidence.join(' | ')}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

function Kpi({
  label,
  value,
  tone,
  sub,
  testId,
}: {
  label: string;
  value: string;
  tone: HealthTone;
  sub?: string;
  testId?: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-0 ${TONE_CLASS[tone]}`} data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80 break-words">{label}</div>
      <div className="text-sm font-black break-words [overflow-wrap:anywhere] mt-0.5" title={value}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] mt-1 opacity-90 leading-snug break-words [overflow-wrap:anywhere]" data-testid={`${testId || 'kpi'}-sub`}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default GestorDesenvolvimento;
