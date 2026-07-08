import React, { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, Loader2, CheckCircle2, XCircle, Send } from 'lucide-react';

type Health = {
  ok: boolean;
  smtp: {
    host: string;
    user: string;
    passwordConfigured: boolean;
    verifyOk: boolean;
    verifyError: string | null;
  };
  channels: Array<{ id: string; name: string; configured: boolean; notes?: string }>;
  testSend?: { attempted: boolean; success: boolean; to?: string; error?: string };
  checkedAt: string;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const EmailHealthPanel: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('thiago@grupotmseg.com.br');
  const [sending, setSending] = useState(false);

  const load = useCallback(async (sendTestTo?: string) => {
    setLoading(true);
    try {
      const q = sendTestTo ? `?sendTestTo=${encodeURIComponent(sendTestTo)}` : '';
      const r = await fetch(`/api/email/health${q}`, { headers: authHeaders() });
      setHealth(await r.json());
    } finally {
      setLoading(false);
      setSending(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200" data-testid="panel-email-health">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Mail className="text-red-700" size={20} />
          <div>
            <h3 className="text-lg font-bold text-gray-800">Saúde dos E-mails</h3>
            <p className="text-sm text-gray-500">SMTP Office 365 e canais automáticos do sistema</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs text-gray-500 flex items-center gap-1">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {loading && !health ? (
        <p className="text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Verificando…</p>
      ) : health && (
        <div className="space-y-4">
          <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${health.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {health.ok ? <CheckCircle2 size={18} className="shrink-0" /> : <XCircle size={18} className="shrink-0" />}
            <div>
              <p className="font-bold">{health.ok ? 'SMTP operacional' : 'Problema no envio de e-mails'}</p>
              <p className="text-xs mt-1 opacity-80">
                {health.smtp.user} @ {health.smtp.host}
                {health.smtp.verifyError ? ` — ${health.smtp.verifyError}` : ''}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto text-xs">
            {health.channels.map((c) => (
              <div key={c.id} className={`px-2 py-1.5 rounded border ${c.configured ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'}`}>
                {c.configured ? '✓' : '✗'} {c.name}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-black uppercase text-gray-500">Enviar teste real</label>
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm" />
            </div>
            <button
              type="button"
              disabled={sending || !testTo.trim()}
              onClick={() => { setSending(true); void load(testTo.trim()); }}
              className="text-xs font-bold px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Testar envio
            </button>
          </div>

          {health.testSend?.attempted && (
            <p className={`text-xs ${health.testSend.success ? 'text-green-700' : 'text-red-700'}`}>
              {health.testSend.success
                ? `E-mail de teste enviado para ${health.testSend.to}`
                : `Falha no teste: ${health.testSend.error || 'erro desconhecido'}`}
            </p>
          )}

          <p className="text-[10px] text-gray-400">Última verificação: {new Date(health.checkedAt).toLocaleString('pt-BR')}</p>
        </div>
      )}
    </div>
  );
};

export default EmailHealthPanel;
