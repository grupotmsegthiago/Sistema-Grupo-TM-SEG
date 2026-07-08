import React, { useEffect, useState } from 'react';
import { FileText, Save, Loader2, RefreshCw, History, Sparkles } from 'lucide-react';
import { formatDateTimeBR } from '../lib/dateUtils';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import {
  AUDIT_SUMMARY_DEFAULTS,
  type AuditSummarySettings,
} from '../lib/auditSummarySettingsShared';

type HistoryEntry = {
  id: string;
  createdAt: string;
  userName: string;
  before: AuditSummarySettings | null;
  after: AuditSummarySettings | null;
  changedFields: string[];
  summary: string;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AuditSummarySettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<AuditSummarySettings | null>(null);
  const [defaults, setDefaults] = useState<AuditSummarySettings | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/admin/system-settings/audit-summary', { headers: authHeaders() }),
        fetch('/api/admin/system-settings/audit-summary/history', { headers: authHeaders() }),
      ]);
      const sJson = await parseJsonResponse(sRes);
      const hJson = await parseJsonResponse(hRes);
      if (sJson?.ok) {
        setSettings(sJson.settings);
        setDefaults(sJson.defaults || AUDIT_SUMMARY_DEFAULTS);
        setUpdatedBy(sJson.updatedBy);
        setUpdatedAt(sJson.updatedAt);
      }
      if (hJson?.ok) setHistory(hJson.history || []);
    } catch (e: any) {
      alert('Erro ao carregar configurações do resumo: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/system-settings/audit-summary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'Falha ao salvar');
      setSettings(json.settings);
      await fetchAll();
      alert('Configuração do resumo salva no banco. Não se perde em deploys.');
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!defaults) return;
    if (!confirm('Restaurar prompt e parâmetros padrão? Clique em Salvar para gravar.')) return;
    setSettings(JSON.parse(JSON.stringify(defaults)));
  };

  if (isLoading || !settings) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
        <Loader2 className="animate-spin text-emerald-600" />
        <span className="text-gray-600">Carregando configuração do resumo...</span>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200" data-testid="section-audit-summary-settings">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <FileText className="text-emerald-600 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-gray-800">Configuração do Resumo da Auditoria</h3>
            <p className="text-sm text-gray-500 mt-1">
              Prompt da IA e parâmetros usados no botão <strong>Resumo</strong> do modal de auditoria. Gravado em{' '}
              <code className="bg-gray-100 px-1 rounded">system_settings</code> — não some ao publicar o sistema.
            </p>
            {(updatedBy || updatedAt) && (
              <p className="text-[11px] text-gray-400 mt-1">
                Última alteração: {updatedBy || '—'} {updatedAt ? `· ${formatDateTimeBR(updatedAt)}` : ''}
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={fetchAll} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
            <Sparkles size={14} className="text-indigo-500" /> Prompt da IA (diretoria)
          </label>
          <textarea
            className="w-full min-h-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
            value={settings.aiPromptPrefix}
            onChange={e => setSettings({ ...settings, aiPromptPrefix: e.target.value })}
            data-testid="input-audit-summary-prompt"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            O JSON com dados da OS é anexado automaticamente após este texto. Use instruções claras em português.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Temperatura (0–1)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={1}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={settings.temperature}
              onChange={e => setSettings({ ...settings, temperature: Number(e.target.value) })}
              data-testid="input-audit-summary-temperature"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Máx. tokens de saída</label>
            <input
              type="number"
              min={100}
              max={2000}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={settings.maxOutputTokens}
              onChange={e => setSettings({ ...settings, maxOutputTokens: Number(e.target.value) })}
              data-testid="input-audit-summary-max-tokens"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            data-testid="button-save-audit-summary-settings"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar configuração
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold"
          >
            Restaurar padrão
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-gray-500" />
            <p className="text-xs font-bold text-gray-700 uppercase">Histórico de alterações</p>
          </div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {history.slice(0, 8).map(h => (
              <div key={h.id} className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <p className="font-bold text-gray-800">{h.summary}</p>
                <p className="text-gray-500">{h.userName} · {formatDateTimeBR(h.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditSummarySettingsPanel;
