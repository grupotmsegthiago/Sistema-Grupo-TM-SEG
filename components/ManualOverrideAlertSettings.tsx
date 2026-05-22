import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save, Loader2, RefreshCw, History, Mail, Clock, Hash, Calendar, PlayCircle } from 'lucide-react';

type Settings = {
  emails: string;
  windowDays: number;
  threshold: number;
  cooldownHours: number;
};

type HistoryEntry = {
  id: string;
  createdAt: string;
  userName: string;
  before: Settings | null;
  after: Settings | null;
  changedFields: string[];
  summary: string;
};

const FIELD_LABELS: Record<keyof Settings, string> = {
  emails: 'Destinatários (e-mails)',
  windowDays: 'Janela (dias)',
  threshold: 'Limite (edições)',
  cooldownHours: 'Cooldown (horas)',
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ManualOverrideAlertSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/admin/manual-override-settings', { headers: authHeaders() }),
        fetch('/api/admin/manual-override-settings/history', { headers: authHeaders() }),
      ]);
      const sJson = await sRes.json();
      const hJson = await hRes.json();
      if (sJson?.ok) {
        setSettings(sJson.settings);
        setDefaults(sJson.defaults);
        setUpdatedBy(sJson.updatedBy);
        setUpdatedAt(sJson.updatedAt);
      }
      if (hJson?.ok) setHistory(hJson.history || []);
    } catch (e: any) {
      alert('Erro ao carregar configurações: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSave = async () => {
    if (!settings) return;
    if (settings.threshold < 1 || settings.windowDays < 1 || settings.cooldownHours < 1) {
      alert('Os valores numéricos devem ser maiores ou iguais a 1.');
      return;
    }
    const emailsValid = settings.emails.split(',').map(s => s.trim()).filter(Boolean);
    if (emailsValid.length === 0) {
      alert('Informe pelo menos um e-mail destinatário.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/manual-override-settings', {
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

  const handleResetDefaults = () => {
    if (!defaults) return;
    if (!confirm('Restaurar os valores padrão? A mudança só é gravada ao clicar em "Salvar".')) return;
    setSettings({ ...defaults });
  };

  const handleRunNow = async () => {
    if (!confirm('Executar a varredura agora? Pode enviar e-mails imediatamente caso haja excessos.')) return;
    setIsRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/run-manual-override-alert', {
        method: 'POST', headers: authHeaders(),
      });
      const json = await res.json();
      setRunResult(JSON.stringify(json, null, 2));
    } catch (e: any) {
      setRunResult('Erro: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsRunning(false);
    }
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
    <div className="space-y-6" data-testid="page-manual-override-settings">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
              <AlertTriangle className="text-amber-500" /> Alertas de Edições Manuais
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure quando o sistema deve avisar a gestão financeira sobre operadores ou fornecedores com muitas edições divergentes do motor automático de fornecedor.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
            data-testid="button-refresh-settings"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div>
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Hash size={14} /> Limite (edições para disparar)
            </label>
            <input
              type="number" min={1} max={10000}
              value={settings.threshold}
              onChange={(e) => setSettings({ ...settings, threshold: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              data-testid="input-threshold"
            />
            <p className="text-[11px] text-gray-500 mt-1">Padrão: {defaults.threshold}. Quanto menor, mais sensível.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Calendar size={14} /> Janela de análise (dias)
            </label>
            <input
              type="number" min={1} max={365}
              value={settings.windowDays}
              onChange={(e) => setSettings({ ...settings, windowDays: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              data-testid="input-window-days"
            />
            <p className="text-[11px] text-gray-500 mt-1">Padrão: {defaults.windowDays}. Edições contadas nos últimos N dias.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Clock size={14} /> Cooldown entre alertas (horas)
            </label>
            <input
              type="number" min={1} max={720}
              value={settings.cooldownHours}
              onChange={(e) => setSettings({ ...settings, cooldownHours: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              data-testid="input-cooldown-hours"
            />
            <p className="text-[11px] text-gray-500 mt-1">Padrão: {defaults.cooldownHours}. Tempo mínimo entre alertas do mesmo usuário/fornecedor.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Mail size={14} /> Destinatários (e-mails separados por vírgula)
            </label>
            <input
              type="text"
              value={settings.emails}
              onChange={(e) => setSettings({ ...settings, emails: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="ex.: gestor@empresa.com, financeiro@empresa.com"
              data-testid="input-emails"
            />
            <p className="text-[11px] text-gray-500 mt-1">Padrão: {defaults.emails}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            data-testid="button-save-settings"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar configurações
          </button>
          <button
            onClick={handleResetDefaults}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            data-testid="button-reset-defaults"
          >
            <RefreshCw size={16} /> Restaurar padrão
          </button>
          <button
            onClick={handleRunNow}
            disabled={isRunning}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            data-testid="button-run-now"
          >
            {isRunning ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
            Rodar verificação agora
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Última alteração: <strong data-testid="text-updated-by">{updatedBy || '—'}</strong> em{' '}
            <strong data-testid="text-updated-at">{fmtDate(updatedAt)}</strong>
          </span>
        </div>

        {runResult && (
          <pre className="mt-4 bg-gray-900 text-green-300 text-[11px] p-3 rounded-lg overflow-auto max-h-48" data-testid="text-run-result">
            {runResult}
          </pre>
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
                  <th className="px-3 py-2 text-left">Antes → Depois</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100 align-top" data-testid={`row-history-${h.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                    <td className="px-3 py-2">{h.userName || '—'}</td>
                    <td className="px-3 py-2">
                      {h.changedFields.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {h.changedFields.map(f => (
                            <span key={f} className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">
                              {FIELD_LABELS[f as keyof Settings] || f}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {h.changedFields.length === 0 || !h.before || !h.after ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {h.changedFields.map(f => (
                            <li key={f} className="text-[11px]">
                              <strong>{FIELD_LABELS[f as keyof Settings] || f}:</strong>{' '}
                              <span className="text-red-600 line-through">{String((h.before as any)[f])}</span>{' '}→{' '}
                              <span className="text-green-700">{String((h.after as any)[f])}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
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

export default ManualOverrideAlertSettings;
