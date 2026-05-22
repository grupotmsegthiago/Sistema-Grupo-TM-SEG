import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save, Loader2, RefreshCw, History, Mail } from 'lucide-react';

type Settings = {
  lossAlert: string;
  cancelMissingInfo: string;
  operationalFallback: string;
  externalReportAlert: string;
  trustedEmailDomains: string;
  reportFailure: string;
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

const FIELDS: { key: keyof Settings; title: string; description: string; placeholder: string }[] = [
  {
    key: 'lossAlert',
    title: 'Alerta de OS com prejuízo',
    description: 'Destinatários do e-mail disparado quando uma OS é salva com resultado operacional negativo.',
    placeholder: 'ex.: barbara@grupotmseg.com.br, thiago@grupotmseg.com.br',
  },
  {
    key: 'cancelMissingInfo',
    title: 'OS cancelada com dados faltantes',
    description: 'Destinatários do e-mail enviado quando uma OS concluída é cancelada sem dados cruciais (KM, horário, agente, fornecedor).',
    placeholder: 'ex.: barbara@grupotmseg.com.br, michelle@grupotmseg.com.br',
  },
  {
    key: 'operationalFallback',
    title: 'Fallback operacional (cliente/fornecedor sem e-mail)',
    description: 'E-mail usado como destinatário quando o cliente ou fornecedor da OS não possui e-mail cadastrado. Normalmente um único endereço.',
    placeholder: 'ex.: operacional@grupotmseg.com.br',
  },
  {
    key: 'externalReportAlert',
    title: 'Alerta de relatório enviado para fora da empresa',
    description: 'Destinatários (diretoria) que recebem aviso quando alguém usa "Enviar somente para" em um relatório manual com e-mail fora dos domínios confiáveis.',
    placeholder: 'ex.: barbara@grupotmseg.com.br, thiago@grupotmseg.com.br',
  },
  {
    key: 'trustedEmailDomains',
    title: 'Domínios confiáveis',
    description: 'Lista de domínios considerados internos/seguros. Qualquer e-mail de teste fora desta lista dispara o alerta acima. Separe por vírgula, sem @.',
    placeholder: 'ex.: grupotmseg.com.br, tmsecurity.com.br',
  },
  {
    key: 'reportFailure',
    title: 'Falha em relatório diário agendado',
    description: 'Destinatários do alerta enviado quando uma execução agendada de um dos 5 relatórios diários falha (SMTP fora, DataJud/PlugNotas indisponível). Um alerta no máximo a cada 24h por relatório.',
    placeholder: 'ex.: thiago@grupotmseg.com.br, daniel@grupotmseg.com.br',
  },
];

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AlertRecipientsSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/admin/system-settings/alert-recipients', { headers: authHeaders() }),
        fetch('/api/admin/system-settings/alert-recipients/history', { headers: authHeaders() }),
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

  const updateField = (key: keyof Settings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    if (!settings) return;
    for (const f of FIELDS) {
      const emails = (settings[f.key] || '').split(',').map(x => x.trim()).filter(Boolean);
      if (emails.length === 0) { alert(`Informe ao menos um e-mail para "${f.title}".`); return; }
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/system-settings/alert-recipients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'Falha ao salvar.');
      await fetchAll();
      alert('Destinatários de alertas salvos com sucesso.');
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!defaults) return;
    if (!confirm('Restaurar destinatários padrão? A mudança só é gravada ao clicar em "Salvar".')) return;
    setSettings(JSON.parse(JSON.stringify(defaults)));
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
    catch { return iso; }
  };

  if (isLoading || !settings || !defaults) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3" data-testid="card-alert-recipients-loading">
        <Loader2 className="animate-spin text-gray-500" />
        <span className="text-gray-600">Carregando alertas pontuais...</span>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200" data-testid="section-alert-recipients">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="text-amber-600 mt-1" />
        <div>
          <h3 className="text-lg font-bold text-gray-800">Alertas pontuais</h3>
          <p className="text-sm text-gray-500">
            Destinatários de e-mails disparados em eventos isolados (prejuízo, cancelamento sem dados, fallback operacional). Use vírgula para múltiplos destinatários.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {FIELDS.map(f => (
          <div key={f.key} className="border border-gray-200 rounded-lg p-4 bg-gray-50" data-testid={`card-alert-${f.key}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="font-semibold text-gray-800">{f.title}</h4>
                <p className="text-xs text-gray-500">{f.description}</p>
              </div>
              <span className="text-[11px] text-gray-500 whitespace-nowrap max-w-xs truncate" title={defaults[f.key]}>
                Padrão: <strong>{defaults[f.key]}</strong>
              </span>
            </div>
            <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Mail size={12} /> Destinatários
            </label>
            <input
              type="text"
              value={settings[f.key]}
              onChange={(e) => updateField(f.key, e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              placeholder={f.placeholder}
              data-testid={`input-alert-${f.key}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          data-testid="button-save-alert-recipients"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar destinatários
        </button>
        <button
          onClick={handleReset}
          className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          data-testid="button-reset-alert-recipients"
        >
          <RefreshCw size={16} /> Restaurar padrão
        </button>
        <span className="text-xs text-gray-500 ml-auto">
          Última alteração: <strong data-testid="text-alert-updated-by">{updatedBy || '—'}</strong> em{' '}
          <strong data-testid="text-alert-updated-at">{fmtDate(updatedAt)}</strong>
        </span>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-bold flex items-center gap-2 text-gray-800 mb-2">
          <History size={14} className="text-gray-500" /> Histórico de alterações
        </h4>
        {history.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma alteração registrada ainda.</p>
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
                  <tr key={h.id} className="border-t border-gray-100 align-top" data-testid={`row-alert-history-${h.id}`}>
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

export default AlertRecipientsSettings;
