import React, { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, QrCode, RefreshCw, Save, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { safeWhatsappInstanceLabel } from '../lib/whatsappDisplayUtils';
import { openZapiSdkConnector } from '../lib/zapiSdkConnector';

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
  status?: { connected: boolean; error?: string; smartphoneConnected?: boolean | null };
  registrationAvailable?: {
    available?: boolean;
    retryAfter?: number;
    smsWaitSeconds?: number;
    voiceWaitSeconds?: number;
    waOldWaitSeconds?: number;
    waOldEligible?: boolean;
  } | null;
  disconnectHint?: {
    kind: string;
    titlePt: string;
    stepsPt: string[];
  } | null;
  diagnosis?: {
    recommendedPath?: string;
    summaryPt?: string;
    stepsPt?: string[];
    smsBlocked?: boolean;
  } | null;
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
  /** Contagem regressiva local do cooldown (UX limpa). */
  const [cooldownLeft, setCooldownLeft] = useState(0);

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
    const data = await r.json();
    setInfo(data);
    return data as ConnStatus | null;
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

  /** Modal oficial Z-API (SDK Connector) — doc partner/sdk-connector. */
  const openOfficialSdk = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const fresh = await refreshStatus(selected.id);
      const regFresh = fresh?.registrationAvailable || null;
      const instanceIsMobile = (form.instance_type || fresh?.instanceType || info?.instanceType) === 'mobile';
      const smsW = Number(regFresh?.smsWaitSeconds ?? 0);
      const voiceW = Number(regFresh?.voiceWaitSeconds ?? 0);
      const retryW = Number(regFresh?.retryAfter ?? 0);
      let waW = Number(regFresh?.waOldWaitSeconds ?? 0);
      const hasExplicitWa = regFresh != null && (
        Object.prototype.hasOwnProperty.call(regFresh, 'waOldWaitSeconds')
        || Object.prototype.hasOwnProperty.call(regFresh, 'waOldEligible')
      );
      if (!hasExplicitWa) {
        const signals = [retryW, smsW > 0 ? smsW : 0, voiceW > 0 ? voiceW : 0].filter((n: number) => n > 0);
        if (signals.length > 0) waW = Math.max(...signals);
      }
      const waEligible = regFresh?.waOldEligible !== false;
      const waReadyNow = waEligible && waW === 0;
      const voiceReadyNow = voiceW !== -1 && voiceW === 0;
      const smsReadyNow = smsW !== -1 && smsW === 0;
      const anyReady = waReadyNow || voiceReadyNow || smsReadyNow;
      const waitMax = Math.max(waW > 0 ? waW : 0, voiceW > 0 ? voiceW : 0, smsW > 0 ? smsW : 0, retryW);
      const fmtW = (s: number) => (s <= 0 ? 'agora' : s < 60 ? `${s}s` : `~${Math.ceil(s / 60)} min`);
      if (instanceIsMobile && regFresh && !anyReady && waitMax > 0) {
        setMessage(
          `Cooldown ativo (~${fmtW(waitMax)}). Deixe o WhatsApp Business aberto no eSIM e aguarde o contador zerar. Não abra o conector agora — pedir código gera blocked.`,
        );
        return;
      }

      const r = await authFetch(`/api/whatsapp/connection/sdk-token${instanceQuery}`);
      const data = await r.json();
      if (!r.ok || !data.token) {
        throw new Error(data.error || 'Falha ao gerar token do SDK Connector');
      }
      const connectedOk = await openZapiSdkConnector({
        token: data.token,
        instanceType: data.instanceType || form.instance_type || 'mobile',
      });
      if (connectedOk) {
        setMessage('Conectado pelo SDK Connector Z-API.');
      } else {
        setMessage(
          'Modal fechado sem conexão. Mantenha o WhatsApp Business aberto no eSIM. Se SMS/Ligação tinham cronômetro, aguarde zerar e tente UMA vez (WhatsApp cinza = pop-up indisponível no momento).',
        );
      }
      await refreshStatus(selected.id);
      await loadInstances();
      await testConnection();
    } catch (e: any) {
      setMessage(e?.message || 'Erro ao abrir SDK Connector');
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
      const raw = req.data ? ` | Z-API: ${JSON.stringify(req.data)}` : '';
      if (req.ok && req.data?.success === true) {
        setMessage(
          method === 'wa_old'
            ? `✅ Pop-up aceito pela Z-API para ${phoneLabel}. Deixe o WhatsApp Business aberto no eSIM e confirme o aviso na tela.${raw}`
            : method === 'voice'
              ? `✅ Ligação solicitada para ${phoneLabel}. Atenda a chamada no eSIM e anote o código — depois Confirmar código abaixo.${raw}`
              : (req.message || `Código solicitado via ${method} para ${phoneLabel}. Digite abaixo e confirme.${raw}`),
        );
      } else {
        const detail = req.error || data.error || `Falha ao solicitar código (${method})`;
        setMessage(`❌ ${detail}${raw}`);
      }
      await refreshStatus(selected?.id);
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
  const reg = info?.registrationAvailable || null;
  const smsWait = Number(reg?.smsWaitSeconds ?? 0);
  const voiceWait = Number(reg?.voiceWaitSeconds ?? 0);
  const hasExplicitWaOld =
    reg != null && (Object.prototype.hasOwnProperty.call(reg, 'waOldWaitSeconds')
      || Object.prototype.hasOwnProperty.call(reg, 'waOldEligible'));
  const retryAfter = Math.max(0, Number(reg?.retryAfter ?? 0) || 0);
  let waOldWait = Number(reg?.waOldWaitSeconds ?? 0);
  if (!hasExplicitWaOld && reg != null) {
    const signals = [retryAfter, smsWait > 0 ? smsWait : 0, voiceWait > 0 ? voiceWait : 0].filter((n) => n > 0);
    if (signals.length > 0) waOldWait = Math.max(...signals);
  }
  const waOldEligible = reg?.waOldEligible !== false;
  const smsBlocked = isMobile && smsWait === -1;
  const waOldReady = isMobile && waOldEligible && waOldWait === 0;
  const voiceReady = isMobile && voiceWait === 0;
  const smsReady = isMobile && smsWait === 0;
  const cooldownSeconds = isMobile && reg
    ? Math.max(waOldReady ? 0 : Math.max(waOldWait, 0), voiceReady ? 0 : Math.max(voiceWait, 0), smsReady ? 0 : (smsWait > 0 ? smsWait : 0), retryAfter)
    : 0;
  const inCooldown = isMobile && !connected && cooldownSeconds > 0 && !waOldReady && !voiceReady && !smsReady;
  const disconnectHint = info?.disconnectHint || null;
  const formatWait = (s: number) => {
    if (s <= 0) return 'agora';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${m} min`;
  };

  useEffect(() => {
    setCooldownLeft(inCooldown ? cooldownSeconds : 0);
  }, [inCooldown, cooldownSeconds, selected?.id]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = window.setInterval(() => {
      setCooldownLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          void refreshStatus(selected?.id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownLeft > 0, selected?.id, refreshStatus]);

  const waiting = inCooldown || cooldownLeft > 0;
  const waitDisplay = cooldownLeft > 0 ? cooldownLeft : cooldownSeconds;

  return (
    <div className="space-y-4" data-testid="panel-whatsapp-connection">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-gray-800">WhatsApp</h3>
          <button type="button" onClick={() => void refreshAll()} className="text-xs text-gray-500 flex items-center gap-1" data-testid="button-whatsapp-refresh-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
        {instances.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg">
            {message || 'Nenhuma instância no banco. Confira ZAPI_MOBILE_* na Vercel.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {instances.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`text-left px-3 py-2 rounded-lg border text-sm ${selectedId === row.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <span className="font-semibold">{statusDot(row)} {row.label}</span>
                {row.is_default ? <span className="text-[10px] text-gray-500 ml-1">padrão</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4" data-testid="panel-whatsapp-connect-main">
            <div className="flex items-start gap-3">
              {connected ? <Wifi className="text-green-600 mt-0.5 shrink-0" /> : <WifiOff className="text-red-500 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900">{selected.label}</h3>
                <p className="text-sm text-gray-500">
                  {fmtPhone(info?.officialPhone || `55${form.official_phone || ''}`)}
                  {isMobile ? ' · Business no eSIM' : ' · WEB'}
                </p>
              </div>
            </div>

            {loading && !info ? (
              <div className="flex items-center gap-2 text-gray-400 py-4"><Loader2 className="animate-spin" size={18} /> Consultando…</div>
            ) : (
              <>
                <div
                  className={`p-3 rounded-lg text-sm font-semibold ${connected ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
                  data-testid="text-whatsapp-status"
                >
                  {connected
                    ? `Conectado${info?.connectedPhone ? ` — ${fmtPhone(info.connectedPhone)}` : ''}`
                    : waiting
                      ? `Aguardando liberação — ${formatWait(waitDisplay)}`
                      : `Desconectado${info?.status?.error ? ` — ${info.status.error}` : ''}`}
                </div>

                {message && (
                  <p className="text-sm bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-lg" data-testid="text-whatsapp-message">{message}</p>
                )}

                {isZapi && !connected && isMobile && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      Deixe o <strong>WhatsApp Business</strong> aberto no eSIM e use o botão abaixo.
                    </p>

                    <button
                      type="button"
                      disabled={busy || waiting}
                      onClick={() => void openOfficialSdk()}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-4 rounded-xl disabled:opacity-50 text-base"
                      title={waiting ? `Aguarde ${formatWait(waitDisplay)}` : 'Abrir conector Z-API'}
                      data-testid="button-zapi-sdk-connector"
                    >
                      {busy ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
                      {busy ? 'Abrindo…' : waiting ? `Aguarde ${formatWait(waitDisplay)}` : 'Conectar'}
                    </button>

                    {!waiting && (
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={busy || (reg != null && !waOldReady)}
                          onClick={() => void requestSms('wa_old')}
                          className="text-xs font-bold py-2.5 rounded-lg border border-gray-300 disabled:opacity-40"
                          data-testid="button-request-wa-old-primary"
                        >
                          Pop-up
                        </button>
                        <button
                          type="button"
                          disabled={busy || (reg != null && !voiceReady)}
                          onClick={() => void requestSms('voice')}
                          className="text-xs font-bold py-2.5 rounded-lg border border-gray-300 disabled:opacity-40"
                        >
                          Ligação
                        </button>
                        <button
                          type="button"
                          disabled={busy || smsBlocked || (reg != null && !smsReady)}
                          onClick={() => void requestSms('sms')}
                          className="text-xs font-bold py-2.5 rounded-lg border border-gray-300 disabled:opacity-40"
                        >
                          SMS
                        </button>
                      </div>
                    )}

                    <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] font-black uppercase text-gray-500">Código</label>
                        <input
                          value={smsCode}
                          onChange={(e) => setSmsCode(e.target.value)}
                          placeholder="Código SMS / ligação"
                          className="w-full mt-1 p-2.5 border rounded-lg text-sm font-mono"
                          data-testid="input-whatsapp-sms-code"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busy || !smsCode}
                        onClick={() => void confirmCode()}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm disabled:opacity-50"
                        data-testid="button-whatsapp-confirm-code"
                      >
                        Confirmar
                      </button>
                    </div>

                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer select-none">PIN de 2 etapas (só se pedir)</summary>
                      <input
                        value={pinCode}
                        onChange={(e) => setPinCode(e.target.value)}
                        placeholder="PIN"
                        className="w-full mt-2 p-2 border rounded-lg text-sm font-mono"
                      />
                    </details>
                  </div>
                )}

                {isZapi && !connected && !isMobile && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => void generatePhoneLinkCode()}
                        className="flex-1 min-w-[140px] text-sm font-bold px-3 py-2.5 rounded-xl bg-green-700 text-white disabled:opacity-50">
                        Gerar código
                      </button>
                      <button type="button" disabled={busy} onClick={() => void refreshQr()}
                        className="flex-1 min-w-[140px] text-sm font-bold px-3 py-2.5 rounded-xl border border-gray-300 disabled:opacity-50 flex items-center justify-center gap-1">
                        <QrCode size={14} /> QR
                      </button>
                      <button type="button" disabled={busy} onClick={() => void runApiReconnect(false)}
                        className="w-full text-sm font-bold px-4 py-2.5 rounded-xl bg-red-700 text-white disabled:opacity-50 flex items-center justify-center gap-1">
                        <RefreshCw size={14} /> Reconectar
                      </button>
                    </div>
                    {qrBase64 && (
                      <div className="text-center p-3 bg-gray-50 rounded-lg border">
                        <img src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`} alt="QR" className="mx-auto w-48 h-48" />
                      </div>
                    )}
                    {phoneLinkCode && (
                      <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                        <p className="text-2xl font-mono font-black tracking-widest" data-testid="text-phone-link-code">{phoneLinkCode}</p>
                        <button type="button" onClick={() => void copyPhoneCode()}
                          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 rounded-xl text-sm">
                          {codeCopied ? <Check size={16} /> : <Copy size={16} />}
                          {codeCopied ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isZapi && connected && (
                  <button type="button" disabled={busy} onClick={() => void refreshStatus(selected?.id)}
                    className="text-sm font-bold px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
                    <RefreshCw size={14} /> Atualizar status
                  </button>
                )}

                {testResult && (
                  <div className={`p-3 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {testResult.message}
                  </div>
                )}
              </>
            )}
          </div>

          <details className="bg-white rounded-xl shadow-sm border border-gray-200 p-4" data-testid="details-whatsapp-advanced">
            <summary className="cursor-pointer font-bold text-sm text-gray-700 select-none">Avançado — credenciais</summary>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Nome</label>
                <input value={form.label || ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Número (DDD+número)</label>
                <div className="mt-1 flex gap-2 items-center">
                  <span className="text-sm font-bold text-gray-700 bg-gray-100 border rounded-lg px-3 py-2">+55</span>
                  <input
                    value={form.official_phone || ''}
                    onChange={e => setForm(f => ({ ...f, official_phone: e.target.value, official_ddi: '55' }))}
                    placeholder="11926839456"
                    className="flex-1 p-2 border rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              {isZapi && (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Instance ID</label>
                    <input value={form.zapi_instance_id || ''} onChange={e => setForm(f => ({ ...f, zapi_instance_id: e.target.value }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">
                      Token {selected.has_zapi_token && `(${selected.zapi_token_masked})`}
                    </label>
                    <input type="password" value={form.zapi_token || ''} onChange={e => setForm(f => ({ ...f, zapi_token: e.target.value }))}
                      placeholder={selected.has_zapi_token ? 'Vazio = manter' : 'Obrigatório'}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Client-Token</label>
                    <input type="password" value={form.zapi_client_token || ''} onChange={e => setForm(f => ({ ...f, zapi_client_token: e.target.value }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500">Tipo</label>
                    <select value={form.instance_type || 'mobile'} onChange={e => setForm(f => ({ ...f, instance_type: e.target.value as 'web' | 'mobile' }))}
                      className="w-full mt-1 p-2 border rounded-lg text-sm">
                      <option value="mobile">Mobile</option>
                      <option value="web">Web</option>
                    </select>
                  </div>
                </>
              )}
              <div className="flex items-end gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
                  Padrão
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled !== false} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                  Ativa
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" disabled={busy} onClick={() => void saveInstance()}
                className="text-xs font-bold px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                <Save size={14} /> Salvar
              </button>
              <button type="button" disabled={busy} onClick={() => void testConnection()}
                className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-1">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Testar
              </button>
              {isZapi && !connected && (
                <button type="button" disabled={busy} onClick={() => void runApiReconnect(false)}
                  className="text-xs font-bold px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50 flex items-center gap-1">
                  <RefreshCw size={14} /> Restaurar sessão
                </button>
              )}
            </div>
            {disconnectHint && !connected && (
              <p className="mt-3 text-xs text-gray-600">{disconnectHint.titlePt}</p>
            )}
          </details>
        </>
      )}
    </div>
  );
};

export default WhatsAppConnectionPanel;
