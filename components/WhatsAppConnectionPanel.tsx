import React, { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, Phone, QrCode, RefreshCw, Save, Smartphone, Wifi, WifiOff, XCircle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { safeWhatsappInstanceLabel } from '../lib/whatsappDisplayUtils';

type InstancePublic = {
  id: string;
  slug: string;
  label: string;
  provider: 'zapi' | 'meta' | 'mock';
  instance_type: 'web' | 'mobile' | null;
  zapi_instance_id: string | null;
  zapi_client_token: string | null;
  meta_phone_number_id: string | null;
  meta_api_version: string | null;
  official_ddi: string;
  official_phone: string;
  is_default: boolean;
  enabled: boolean;
  has_zapi_token: boolean;
  has_meta_token: boolean;
  zapi_token_masked?: string;
  last_checked_at: string | null;
  last_connected: boolean | null;
  last_connected_phone: string | null;
  phone_matches_official: boolean | null;
  last_error: string | null;
};

type ConnStatus = {
  instanceId?: string;
  slug?: string;
  label?: string;
  provider?: string;
  configured?: boolean;
  instanceType?: string;
  officialPhone?: string;
  connectedPhone?: string | null;
  phoneMatchesOfficial?: boolean;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  lastConnected?: boolean | null;
  status?: { connected: boolean; error?: string };
};

type TestResult = {
  ok: boolean;
  message: string;
  connected: boolean;
  connectedPhone: string | null;
  expectedPhone: string;
  phoneMatchesOfficial: boolean;
  checkedAt: string;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

const fmtPhone = (p: string) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  return p;
};

const statusDot = (row: InstancePublic) => {
  if (row.last_connected && row.phone_matches_official) return '🟢';
  if (row.last_connected === false || row.last_error) return '🔴';
  return '🟡';
};

const WhatsAppConnectionPanel: React.FC = () => {
  const [instances, setInstances] = useState<InstancePublic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<ConnStatus | null>(null);
  const [form, setForm] = useState<Partial<InstancePublic & { zapi_token?: string; meta_access_token?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [phoneLinkCode, setPhoneLinkCode] = useState<string | null>(null);
  const [extensionToken, setExtensionToken] = useState<string | null>(null);
  const [extensionExpiresAt, setExtensionExpiresAt] = useState<number | null>(null);
  const [smsCode, setSmsCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const selected = instances.find(i => i.id === selectedId) || instances[0] || null;
  const instanceQuery = selected ? `?instanceId=${encodeURIComponent(selected.id)}` : '';

  const loadInstances = useCallback(async () => {
    const r = await authFetch('/api/whatsapp/instances');
    const data = await r.json();
    if (!r.ok) {
      const msg = typeof data?.error === 'string' ? data.error : 'Falha ao carregar instâncias WhatsApp';
      setMessage(msg);
      setInstances([]);
      return [];
    }
    const list: InstancePublic[] = Array.isArray(data) ? data : [];
    setInstances(list);
    if (!selectedId && list.length > 0) {
      const def = list.find(i => i.is_default) || list[0];
      setSelectedId(def.id);
    }
    return list;
  }, [selectedId]);

  const refreshStatus = useCallback(async (id?: string) => {
    const q = id ? `?instanceId=${encodeURIComponent(id)}` : instanceQuery;
    const r = await authFetch(`/api/whatsapp/connection/status${q}`);
    setInfo(await r.json());
  }, [instanceQuery]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadInstances();
      const id = selectedId || list.find(i => i.is_default)?.id || list[0]?.id;
      if (id) await refreshStatus(id);
    } finally {
      setLoading(false);
    }
  }, [loadInstances, refreshStatus, selectedId]);

  useEffect(() => { void refreshAll(); }, []);

  useEffect(() => {
    if (!selected) return;
    setForm({
      ...selected,
      zapi_token: '',
      meta_access_token: '',
    });
    void refreshStatus(selected.id);
    setTestResult(null);
    setQrBase64(null);
    setPhoneLinkCode(null);
    setExtensionToken(null);
    setExtensionExpiresAt(null);
    setMessage(null);
  }, [selected?.id]);

  const saveInstance = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        slug: form.slug,
        label: safeWhatsappInstanceLabel(form.label),
        provider: form.provider,
        instance_type: form.instance_type,
        zapi_instance_id: form.zapi_instance_id,
        zapi_client_token: form.zapi_client_token,
        meta_phone_number_id: form.meta_phone_number_id,
        meta_api_version: form.meta_api_version,
        official_ddi: form.official_ddi,
        official_phone: form.official_phone,
        is_default: form.is_default,
        enabled: form.enabled,
      };
      if (form.zapi_token) body.zapi_token = form.zapi_token;
      if (form.meta_access_token) body.meta_access_token = form.meta_access_token;
      const r = await authFetch(`/api/whatsapp/instances/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha ao salvar');
      setMessage('Credenciais salvas no banco.');
      await refreshAll();
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    setTestResult(null);
    try {
      const r = await authFetch(`/api/whatsapp/instances/${selected.id}/test-connection`, {
        method: 'POST',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || data.message || 'Falha no teste');
      setTestResult(data as TestResult);
      setMessage(data.message);
      await loadInstances();
      await refreshStatus(selected.id);
    } catch (e: any) {
      setMessage(e?.message || 'Erro no teste');
    } finally {
      setBusy(false);
    }
  };

  const runApiReconnect = async (force = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await authFetch('/api/whatsapp/connection/reconnect', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const data = await r.json();
      const code = data.details?.phoneLinkCode || data.phoneLinkCode || null;
      if (code) {
        setPhoneLinkCode(String(code));
        setCodeCopied(false);
      }
      setMessage(data.message || JSON.stringify(data));
      await refreshStatus(selected?.id);
      await loadInstances();
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao reconectar');
    } finally {
      setBusy(false);
    }
  };

  const generatePhoneLinkCode = async () => {
    setBusy(true);
    setMessage(null);
    setCodeCopied(false);
    try {
      const r = await authFetch(`/api/whatsapp/connection/qr-code${instanceQuery}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha ao gerar código');
      const code = data.phoneLinkCode || null;
      setQrBase64(data.qrBase64 || null);
      setPhoneLinkCode(code);
      if (code) {
        setMessage('Código gerado! No eSIM: Aparelhos conectados → Vincular com número de telefone → cole o código.');
      } else {
        setMessage(data.phoneLinkError || data.error || 'Z-API não retornou código de vinculação.');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao gerar código');
    } finally {
      setBusy(false);
    }
  };

  const copyPhoneCode = async () => {
    if (!phoneLinkCode) return;
    const text = [
      '🚨 URGENTE — Código Bot WhatsApp TM SEG',
      '',
      `Código: ${phoneLinkCode}`,
      '',
      'No WhatsApp Business do eSIM (11) 92683-9456:',
      'Aparelhos conectados → Conectar → Vincular com número de telefone',
      '',
      'Cole o código acima. Expira em poucos minutos.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCodeCopied(true);
      setMessage('Código copiado! Cole no WhatsApp do Thiago / use no eSIM agora.');
    } catch {
      setMessage('Não foi possível copiar — selecione o código manualmente.');
    }
  };

  const runBootstrap = async () => {
    setBusy(true);
    setMessage(null);
    setQrBase64(null);
    try {
      const r = await authFetch(`/api/whatsapp/connection/bootstrap${instanceQuery}`, { method: 'POST' });
      const data = await r.json();
      setMessage(data.message || JSON.stringify(data));
      if (data.qrBase64) setQrBase64(data.qrBase64);
      if (data.phoneLinkCode) setPhoneLinkCode(data.phoneLinkCode);
      await refreshStatus(selected?.id);
      await loadInstances();
    } catch (e: any) {
      setMessage(e?.message || 'Erro');
    } finally {
      setBusy(false);
    }
  };

  const refreshQr = async () => {
    setBusy(true);
    try {
      const r = await authFetch(`/api/whatsapp/connection/qr-code${instanceQuery}`);
      const data = await r.json();
      setQrBase64(data.qrBase64 || null);
      setPhoneLinkCode(data.phoneLinkCode || null);
      setMessage(data.error || data.phoneLinkError || (data.qrBase64 ? 'QR Code atualizado.' : 'QR indisponível'));
    } finally {
      setBusy(false);
    }
  };

  const requestSms = async (method: 'sms' | 'wa_old' | 'voice') => {
    setBusy(true);
    setMessage(null);
    setCodeCopied(false);
    try {
      const r = await authFetch(`/api/whatsapp/connection/request-code${instanceQuery}`, {
        method: 'POST',
        body: JSON.stringify({ method }),
      });
      const data = await r.json();
      const req = data.requestCode || {};
      const phoneLabel = data.phoneDisplay || '+55 (11) 92683-9456';
      const fallbackCode = data.phoneLinkCode || req.phoneLinkCode || null;
      if (fallbackCode) {
        setPhoneLinkCode(fallbackCode);
      }
      const raw = req.data ? ` | Z-API: ${JSON.stringify(req.data)}` : '';
      if (req.ok && req.data?.success === true) {
        setMessage(
          method === 'wa_old'
            ? `✅ Pop-up aceito pela Z-API para ${phoneLabel}. Deixe o WhatsApp Business aberto no eSIM e confirme o aviso na tela.${raw}`
            : method === 'voice'
              ? `✅ Ligação solicitada para ${phoneLabel}. Atenda a chamada no eSIM e anote o código.${raw}`
              : (req.message || `Código solicitado via ${method} para ${phoneLabel}. Digite abaixo e confirme.${raw}`),
        );
      } else {
        const detail = req.error || data.error || `Falha ao solicitar código (${method})`;
        setMessage(`❌ ${detail}${raw}`);
      }
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao solicitar código');
    } finally {
      setBusy(false);
    }
  };

  const fetchExtensionToken = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/whatsapp/connection/extension-token${instanceQuery}`, { headers: authHeaders() });
      const data = await r.json();
      if (data.token) {
        setExtensionToken(data.token);
        setExtensionExpiresAt(data.expiresAt || null);
        setMessage(`Código extensão gerado — válido ~5 min. Use na extensão Z-API Conector.`);
      } else {
        setExtensionToken(null);
        setMessage(data.error || 'Não foi possível gerar código de extensão');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao gerar código');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    try {
      const r = await authFetch(`/api/whatsapp/connection/confirm-code${instanceQuery}`, {
        method: 'POST',
        body: JSON.stringify({ code: smsCode || undefined, pin: pinCode || undefined }),
      });
      const data = await r.json();
      if (data.data?.confirmSecurityCode) {
        setMessage('Código OK — informe o PIN de verificação em duas etapas abaixo.');
      } else if (data.data?.deviceConfirm) {
        setMessage('Confirme a transferência no celular onde o WhatsApp está aberto.');
      } else if (data.data?.success || data.status?.connected || data.ok) {
        setMessage('Conectado com sucesso!');
        setSmsCode('');
        setPinCode('');
      } else {
        setMessage(data.error || data.data?.error || 'Falha na confirmação');
      }
      await refreshStatus(selected?.id);
      await loadInstances();
    } finally {
      setBusy(false);
    }
  };

  const connected = info?.status?.connected === true;
  const isMobile = (form.instance_type || info?.instanceType) === 'mobile';
  const isZapi = form.provider === 'zapi';

  return (
    <div className="space-y-6" data-testid="panel-whatsapp-connection">
      {/* Tabela de instâncias */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Instâncias WhatsApp</h3>
            <p className="text-sm text-gray-500">Credenciais no banco — sem editar .env</p>
          </div>
          <button type="button" onClick={() => void refreshAll()} className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {instances.length === 0 ? (
          <div className="space-y-2">
            {message && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 p-3 rounded-lg">{message}</p>
            )}
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
              Nenhuma instância cadastrada no banco. O sistema tenta sincronizar automaticamente a partir das variáveis ZAPI_MOBILE_* na Vercel.
              Se continuar vazio, confira se <code className="bg-amber-100 px-1 rounded">ZAPI_MOBILE_TOKEN</code> e <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> estão na Vercel.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase text-gray-400 border-b">
                  <th className="py-2 pr-3">Empresa</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Última verificação</th>
                </tr>
              </thead>
              <tbody>
                {instances.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`border-b cursor-pointer hover:bg-gray-50 ${selectedId === row.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="py-2 pr-3 font-medium">{row.label}{row.is_default ? ' ★' : ''}</td>
                    <td className="py-2 pr-3 uppercase text-xs">{row.provider}</td>
                    <td className="py-2 pr-3 text-xs">{row.instance_type || '—'}</td>
                    <td className="py-2 pr-3">{statusDot(row)} {row.last_connected ? 'Conectado' : row.last_error ? 'Erro' : '—'}</td>
                    <td className="py-2 text-xs text-gray-400">{row.last_checked_at ? new Date(row.last_checked_at).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* Credenciais */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h4 className="font-bold text-gray-800 mb-4">Credenciais — {selected.label}</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Slug</label>
                <input value={form.slug || ''} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Nome exibido</label>
                <input value={form.label || ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Provider</label>
                <select value={form.provider || 'zapi'} onChange={e => setForm(f => ({ ...f, provider: e.target.value as InstancePublic['provider'] }))}
                  className="w-full mt-1 p-2 border rounded-lg text-sm">
                  <option value="zapi">Z-API</option>
                  <option value="meta">Meta Cloud API</option>
                  <option value="mock">Mock (dev)</option>
                </select>
              </div>
              {isZapi && (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Tipo instância</label>
                    <select value={form.instance_type || 'mobile'} onChange={e => setForm(f => ({ ...f, instance_type: e.target.value as 'web' | 'mobile' }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm">
                      <option value="mobile">Mobile</option>
                      <option value="web">Web</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Instance ID</label>
                    <input value={form.zapi_instance_id || ''} onChange={e => setForm(f => ({ ...f, zapi_instance_id: e.target.value }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">
                      Token {selected.has_zapi_token && `(atual: ${selected.zapi_token_masked})`}
                    </label>
                    <input type="password" value={form.zapi_token || ''} onChange={e => setForm(f => ({ ...f, zapi_token: e.target.value }))}
                      placeholder={selected.has_zapi_token ? 'Deixe vazio para manter' : 'Obrigatório'}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Client-Token</label>
                    <input type="password" value={form.zapi_client_token || ''} onChange={e => setForm(f => ({ ...f, zapi_client_token: e.target.value }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                </>
              )}
              {form.provider === 'meta' && (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Phone Number ID</label>
                    <input value={form.meta_phone_number_id || ''} onChange={e => setForm(f => ({ ...f, meta_phone_number_id: e.target.value }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Access Token</label>
                    <input type="password" value={form.meta_access_token || ''} onChange={e => setForm(f => ({ ...f, meta_access_token: e.target.value }))}
                      placeholder={selected.has_meta_token ? 'Deixe vazio para manter' : 'Obrigatório'}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">
                  Número oficial (Brasil) — DDI +55 automático
                </label>
                <div className="mt-1 flex gap-2 items-center">
                  <span className="text-sm font-bold text-gray-700 bg-gray-100 border rounded-lg px-3 py-2">+55</span>
                  <input
                    value={form.official_phone || ''}
                    onChange={e => setForm(f => ({ ...f, official_phone: e.target.value, official_ddi: '55' }))}
                    placeholder="11926839456"
                    className="flex-1 p-2 border rounded-lg text-sm font-mono"
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Digite DDD + número (ex.: 11926839456). O sistema envia à Z-API como DDI <strong>55</strong> + telefone local.
                </p>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
                  Instância padrão
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled !== false} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                  Ativa
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" disabled={busy} onClick={() => void saveInstance()}
                className="text-xs font-bold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                <Save size={14} /> Salvar no banco
              </button>
              <button type="button" disabled={busy} onClick={() => void testConnection()}
                className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Testar conexão
              </button>
            </div>

            {testResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${testResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {testResult.ok ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
                <div>
                  <p className="font-bold">{testResult.message}</p>
                  <p className="text-xs mt-1 opacity-80">
                    Esperado: {fmtPhone(testResult.expectedPhone)}
                    {testResult.connectedPhone ? ` · Conectado: ${fmtPhone(testResult.connectedPhone)}` : ''}
                    · {new Date(testResult.checkedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Conexão */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div className="flex items-start gap-3">
                {connected ? <Wifi className="text-green-600 mt-1" /> : <WifiOff className="text-red-500 mt-1" />}
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Conexão — {selected.label}</h3>
                  <p className="text-sm text-gray-500">
                    {form.provider?.toUpperCase()} · {isMobile ? 'mobile' : 'web'} · Oficial {fmtPhone(info?.officialPhone || `55${form.official_phone}`)}
                  </p>
                </div>
              </div>
            </div>

            {loading && !info ? (
              <div className="flex items-center gap-2 text-gray-400 py-6"><Loader2 className="animate-spin" size={18} /> Consultando…</div>
            ) : (
              <div className="space-y-4">
                <div className={`p-3 rounded-lg text-sm ${connected ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {connected
                    ? `Conectado${info?.connectedPhone ? ` — ${fmtPhone(info.connectedPhone)}` : ''}${info?.phoneMatchesOfficial ? ' ✓ número oficial' : ' ⚠ número diferente do oficial'}`
                    : `Desconectado${info?.status?.error ? `: ${info.status.error}` : info?.lastError ? `: ${info.lastError}` : ''}`}
                </div>

                {!connected && isZapi && (
                  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-xs space-y-2">
                    <p className="font-black uppercase text-[10px] tracking-wide">Fluxo MOBILE (como você pediu)</p>
                    <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Deixe o <strong>WhatsApp Business aberto</strong> no eSIM.</li>
                      <li>Peça <strong>UMA vez</strong>: Pop-up (wa_old) <em>ou</em> SMS <em>ou</em> Ligação — não clique várias vezes (piora o blocked).</li>
                      <li>Se chegar <strong>código por SMS/voz</strong>, digite em <strong>Confirmar código</strong> abaixo (não em “Aparelhos conectados”).</li>
                      <li>Se aparecer <strong>pop-up</strong> no app, toque em Conectar/Confirmar na tela.</li>
                      <li>Se a API responder <code className="bg-amber-100 px-1 rounded">blocked</code>: aguarde e tente de novo depois — o health não deve martelar o pedido.</li>
                    </ol>
                  </div>
                )}

                <div className="p-4 rounded-lg border border-blue-100 bg-blue-50/80 text-blue-950 text-xs space-y-2">
                  <p className="font-black uppercase text-[10px] tracking-wide">Z-API hoje vs Meta Cloud API (oficial)</p>
                  <p className="leading-relaxed">
                    <strong>Z-API (atual):</strong> depende do celular ligado e da sessão WhatsApp — pode cair com Web/Business no mesmo número.
                    <strong className="block mt-1">Meta oficial:</strong> envios pela API Graph sem celular 24h; muito mais estável para automação, porém custo por conversa, templates aprovados e migração de código (provider Meta ainda em desenvolvimento no sistema).
                  </p>
                </div>

                {message && (
                  <p className="text-sm bg-blue-50 border border-blue-100 text-blue-900 p-3 rounded-lg">{message}</p>
                )}

                {isZapi && (
                  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-xs space-y-2">
                    <p className="font-black uppercase text-[10px] tracking-wide">Webhooks Z-API (anti-queda — configure no painel Z-API)</p>
                    <p className="leading-relaxed">
                      Cole estas URLs nos callbacks da instância. Use o mesmo segredo configurado em <code className="bg-white px-1 rounded">ZAPI_WEBHOOK_SECRET</code> na Vercel.
                    </p>
                    <div className="font-mono text-[10px] bg-white p-2 rounded border break-all">
                      Desconexão: {typeof window !== 'undefined' ? `${window.location.origin}/api/zapi/webhook/connection` : '/api/zapi/webhook/connection'}
                    </div>
                    <div className="font-mono text-[10px] bg-white p-2 rounded border break-all">
                      Mensagens: {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook/inbound` : '/api/whatsapp/webhook/inbound'}
                    </div>
                    <div className="font-mono text-[10px] bg-white p-2 rounded border break-all">
                      Status entrega: {typeof window !== 'undefined' ? `${window.location.origin}/api/zapi/webhook/message-status` : '/api/zapi/webhook/message-status'}
                    </div>
                    <p className="text-[10px] opacity-80">Vigia: 1 min. Auto-reconnect ativo por padrão (restore-session + restart). Desative com WHATSAPP_AUTO_RECONNECT=false na Vercel.</p>
                  </div>
                )}

                {isZapi && !connected && (
                  <div className="p-4 rounded-xl border-2 border-red-300 bg-red-50 text-red-950 space-y-3">
                    <p className="font-black uppercase text-xs tracking-wide flex items-center gap-2">
                      <WifiOff size={16} /> Bot offline — reconectar
                    </p>
                    <div className="text-xs leading-relaxed space-y-2 bg-white/80 border border-red-200 rounded-lg p-3">
                      <p className="font-bold text-red-800">Modo MOBILE — o que fazer agora:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Abra o WhatsApp Business no eSIM e deixe em primeiro plano.</li>
                        <li>Use <strong>Pop-up</strong>, <strong>SMS</strong> ou <strong>Ligação</strong> (só uma tentativa).</li>
                        <li>Código SMS/voz → campo <strong>Confirmar código</strong> abaixo.</li>
                        <li>Se vier blocked: espere e tente de novo — não fique clicando.</li>
                      </ol>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void requestSms('wa_old')}
                      className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50"
                      data-testid="button-request-wa-old-primary"
                    >
                      {busy ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
                      {busy ? 'Solicitando…' : 'Pedir pop-up no WhatsApp (wa_old)'}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => void refreshQr()}
                        className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl border-2 border-gray-300 text-gray-800 disabled:opacity-50"
                        data-testid="button-refresh-qr-offline">
                        <QrCode size={14} /> QR
                      </button>
                      <button type="button" disabled={busy} onClick={() => void requestSms('wa_old')}
                        className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl border-2 border-red-300 text-red-900 disabled:opacity-50"
                        data-testid="button-request-wa-old">
                        <Smartphone size={14} /> Pop-up
                      </button>
                      <button type="button" disabled={busy} onClick={() => void requestSms('voice')}
                        className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl border-2 border-amber-400 text-amber-950 disabled:opacity-50">
                        <Phone size={14} /> Ligação
                      </button>
                    </div>
                    {qrBase64 && (
                      <div className="flex flex-col items-center gap-2 bg-white rounded-xl border border-red-200 p-4">
                        <p className="text-[10px] font-bold uppercase text-gray-500">Escaneie no WhatsApp Business do eSIM</p>
                        <img src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`} alt="QR WhatsApp" className="w-56 h-56" />
                      </div>
                    )}
                  </div>
                )}

                {isZapi && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void runApiReconnect(false)}
                      className="text-xs font-bold px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 flex items-center gap-1">
                      <RefreshCw size={14} /> Reconectar via API
                    </button>
                    {isMobile && (
                      <button type="button" disabled={busy} onClick={() => void requestSms('wa_old')}
                        className="text-xs font-bold px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 flex items-center gap-1">
                        <Smartphone size={14} /> Pop-up no app
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => void runBootstrap()}
                      className="text-xs font-bold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {busy ? 'Aguarde…' : 'Iniciar conexão automática'}
                    </button>
                    {isMobile && (
                      <button type="button" disabled={busy} onClick={() => void generatePhoneLinkCode()}
                        className="text-xs font-bold px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 flex items-center gap-1">
                        <Smartphone size={14} /> Gerar código vinculação
                      </button>
                    )}
                    {!isMobile && (
                      <>
                        <button type="button" disabled={busy} onClick={() => void generatePhoneLinkCode()}
                          className="text-xs font-bold px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 flex items-center gap-1">
                          <Smartphone size={14} /> Gerar código web
                        </button>
                        <button type="button" disabled={busy} onClick={() => void refreshQr()}
                          className="text-xs font-bold px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
                          <QrCode size={14} /> Atualizar QR / código
                        </button>
                      </>
                    )}
                    {isMobile && (
                      <button type="button" disabled={busy} onClick={() => void refreshQr()}
                        className="text-xs font-bold px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
                        <QrCode size={14} /> Atualizar QR
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => void fetchExtensionToken()}
                      className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                      Código extensão
                    </button>
                    {isMobile && (
                      <button type="button" disabled={busy} onClick={() => void requestSms('sms')}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
                        <Phone size={14} /> SMS
                      </button>
                    )}
                  </div>
                )}

                {qrBase64 && (
                  <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-bold text-gray-600 mb-2">Escaneie no WhatsApp → Aparelhos conectados</p>
                    <img src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`} alt="QR" className="mx-auto w-56 h-56" />
                  </div>
                )}

                {phoneLinkCode && connected === false && (
                  <div className="text-center p-4 bg-amber-50 rounded-lg border-2 border-amber-300 space-y-2">
                    <p className="text-[10px] font-bold uppercase text-amber-800">
                      {isMobile
                        ? 'Código de 8 letras (fluxo WEB) — não use com instância MOBILE'
                        : 'Código de vinculação WEB (phone-code)'}
                    </p>
                    <p className="text-3xl font-mono font-black tracking-widest text-gray-900" data-testid="text-phone-link-code">{phoneLinkCode}</p>
                    {isMobile ? (
                      <p className="text-xs text-red-800 leading-relaxed font-medium">
                        Esta instância é <strong>MOBILE</strong>. Código de 8 letras / “Aparelhos conectados” <strong>não conecta</strong>.
                        Use <strong>Pop-up / SMS / Ligação</strong> acima e confirme o código SMS no campo abaixo.
                      </p>
                    ) : (
                      <p className="text-xs text-amber-950 leading-relaxed">
                        No WhatsApp Business do eSIM +55 (11) 92683-9456:<br />
                        <strong>Aparelhos conectados → Conectar → Vincular com número de telefone</strong>
                      </p>
                    )}
                    {!isMobile && (
                      <button type="button" onClick={() => void copyPhoneCode()}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm">
                        {codeCopied ? <Check size={16} /> : <Copy size={16} />}
                        {codeCopied ? 'Copiado!' : 'Copiar código e instruções'}
                      </button>
                    )}
                  </div>
                )}

                {extensionToken && (
                  <div className="text-center p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-[10px] font-black uppercase text-indigo-700 mb-2">Extensão Z-API Conector</p>
                    <p className="text-2xl font-black font-mono tracking-widest text-indigo-900">{extensionToken}</p>
                    {extensionExpiresAt && (
                      <p className="text-[10px] text-indigo-600 mt-2">
                        Expira em ~{Math.max(0, Math.round((extensionExpiresAt - Date.now()) / 60_000))} min
                      </p>
                    )}
                    <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
                      Chrome → web.whatsapp.com (número oficial) → extensão Z-API Conector → digite o código
                    </p>
                  </div>
                )}

                {isMobile && isZapi && (
                  <div className="grid sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500">Código SMS / confirmação</label>
                      <input value={smsCode} onChange={e => setSmsCode(e.target.value)} placeholder="123456"
                        className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500">PIN 2FA (se pedido)</label>
                      <input value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="PIN"
                        className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                    </div>
                    <button type="button" disabled={busy || (!smsCode && !pinCode)} onClick={() => void confirmCode()}
                      className="sm:col-span-2 text-xs font-bold py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                      Confirmar código
                    </button>
                  </div>
                )}

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  O botão <strong>Testar conexão</strong> consulta a API, valida o número conectado e persiste o status no banco.
                  Todo envio do sistema usa a instância padrão (★) via <code className="bg-gray-100 px-1 rounded">whatsappProvider.sendText()</code>.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WhatsAppConnectionPanel;
