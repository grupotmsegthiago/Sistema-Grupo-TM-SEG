import React, { useEffect, useState } from 'react';
import { Settings, Mail, Clock, Save, Loader2, RefreshCw, History, FileBarChart } from 'lucide-react';
import ManualOverrideAlertSettings from './ManualOverrideAlertSettings';
import AlertRecipientsSettings from './AlertRecipientsSettings';

type Schedule = { emails: string; hour: number; minute: number };
type DailyReports = {
  legal: Schedule;
  pending: Schedule;
  approval: Schedule;
  missingInfo: Schedule;
  stuckNf: Schedule;
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

const REPORTS: { key: keyof DailyReports; title: string; description: string }[] = [
  { key: 'legal',       title: 'Jurídico Diário',           description: 'Consulta diária no DataJud e envio do relatório de processos monitorados.' },
  { key: 'pending',     title: 'Pendências (OS Concluídas)', description: 'OS concluídas com campos faltando (KM, horário, agente, etc.).' },
  { key: 'approval',    title: 'Aprovações Pendentes',       description: 'OS concluídas aguardando aprovação financeira.' },
  { key: 'missingInfo', title: 'Dados Faltantes (Geral)',    description: 'Todas as OS (exceto canceladas/recusadas) com dados faltantes.' },
  { key: 'stuckNf',     title: 'NF Travadas',                description: 'NFs presas no PlugNotas há mais tempo que o limite.' },
];

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const SystemSettingsPage: React.FC<{ onNavigate?: (id: string) => void }> = () => {
  const [settings, setSettings] = useState<DailyReports | null>(null);
  const [defaults, setDefaults] = useState<DailyReports | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/admin/system-settings/daily-reports', { headers: authHeaders() }),
        fetch('/api/admin/system-settings/daily-reports/history', { headers: authHeaders() }),
      ]);
      const sJson = await sRes.json();
      const hJson = await hRes.json();
      if (sJson?.ok) {
        setSettings(sJson.settings);
        setDefaults(sJson.defaults);
        setUpdatedBy(sJson.updatedBy);
        setUpdatedAt(sJson.updatedAt);
      } else {
        alert('Erro ao carregar: ' + (sJson?.error || 'desconhecido'));
      }
      if (hJson?.ok) setHistory(hJson.history || []);
    } catch (e: any) {
      alert('Erro ao carregar configurações: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

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
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
    catch { return iso; }
  };

  if (isLoading || !settings || !defaults) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
        <Loader2 className="animate-spin text-gray-500" />
        <span className="text-gray-600">Carregando configurações...</span>
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
        <div className="flex items-start gap-3 mb-4">
          <FileBarChart className="text-blue-600 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-gray-800">Relatórios Diários por E-mail</h3>
            <p className="text-sm text-gray-500">Horários em fuso de Brasília. Use vírgula para múltiplos destinatários.</p>
          </div>
        </div>

        <div className="space-y-4">
          {REPORTS.map(r => {
            const s = settings[r.key];
            const d = defaults[r.key];
            return (
              <div key={r.key} className="border border-gray-200 rounded-lg p-4 bg-gray-50" data-testid={`card-report-${r.key}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-800">{r.title}</h4>
                    <p className="text-xs text-gray-500">{r.description}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">
                    Padrão: <strong>{fmtTime(d.hour, d.minute)}</strong>
                  </span>
                </div>

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

      <ManualOverrideAlertSettings />

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
    </div>
  );
};

export default SystemSettingsPage;
