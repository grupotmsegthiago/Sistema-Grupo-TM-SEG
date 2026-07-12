import { formatNowDateTimeBR, formatDateTimeBR } from '../lib/dateUtils';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Mail, Clock, Save, Loader2, RefreshCw, History, FileBarChart, Send, CheckCircle2, AlertTriangle, ListChecks, Calendar, User, Download, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import ManualOverrideAlertSettings from './ManualOverrideAlertSettings';
import AlertRecipientsSettings from './AlertRecipientsSettings';
import AuditSummarySettings from './AuditSummarySettings';
import WhatsAppTelemetryDashboard from './WhatsAppTelemetryDashboard';
import WhatsAppConnectionPanel from './WhatsAppConnectionPanel';
import EmailHealthPanel from './EmailHealthPanel';
import { parseJsonResponse } from '../lib/parseJsonResponse';

type Schedule = { emails: string; hour: number; minute: number };
type DailyReports = {
  legal: Schedule;
  pending: Schedule;
  approval: Schedule;
  missingInfo: Schedule;
  stuckNf: Schedule;
};
type ReportKey = keyof DailyReports;
type RunResult = {
  ok: boolean;
  total?: number;
  emailTo?: string | string[];
  date?: string;
  message: string;
  at: string;
  testMode?: boolean;
};
type HistoryEntry = {
  id: string;
  createdAt: string;
  userName: string;
  before: DailyReports | null;
  after: DailyReports | null;
  changedFields: string[];
  summary: string;
};
type ManualRunEntry = {
  id: string;
  createdAt: string;
  userName: string;
  reportKey: ReportKey | null;
  testMode: boolean;
  overrideEmails: string | null;
  effectiveEmails: string | null;
  total: number | null;
  success: boolean;
  error: string | null;
};

const REPORTS: { key: ReportKey; title: string; description: string; endpoint: string }[] = [
  { key: 'legal',       title: 'Jurídico Diário',           description: 'Consulta diária no DataJud e envio do relatório de processos monitorados.', endpoint: '/api/datajud/relatorio-diario' },
  { key: 'pending',     title: 'Pendências (OS Concluídas)', description: 'OS concluídas com campos faltando (KM, horário, agente, etc.).',           endpoint: '/api/relatorio-pendencias' },
  { key: 'approval',    title: 'Aprovações Pendentes',       description: 'OS concluídas aguardando aprovação financeira.',                            endpoint: '/api/relatorio-aprovacoes' },
  { key: 'missingInfo', title: 'Dados Faltantes (Geral)',    description: 'Todas as OS (exceto canceladas/recusadas) com dados faltantes.',           endpoint: '/api/relatorio-dados-faltantes' },
  { key: 'stuckNf',     title: 'NF Travadas',                description: 'NFs presas no PlugNotas há mais tempo que o limite.',                       endpoint: '/api/relatorio-nfs-travadas' },
];

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const SETTINGS_FETCH_TIMEOUT_MS = 25_000;

const fetchWithTimeout = async (url: string, options: RequestInit = {}, ms = SETTINGS_FETCH_TIMEOUT_MS): Promise<Response> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const fmtTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const SystemSettingsPage: React.FC<{ onNavigate?: (id: string) => void }> = () => {
  const [settings, setSettings] = useState<DailyReports | null>(null);
  const [defaults, setDefaults] = useState<DailyReports | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [runningKey, setRunningKey] = useState<ReportKey | null>(null);
  const [runResults, setRunResults] = useState<Partial<Record<ReportKey, RunResult>>>({});
  const [overrideEmails, setOverrideEmails] = useState<Partial<Record<ReportKey, string>>>({});
  const [manualRuns, setManualRuns] = useState<ManualRunEntry[]>([]);
  const [manualRunsLoading, setManualRunsLoading] = useState(false);
  const [manualRunsExporting, setManualRunsExporting] = useState(false);
  const [manualRunsFilterKey, setManualRunsFilterKey] = useState<'' | ReportKey>('');
  const [manualRunsFilterMode, setManualRunsFilterMode] = useState<'' | 'test' | 'official'>('');
  const [manualRunsFilterFrom, setManualRunsFilterFrom] = useState<string>('');
  const [manualRunsFilterTo, setManualRunsFilterTo] = useState<string>('');
  type RunEntry = {
    id: string;
    createdAt: string;
    userName: string;
    source: 'manual' | 'scheduled';
    total: number | null;
    emailTo: string[];
    success: boolean;
    errorMessage: string | null;
    date: string | null;
  };
  const [runs, setRuns] = useState<Record<string, RunEntry[]>>({});
  const [lastScheduled, setLastScheduled] = useState<Record<string, RunEntry | null>>({});
  const [runsLoading, setRunsLoading] = useState(false);

  // Task #105 — Deep-link do e-mail de falha: lê ?focus=report&key=<reportKey>
  // e dá scroll + highlight temporário no card correspondente.
  const cardRefs = useRef<Partial<Record<ReportKey, HTMLDivElement | null>>>({});
  const [focusedKey, setFocusedKey] = useState<ReportKey | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('focus') !== 'report') return null;
      const k = sp.get('key') as ReportKey | null;
      const valid: ReportKey[] = ['legal', 'pending', 'approval', 'missingInfo', 'stuckNf'];
      return k && (valid as string[]).includes(k) ? k : null;
    } catch { return null; }
  });
  const [didScrollToFocus, setDidScrollToFocus] = useState(false);

  // Task #90 — Modal de histórico filtrável + CSV
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{
    id: string; createdAt: string; userName: string; reportKey: string; reportTitle: string;
    source: 'manual' | 'scheduled'; total: number | null; emailTo: string[];
    success: boolean; errorMessage: string | null; date: string | null;
  }>>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyExporting, setHistoryExporting] = useState(false);
  const [historyFilters, setHistoryFilters] = useState<{
    reportKey: '' | ReportKey; from: string; to: string; user: string;
    source: '' | 'manual' | 'scheduled'; status: '' | 'success' | 'error';
  }>({ reportKey: '', from: '', to: '', user: '', source: '', status: '' });
  const HISTORY_PAGE_SIZE = 25;
  const [historyPage, setHistoryPage] = useState(0);

  const canRunReports = useMemo(() => {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return false;
      const u = JSON.parse(raw);
      const role = String(u?.role || '').toLowerCase();
      if (role === 'administrador' || role === 'diretoria') return true;
      const perms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
      return perms.includes('*');
    } catch { return false; }
  }, []);

  // Task #99 — Última execução desse relatório falhou? Habilita modo "Reexecutar agora".
  const lastRunFailed = (key: ReportKey): boolean => {
    const list = runs[key] || [];
    if (list.length === 0) return false;
    return list[0].success === false;
  };

  const handleRunNow = async (key: ReportKey) => {
    const report = REPORTS.find(r => r.key === key);
    if (!report || !settings) return;
    const overrideRaw = (overrideEmails[key] || '').trim();
    const overrideList = overrideRaw.split(',').map(x => x.trim()).filter(Boolean);
    const isTest = overrideList.length > 0;
    const isRetry = !isTest && lastRunFailed(key);

    if (isTest) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const bad = overrideList.find(e => !emailRe.test(e));
      if (bad) { alert(`E-mail inválido em "Enviar somente para": ${bad}`); return; }
      if (!confirm(`Envio de TESTE do relatório "${report.title}".\n\nSerá enviado APENAS para:\n${overrideList.join(', ')}\n\nA configuração salva no banco NÃO será alterada nem usada neste envio.`)) return;
    } else if (isRetry) {
      const dest = (settings[key].emails || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');
      if (!dest) { alert('Defina pelo menos um destinatário antes de reexecutar.'); return; }
      if (!confirm(`Reexecutar agora o relatório "${report.title}"?\n\nA última execução falhou. Será feita uma nova tentativa imediatamente usando os destinatários SALVOS:\n${dest}\n\nSe der sucesso, o cooldown de alerta de falha (24h) será zerado.`)) return;
    } else {
      const dest = (settings[key].emails || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');
      if (!dest) { alert('Defina pelo menos um destinatário antes de enviar.'); return; }
      if (!confirm(`Disparar agora o relatório "${report.title}"?\n\nDestinatários atuais:\n${dest}\n\nAtenção: o envio usa os destinatários SALVOS no banco. Se você editou os campos acima e não clicou em "Salvar", a alteração NÃO será considerada.`)) return;
    }

    setRunningKey(key);
    try {
      const res = await fetch(report.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(isTest ? { overrideEmails: overrideList } : {}),
      });
      let json: any = {};
      try { json = await res.json(); } catch {}
      const at = formatNowDateTimeBR();
      if (!res.ok) {
        setRunResults(prev => ({ ...prev, [key]: { ok: false, message: json?.error || `HTTP ${res.status}`, at } }));
      } else {
        const total = typeof json?.total === 'number' ? json.total : undefined;
        const sent = json?.success === true;
        const emailTo = Array.isArray(json?.emailTo) ? json.emailTo.join(', ') : (json?.emailTo || '');
        const testMode = json?.testMode === true || isTest;
        const prefix = testMode ? '[TESTE] ' : '';
        const message = sent
          ? `${prefix}Enviado com sucesso${total != null ? ` — ${total} registro(s)` : ''}${emailTo ? ` para ${emailTo}` : ''}.${testMode ? ' A configuração salva não foi alterada.' : ''}`
          : (total === 0
              ? `${prefix}Execução concluída — sem itens para reportar, e-mail não enviado${testMode && emailTo ? ` (teste seria enviado para ${emailTo})` : ''}.`
              : `${prefix}Execução concluída sem envio${emailTo ? ` (destinatários: ${emailTo})` : ''}.`);
        setRunResults(prev => ({ ...prev, [key]: { ok: true, total, emailTo, date: json?.date, message, at, testMode } }));
        if (testMode) setOverrideEmails(prev => ({ ...prev, [key]: '' }));
      }
    } catch (e: any) {
      const at = formatNowDateTimeBR();
      setRunResults(prev => ({ ...prev, [key]: { ok: false, message: e?.message || 'Erro desconhecido', at } }));
    } finally {
      setRunningKey(null);
      fetchRuns();
    }
  };

  const fetchRuns = async () => {
    setRunsLoading(true);
    try {
      const res = await fetch('/api/admin/system-settings/daily-reports/runs?limit=5', { headers: authHeaders() });
      const json = await res.json();
      if (json?.ok) {
        setRuns(json.runs || {});
        setLastScheduled(json.lastScheduled || {});
      }
    } catch {
      // silencioso — execuções são informacionais
    } finally {
      setRunsLoading(false);
    }
  };

  const buildHistoryQuery = (page: number, format?: 'csv', filtersOverride?: typeof historyFilters) => {
    const f = filtersOverride || historyFilters;
    const qs = new URLSearchParams();
    if (f.reportKey) qs.set('report_key', f.reportKey);
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);
    if (f.user.trim()) qs.set('user', f.user.trim());
    if (f.source) qs.set('source', f.source);
    if (f.status) qs.set('status', f.status);
    if (format === 'csv') {
      qs.set('format', 'csv');
    } else {
      qs.set('limit', String(HISTORY_PAGE_SIZE));
      qs.set('offset', String(page * HISTORY_PAGE_SIZE));
    }
    return qs.toString();
  };

  const fetchHistory = async (page = historyPage, filtersOverride?: typeof historyFilters) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/system-settings/daily-reports/runs/history?${buildHistoryQuery(page, undefined, filtersOverride)}`, { headers: authHeaders() });
      const json = await res.json();
      if (json?.ok) {
        setHistoryRows(json.runs || []);
        setHistoryTotal(typeof json.total === 'number' ? json.total : (json.runs || []).length);
      } else {
        alert('Erro ao carregar histórico: ' + (json?.error || 'desconhecido'));
      }
    } catch (e: any) {
      alert('Erro ao carregar histórico: ' + (e?.message || 'desconhecido'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportHistoryCsv = async () => {
    setHistoryExporting(true);
    try {
      const res = await fetch(`/api/admin/system-settings/daily-reports/runs/history?${buildHistoryQuery(0, 'csv')}`, { headers: authHeaders() });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `historico-disparos-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Erro ao exportar CSV: ' + (e?.message || 'desconhecido'));
    } finally {
      setHistoryExporting(false);
    }
  };

  const openHistoryModal = (presetReportKey?: ReportKey) => {
    setHistoryOpen(true);
    setHistoryPage(0);
    if (presetReportKey) {
      const nextFilters = { ...historyFilters, reportKey: presetReportKey };
      setHistoryFilters(nextFilters);
      fetchHistory(0, nextFilters);
    } else {
      fetchHistory(0);
    }
  };

  const applyHistoryFilters = () => {
    setHistoryPage(0);
    fetchHistory(0);
  };

  const clearHistoryFilters = () => {
    setHistoryFilters({ reportKey: '', from: '', to: '', user: '', source: '', status: '' });
    setHistoryPage(0);
    setTimeout(() => fetchHistory(0), 0);
  };

  const changeHistoryPage = (delta: number) => {
    const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
    const next = Math.min(totalPages - 1, Math.max(0, historyPage + delta));
    if (next === historyPage) return;
    setHistoryPage(next);
    fetchHistory(next);
  };

  const fetchManualRuns = async (key: '' | ReportKey, mode: '' | 'test' | 'official', from?: string, to?: string) => {
    setManualRunsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (key) qs.set('report_key', key);
      if (mode) qs.set('mode', mode);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/admin/system-settings/manual-report-runs${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: authHeaders() });
      const json = await res.json();
      if (json?.ok) setManualRuns(json.runs || []);
    } catch {
      // silencioso — bloco informativo
    } finally {
      setManualRunsLoading(false);
    }
  };

  const exportManualRunsCsv = async () => {
    setManualRunsExporting(true);
    try {
      const qs = new URLSearchParams();
      if (manualRunsFilterKey) qs.set('report_key', manualRunsFilterKey);
      if (manualRunsFilterMode) qs.set('mode', manualRunsFilterMode);
      if (manualRunsFilterFrom) qs.set('from', manualRunsFilterFrom);
      if (manualRunsFilterTo) qs.set('to', manualRunsFilterTo);
      qs.set('export', '1');
      const res = await fetch(`/api/admin/system-settings/manual-report-runs?${qs.toString()}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        alert('Falha ao exportar: ' + (json?.error || `HTTP ${res.status}`));
        return;
      }
      const runs: ManualRunEntry[] = json.runs || [];
      if (runs.length === 0) {
        alert('Nenhum disparo manual encontrado para os filtros selecionados.');
        return;
      }
      const headers = ['Data', 'Usuário', 'Relatório', 'Modo', 'Destinatários', 'Total', 'Resultado', 'Erro'];
      const escape = (v: any) => {
        const s = v == null ? '' : String(v);
        return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(';')];
      for (const r of runs) {
        const reportMeta = REPORTS.find(x => x.key === r.reportKey);
        const dest = r.effectiveEmails || r.overrideEmails || '';
        const result = r.success ? 'Enviado' : (r.error ? 'Erro' : 'Sem envio');
        lines.push([
          fmtDate(r.createdAt),
          r.userName || '',
          reportMeta?.title || r.reportKey || '',
          r.testMode ? 'Teste' : 'Oficial',
          dest,
          r.total != null ? r.total : '',
          result,
          r.error || '',
        ].map(escape).join(';'));
      }
      const csv = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const parts = ['disparos-manuais'];
      if (manualRunsFilterKey) parts.push(manualRunsFilterKey);
      if (manualRunsFilterMode) parts.push(manualRunsFilterMode);
      if (manualRunsFilterFrom) parts.push(`de-${manualRunsFilterFrom}`);
      if (manualRunsFilterTo) parts.push(`ate-${manualRunsFilterTo}`);
      parts.push(stamp);
      a.download = `${parts.join('_')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Erro ao exportar CSV: ' + (e?.message || 'desconhecido'));
    } finally {
      setManualRunsExporting(false);
    }
  };

  const fetchAll = async () => {
    const blockPage = settings === null && defaults === null;
    if (blockPage) setIsLoading(true);
    setLoadError(null);
    try {
      const headers = authHeaders();
      const [sRes, hRes] = await Promise.all([
        fetchWithTimeout('/api/admin/system-settings/daily-reports', { headers }),
        fetchWithTimeout('/api/admin/system-settings/daily-reports/history', { headers }),
      ]);
      const sJson = await parseJsonResponse(sRes);
      const hJson = await parseJsonResponse(hRes);
      if (sJson?.ok) {
        setSettings(sJson.settings);
        setDefaults(sJson.defaults);
        setUpdatedBy(sJson.updatedBy);
        setUpdatedAt(sJson.updatedAt);
      } else {
        const msg = sJson?.error || (sRes.status === 403 ? 'Sem permissão para acessar esta tela.' : 'Erro ao carregar configurações.');
        setLoadError(msg);
        setSettings(null);
        setDefaults(null);
      }
      if (hJson?.ok) setHistory(hJson.history || []);
      // Execuções manuais/agendadas são informativas — não bloqueiam a tela principal.
      if (sJson?.ok) void fetchRuns();
    } catch (e: any) {
      const aborted = e?.name === 'AbortError';
      setLoadError(aborted ? 'Tempo esgotado ao carregar configurações. Verifique a conexão e tente novamente.' : (e?.message || 'Erro ao carregar configurações.'));
      setSettings(null);
      setDefaults(null);
    } finally {
      if (blockPage) setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Task #105 — Após carregar settings, scroll até o card focado e remove
  // o highlight em ~5s. Também limpa ?focus=...&key=... da URL para evitar
  // que F5 re-aplique o destaque indefinidamente.
  useEffect(() => {
    if (isLoading || !focusedKey || didScrollToFocus) return;
    const el = cardRefs.current[focusedKey];
    if (!el) return;
    setDidScrollToFocus(true);
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { /* no-op */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('focus');
      url.searchParams.delete('key');
      window.history.replaceState({}, '', url.toString());
    } catch { /* no-op */ }
    const t = setTimeout(() => setFocusedKey(null), 5000);
    return () => clearTimeout(t);
  }, [isLoading, focusedKey, didScrollToFocus]);

  useEffect(() => { fetchManualRuns(manualRunsFilterKey, manualRunsFilterMode, manualRunsFilterFrom, manualRunsFilterTo); }, [manualRunsFilterKey, manualRunsFilterMode, manualRunsFilterFrom, manualRunsFilterTo]);

  const updateField = (key: keyof DailyReports, field: keyof Schedule, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: { ...settings[key], [field]: value } });
  };

  const handleSave = async () => {
    if (!settings) return;
    for (const r of REPORTS) {
      const s = settings[r.key];
      const emails = s.emails.split(',').map(x => x.trim()).filter(Boolean);
      if (emails.length === 0) { alert(`Informe ao menos um e-mail para "${r.title}".`); return; }
      if (s.hour < 0 || s.hour > 23 || s.minute < 0 || s.minute > 59) {
        alert(`Horário inválido em "${r.title}".`); return;
      }
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/system-settings/daily-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'Falha ao salvar.');
      await fetchAll();
      alert('Configurações salvas com sucesso.');
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!defaults) return;
    if (!confirm('Restaurar todos os valores padrão? A mudança só é gravada ao clicar em "Salvar".')) return;
    setSettings(JSON.parse(JSON.stringify(defaults)));
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return formatDateTimeBR(iso); }
    catch { return iso; }
  };

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
        <Loader2 className="animate-spin text-gray-500" />
        <span className="text-gray-600">Carregando configurações...</span>
      </div>
    );
  }

  if (loadError || !settings || !defaults) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-red-200 space-y-4" data-testid="page-system-settings-error">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-gray-900">Não foi possível abrir Configurações do Sistema</h2>
            <p className="text-sm text-gray-600 mt-1">
              {loadError || 'Dados indisponíveis.'} Apenas perfis <strong>Diretoria</strong> e <strong>Administrador</strong> têm acesso completo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchAll}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-system-settings">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
              <Settings className="text-blue-600" /> Configurações do Sistema
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Parâmetros operacionais que antes exigiam deploy. Tudo é gravado em <code className="bg-gray-100 px-1 rounded">system_settings</code> e auditado em <code className="bg-gray-100 px-1 rounded">system_logs</code>.
            </p>
          </div>
          <button onClick={fetchAll} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1" data-testid="button-refresh">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-start gap-3">
            <FileBarChart className="text-blue-600 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-gray-800">Relatórios Diários por E-mail</h3>
              <p className="text-sm text-gray-500">Horários em fuso de Brasília. Use vírgula para múltiplos destinatários.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openHistoryModal}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
            data-testid="button-open-runs-history"
            title="Abrir histórico completo de disparos (manuais + agendados) com filtros e exportação CSV"
          >
            <History size={14} /> Histórico completo / CSV
          </button>
        </div>

        <div className="space-y-4">
          {REPORTS.map(r => {
            const s = settings[r.key];
            const d = defaults[r.key];
            const lastScheduledRun = lastScheduled[r.key] || null;
            const badgeBase = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer';
            const badgeStyle = !lastScheduledRun
              ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              : (lastScheduledRun.success
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200');
            const badgeLabel = !lastScheduledRun
              ? 'Nunca executado'
              : `${lastScheduledRun.success ? 'OK' : 'FALHOU'} em ${(() => {
                  try {
                    return formatDateTimeBR(lastScheduledRun.createdAt);
                  } catch { return lastScheduledRun.createdAt; }
                })()}`;
            const badgeTitle = !lastScheduledRun
              ? 'Nenhuma execução agendada registrada. Clique para abrir o histórico.'
              : `Última execução agendada: ${lastScheduledRun.success ? 'sucesso' : 'falha'} em ${fmtDate(lastScheduledRun.createdAt)}${lastScheduledRun.errorMessage ? ` — ${lastScheduledRun.errorMessage}` : ''}. Clique para abrir o histórico.`;
            const isFocused = focusedKey === r.key;
            return (
              <div
                key={r.key}
                ref={(el) => { cardRefs.current[r.key] = el; }}
                className={`border rounded-lg p-4 transition-all duration-500 ${isFocused ? 'border-red-400 bg-red-50 ring-4 ring-red-200 shadow-lg' : 'border-gray-200 bg-gray-50'}`}
                data-testid={`card-report-${r.key}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-gray-800">{r.title}</h4>
                      <button
                        type="button"
                        onClick={() => openHistoryModal(r.key)}
                        className={`${badgeBase} ${badgeStyle}`}
                        title={badgeTitle}
                        data-testid={`badge-last-scheduled-${r.key}`}
                      >
                        {!lastScheduled
                          ? <Clock size={10} />
                          : (lastScheduled.success ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />)}
                        {badgeLabel}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap flex-wrap justify-end">
                    <span className="text-[11px] text-gray-500">
                      Padrão: <strong>{fmtTime(d.hour, d.minute)}</strong>
                    </span>
                    {canRunReports && (
                      <>
                        <input
                          type="text"
                          value={overrideEmails[r.key] || ''}
                          onChange={(e) => setOverrideEmails(prev => ({ ...prev, [r.key]: e.target.value }))}
                          disabled={runningKey !== null}
                          placeholder="Enviar somente para (teste)"
                          title="Opcional: se preenchido, este disparo manual vai APENAS para esses e-mails e ignora a configuração salva. Não altera o banco."
                          className="border border-amber-300 bg-amber-50 placeholder-amber-700/60 text-amber-900 rounded-lg px-2 py-1 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          data-testid={`input-override-emails-${r.key}`}
                        />
                        {(() => {
                          const hasOverride = (overrideEmails[r.key] || '').trim().length > 0;
                          const isRetry = !hasOverride && lastRunFailed(r.key);
                          const colorCls = hasOverride
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : isRetry
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-emerald-600 hover:bg-emerald-700';
                          const title = hasOverride
                            ? 'Envio de TESTE: vai apenas para o e-mail digitado e NÃO usa a configuração salva'
                            : isRetry
                              ? 'A última execução falhou. Reexecuta imediatamente usando os destinatários SALVOS — se der sucesso, o cooldown de alerta de falha é zerado.'
                              : 'Dispara o envio agora usando os destinatários SALVOS no banco';
                          const label = runningKey === r.key
                            ? (isRetry ? 'Reexecutando...' : 'Enviando...')
                            : (hasOverride ? 'Enviar teste' : isRetry ? 'Reexecutar agora' : 'Enviar agora');
                          return (
                            <button
                              type="button"
                              onClick={() => handleRunNow(r.key)}
                              disabled={runningKey !== null}
                              className={`${colorCls} disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5`}
                              title={title}
                              data-testid={`button-run-now-${r.key}`}
                            >
                              {runningKey === r.key
                                ? <Loader2 size={12} className="animate-spin" />
                                : isRetry ? <AlertTriangle size={12} /> : <Send size={12} />}
                              {label}
                            </button>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
                {runResults[r.key] && (
                  <div
                    className={`mb-3 text-xs px-3 py-2 rounded-md flex items-start gap-2 ${runResults[r.key]!.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
                    data-testid={`text-run-result-${r.key}`}
                  >
                    {runResults[r.key]!.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                    <div className="flex-1">
                      <div>{runResults[r.key]!.message}</div>
                      <div className="opacity-70 mt-0.5">Em {runResults[r.key]!.at}</div>
                    </div>
                  </div>
                )}

                {(() => {
                  const list = runs[r.key] || [];
                  return (
                    <div className="mb-3 border border-gray-200 rounded-md bg-white" data-testid={`runs-${r.key}`}>
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-600 border-b border-gray-100 flex items-center gap-1.5">
                        <History size={12} /> Últimas execuções
                        {runsLoading && <Loader2 size={10} className="animate-spin opacity-60" />}
                        <span className="ml-auto opacity-60 font-normal">(manuais + agendadas)</span>
                      </div>
                      {list.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-gray-400">Nenhuma execução registrada ainda.</div>
                      ) : (
                        <ul className="divide-y divide-gray-100">
                          {list.map(run => (
                            <li key={run.id} className="px-3 py-1.5 text-[11px] flex items-center gap-2" data-testid={`run-${r.key}-${run.id}`}>
                              {run.success
                                ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                                : <AlertTriangle size={12} className="text-red-600 shrink-0" />}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${run.source === 'manual' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                                {run.source === 'manual' ? 'Manual' : 'Agendado'}
                              </span>
                              <span className="text-gray-500 inline-flex items-center gap-1 shrink-0">
                                <Calendar size={10} /> {fmtDate(run.createdAt)}
                              </span>
                              <span className="text-gray-700 inline-flex items-center gap-1 truncate">
                                <User size={10} /> {run.userName || '—'}
                              </span>
                              <span className="ml-auto text-gray-600 shrink-0">
                                {run.total != null ? `${run.total} reg.` : '—'}
                                {run.emailTo.length > 0 && (
                                  <span className="text-gray-400"> · {run.emailTo.length} destinatário(s)</span>
                                )}
                                {!run.success && run.errorMessage && (
                                  <span className="text-red-600" title={run.errorMessage}> · erro</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-8">
                    <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1 mb-1">
                      <Mail size={12} /> Destinatários
                    </label>
                    <input
                      type="text"
                      value={s.emails}
                      onChange={(e) => updateField(r.key, 'emails', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      placeholder="ex.: gestor@empresa.com, financeiro@empresa.com"
                      data-testid={`input-emails-${r.key}`}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1 mb-1">
                      <Clock size={12} /> Hora
                    </label>
                    <input
                      type="number" min={0} max={23}
                      value={s.hour}
                      onChange={(e) => updateField(r.key, 'hour', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      data-testid={`input-hour-${r.key}`}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1 mb-1">
                      <Clock size={12} /> Minuto
                    </label>
                    <input
                      type="number" min={0} max={59}
                      value={s.minute}
                      onChange={(e) => updateField(r.key, 'minute', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      data-testid={`input-minute-${r.key}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            data-testid="button-save"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar configurações
          </button>
          <button
            onClick={handleReset}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            data-testid="button-reset"
          >
            <RefreshCw size={16} /> Restaurar padrão
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Última alteração: <strong data-testid="text-updated-by">{updatedBy || '—'}</strong> em{' '}
            <strong data-testid="text-updated-at">{fmtDate(updatedAt)}</strong>
          </span>
        </div>
      </div>

      <AlertRecipientsSettings />

      <EmailHealthPanel />

      <WhatsAppConnectionPanel />

      <WhatsAppTelemetryDashboard />

      <AuditSummarySettings />

      <ManualOverrideAlertSettings />

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200" data-testid="card-manual-report-runs">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <ListChecks className="text-blue-600 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-gray-800">Disparos manuais recentes</h3>
              <p className="text-sm text-gray-500">Últimas 20 execuções de "Enviar agora" / "Enviar teste" registradas para auditoria.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={manualRunsFilterKey}
              onChange={(e) => setManualRunsFilterKey(e.target.value as '' | ReportKey)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
              data-testid="select-manual-runs-report"
            >
              <option value="">Todos os relatórios</option>
              {REPORTS.map(r => (
                <option key={r.key} value={r.key}>{r.title}</option>
              ))}
            </select>
            <select
              value={manualRunsFilterMode}
              onChange={(e) => setManualRunsFilterMode(e.target.value as '' | 'test' | 'official')}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
              data-testid="select-manual-runs-mode"
            >
              <option value="">Teste e oficial</option>
              <option value="test">Apenas teste</option>
              <option value="official">Apenas oficial</option>
            </select>
            <label className="text-xs text-gray-500 flex items-center gap-1">
              De:
              <input
                type="date"
                value={manualRunsFilterFrom}
                onChange={(e) => setManualRunsFilterFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
                data-testid="input-manual-runs-from"
              />
            </label>
            <label className="text-xs text-gray-500 flex items-center gap-1">
              Até:
              <input
                type="date"
                value={manualRunsFilterTo}
                onChange={(e) => setManualRunsFilterTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
                data-testid="input-manual-runs-to"
              />
            </label>
            {(() => {
              const toLocalISO = (d: Date) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
              };
              const today = new Date();
              const todayStr = toLocalISO(today);
              const sevenDaysAgo = new Date(today);
              sevenDaysAgo.setDate(today.getDate() - 6);
              const sevenStr = toLocalISO(sevenDaysAgo);
              const firstOfMonth = toLocalISO(new Date(today.getFullYear(), today.getMonth(), 1));
              const firstOfPrevMonth = toLocalISO(new Date(today.getFullYear(), today.getMonth() - 1, 1));
              const lastOfPrevMonth = toLocalISO(new Date(today.getFullYear(), today.getMonth(), 0));
              const shortcuts: Array<{ key: string; label: string; from: string; to: string }> = [
                { key: 'today', label: 'Hoje', from: todayStr, to: todayStr },
                { key: '7d', label: 'Últimos 7 dias', from: sevenStr, to: todayStr },
                { key: 'month', label: 'Mês atual', from: firstOfMonth, to: todayStr },
                { key: 'prev-month', label: 'Mês anterior', from: firstOfPrevMonth, to: lastOfPrevMonth },
              ];
              const applyShortcut = (from: string, to: string) => {
                const isActive = manualRunsFilterFrom === from && manualRunsFilterTo === to;
                if (isActive) {
                  setManualRunsFilterFrom('');
                  setManualRunsFilterTo('');
                } else {
                  setManualRunsFilterFrom(from);
                  setManualRunsFilterTo(to);
                }
              };
              return shortcuts.map(s => {
                const active = manualRunsFilterFrom === s.from && manualRunsFilterTo === s.to;
                return (
                  <button
                    key={s.key}
                    onClick={() => applyShortcut(s.from, s.to)}
                    className={`text-xs px-2 py-1 rounded-lg border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    data-testid={`button-manual-runs-shortcut-${s.key}`}
                    title={active ? 'Clique novamente para limpar' : s.label}
                  >
                    {s.label}
                  </button>
                );
              });
            })()}
            {(manualRunsFilterFrom || manualRunsFilterTo) && (
              <button
                onClick={() => { setManualRunsFilterFrom(''); setManualRunsFilterTo(''); }}
                className="text-xs text-gray-500 hover:text-gray-800"
                data-testid="button-clear-manual-runs-dates"
              >
                Limpar datas
              </button>
            )}
            <button
              onClick={() => fetchManualRuns(manualRunsFilterKey, manualRunsFilterMode, manualRunsFilterFrom, manualRunsFilterTo)}
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
              data-testid="button-refresh-manual-runs"
            >
              <RefreshCw size={14} /> Atualizar
            </button>
            <button
              onClick={exportManualRunsCsv}
              disabled={manualRunsExporting || manualRunsLoading}
              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-2.5 py-1 rounded-lg flex items-center gap-1"
              data-testid="button-export-manual-runs-csv"
              title="Baixa todos os disparos manuais (respeita os filtros aplicados)"
            >
              {manualRunsExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Exportar CSV
            </button>
          </div>
        </div>
        {manualRunsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
        ) : manualRuns.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum disparo manual registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-left">Relatório</th>
                  <th className="px-3 py-2 text-left">Modo</th>
                  <th className="px-3 py-2 text-left">Destinatários</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {manualRuns.map(r => {
                  const reportMeta = REPORTS.find(x => x.key === r.reportKey);
                  return (
                    <tr key={r.id} className="border-t border-gray-100 align-top" data-testid={`row-manual-run-${r.id}`}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 py-2">{r.userName || '—'}</td>
                      <td className="px-3 py-2">{reportMeta?.title || r.reportKey || '—'}</td>
                      <td className="px-3 py-2">
                        {r.testMode ? (
                          <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">Teste</span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px]">Oficial</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 break-all">{r.effectiveEmails || r.overrideEmails || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.total != null ? r.total : '—'}</td>
                      <td className="px-3 py-2">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Enviado</span>
                        ) : r.error ? (
                          <span className="inline-flex items-center gap-1 text-red-700" title={r.error}><AlertTriangle size={12} /> Erro</span>
                        ) : (
                          <span className="text-gray-500">Sem envio</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800 mb-3">
          <History className="text-gray-500" /> Histórico de alterações
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma alteração registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-left">Campos alterados</th>
                  <th className="px-3 py-2 text-left">Resumo</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-t border-gray-100 align-top" data-testid={`row-history-${h.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                    <td className="px-3 py-2">{h.userName || '—'}</td>
                    <td className="px-3 py-2">
                      {h.changedFields.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {h.changedFields.map(f => (
                            <span key={f} className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">{f}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{h.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {historyOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setHistoryOpen(false)}
          data-testid="modal-runs-history"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-6xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History className="text-blue-600" /> Histórico de disparos de relatórios
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-gray-500 hover:text-gray-800 p-1 rounded"
                data-testid="button-close-runs-history"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Relatório</label>
                  <select
                    value={historyFilters.reportKey}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, reportKey: e.target.value as '' | ReportKey }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="select-history-report"
                  >
                    <option value="">Todos os relatórios</option>
                    {REPORTS.map(r => (
                      <option key={r.key} value={r.key}>{r.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">De</label>
                  <input
                    type="date"
                    value={historyFilters.from}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, from: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="input-history-from"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Até</label>
                  <input
                    type="date"
                    value={historyFilters.to}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, to: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="input-history-to"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Usuário</label>
                  <input
                    type="text"
                    value={historyFilters.user}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, user: e.target.value }))}
                    placeholder="Nome ou e-mail"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="input-history-user"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Fonte</label>
                  <select
                    value={historyFilters.source}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, source: e.target.value as '' | 'manual' | 'scheduled' }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="select-history-source"
                  >
                    <option value="">Todas</option>
                    <option value="manual">Manual</option>
                    <option value="scheduled">Agendado</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Status</label>
                  <select
                    value={historyFilters.status}
                    onChange={(e) => setHistoryFilters(f => ({ ...f, status: e.target.value as '' | 'success' | 'error' }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    data-testid="select-history-status"
                  >
                    <option value="">Todos</option>
                    <option value="success">Sucesso</option>
                    <option value="error">Erro</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  onClick={applyHistoryFilters}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  data-testid="button-apply-history-filters"
                >
                  <Filter size={12} /> Aplicar filtros
                </button>
                <button
                  onClick={clearHistoryFilters}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  data-testid="button-clear-history-filters"
                >
                  <RefreshCw size={12} /> Limpar
                </button>
                <button
                  onClick={handleExportHistoryCsv}
                  disabled={historyExporting}
                  className="ml-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  data-testid="button-export-history-csv"
                  title="Exporta até 5.000 registros aplicando os filtros atuais"
                >
                  {historyExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="px-5 py-3 max-h-[60vh] overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
              ) : historyRows.length === 0 ? (
                <p className="text-sm text-gray-500" data-testid="text-history-empty">Nenhum disparo encontrado para os filtros aplicados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Usuário</th>
                        <th className="px-3 py-2 text-left">Relatório</th>
                        <th className="px-3 py-2 text-left">Fonte</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-left">Destinatários</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map(r => (
                        <tr key={r.id} className="border-t border-gray-100 align-top" data-testid={`row-history-run-${r.id}`}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1"><Calendar size={10} /> {fmtDate(r.createdAt)}</span>
                          </td>
                          <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><User size={10} /> {r.userName || '—'}</span></td>
                          <td className="px-3 py-2">{r.reportTitle || r.reportKey || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.source === 'manual' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                              {r.source === 'manual' ? 'Manual' : 'Agendado'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.total != null ? r.total : '—'}</td>
                          <td className="px-3 py-2 text-gray-700 break-all">
                            {r.emailTo.length === 0 ? '—' : (
                              <span title={r.emailTo.join(', ')}>{r.emailTo.length} dest. {r.emailTo.length <= 2 ? `(${r.emailTo.join(', ')})` : ''}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.success ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Enviado</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-700" title={r.errorMessage || ''}><AlertTriangle size={12} /> {r.errorMessage ? 'Erro' : 'Sem envio'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-600">
              <span data-testid="text-history-summary">
                {historyTotal === 0
                  ? 'Sem registros'
                  : `Mostrando ${historyPage * HISTORY_PAGE_SIZE + 1}–${Math.min(historyTotal, historyPage * HISTORY_PAGE_SIZE + historyRows.length)} de ${historyTotal}`}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => changeHistoryPage(-1)}
                  disabled={historyPage === 0 || historyLoading}
                  className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 px-2 py-1 rounded flex items-center gap-1"
                  data-testid="button-history-prev"
                >
                  <ChevronLeft size={12} /> Anterior
                </button>
                <button
                  onClick={() => changeHistoryPage(1)}
                  disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal || historyLoading}
                  className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 px-2 py-1 rounded flex items-center gap-1"
                  data-testid="button-history-next"
                >
                  Próxima <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettingsPage;
