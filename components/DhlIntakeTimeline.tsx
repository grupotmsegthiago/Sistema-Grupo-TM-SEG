import { formatDateTimeBR } from '../lib/dateUtils';
import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import {
  Mail, Phone, Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ExternalLink, Paperclip, Copy, Check, RefreshCw, Loader2,
  MessageSquare, Maximize2, X, User, Truck,
} from 'lucide-react';

interface EscoltistaSnapshot {
  nome?: string | null; cpf?: string | null; rg?: string | null; orgao_emissor?: string | null;
  cnh?: string | null; cnh_categoria?: string | null; cnh_vencimento?: string | null;
  cnv_numero?: string | null; cnv_validade?: string | null; rua?: string | null;
  numero?: string | null; complemento?: string | null; bairro?: string | null;
  cidade?: string | null; uf?: string | null; cep?: string | null;
  celular?: string | null; admissao?: string | null;
}
interface VehicleSnapshot {
  placa?: string | null; renavam?: string | null; marca?: string | null;
  modelo?: string | null; ano?: string | null; cor?: string | null;
  tecnologia?: string | null; id_rastreador?: string | null; comunicacao?: string | null;
}
interface DhlIntakeRow {
  id: string; token: string; provider_name: string | null;
  status: string; effective_status: string; expired: boolean;
  sent_to_email: string | null; sent_to_phone: string | null;
  submitted_at: string | null; created_at: string; expires_at: string | null;
  agent1_snapshot?: EscoltistaSnapshot | null;
  agent2_snapshot?: EscoltistaSnapshot | null;
  vehicle_snapshot?: VehicleSnapshot | null;
  mirror_proof_url?: string | null; mirror_proof_filename?: string | null;
  provider_reminder_count?: number | null;
  provider_whatsapp_reminder_count?: number | null;
  provider_reminder_sent_at?: string | null;
  provider_whatsapp_reminder_sent_at?: string | null;
  whatsapp_text?: string | null;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  open_count?: number | null;
  progress_agent1?: boolean | null;
  progress_agent2?: boolean | null;
  progress_vehicle?: boolean | null;
  progress_mirror?: boolean | null;
}

interface DhlReminderConfig { maxCount: number; cycleHours: number; }

interface Props {
  missionId: string;
  canViewSnapshots?: boolean;
  /** Cliente DHL — identidade visual amarela/vermelha; demais usam tema neutro. */
  isDhlClient?: boolean;
  /** Fornecedor selecionado no formulário (pode divergir do salvo na OS). */
  currentProvider?: string;
  /** Fornecedor gravado na OS no banco (antes de salvar alterações). */
  savedProvider?: string;
}

const normProvider = (s?: string | null) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const fmt = (d: string | null | undefined) => formatDateTimeBR(d);

// Formata datas no padrão brasileiro DD/MM/AAAA. Aceita ISO ("2031-07-13" ou
// "2031-07-13T00:00:00Z"), "AAAA-MM-DD" puro e já-BR ("13/07/2031" passa direto).
// Para campos só com data (sem hora) usa parsing manual para evitar shift de
// fuso ao instanciar Date (que assume UTC e desloca para -1 no Brasil).
const fmtDateBr = (d: string | null | undefined): string | null => {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDate) {
    const [, y, m, dd] = isoDate;
    return `${dd}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }
  return s;
};

const DhlIntakeTimeline: React.FC<Props> = ({
  missionId,
  canViewSnapshots = true,
  isDhlClient = false,
  currentProvider = '',
  savedProvider = '',
}) => {
  const [intakes, setIntakes] = useState<DhlIntakeRow[]>([]);
  const [reminderConfig, setReminderConfig] = useState<DhlReminderConfig>({ maxCount: 3, cycleHours: 12 });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [copiedVinculoId, setCopiedVinculoId] = useState<string | null>(null);

  // Texto padronizado para solicitar vínculo (Escoltista 1, Escoltista 2 e
  // veículo) na DHL — formato pensado para colar direto no WhatsApp.
  // CPF sai sem máscara (só dígitos), e usamos *bold* do WhatsApp para CPF
  // e para "TM SEG" no fechamento.
  const onlyDigits = (s?: string | null) => String(s || '').replace(/\D+/g, '');
  const buildVinculoDhlText = (it: DhlIntakeRow): string => {
    const lines: string[] = [];
    const a1 = it.agent1_snapshot;
    const a2 = it.agent2_snapshot;
    const v = it.vehicle_snapshot;
    const cpf1 = onlyDigits(a1?.cpf);
    const cpf2 = onlyDigits(a2?.cpf);
    lines.push('Solicitação de vínculo — DHL Supply Chain');
    lines.push('');
    lines.push('Escoltista 1:');
    lines.push(`Nome: ${a1?.nome || '—'}`);
    lines.push(`CPF:  *${cpf1 || '—'}*`);
    lines.push('');
    lines.push('Escoltista 2:');
    lines.push(`Nome: ${a2?.nome || '—'}`);
    lines.push(`CPF:  *${cpf2 || '—'}*`);
    lines.push('');
    lines.push('Veículo:');
    lines.push(`Placa:   ${v?.placa || '—'}`);
    lines.push('');
    lines.push('Favor vincular os cadastros acima para a empresa *TM SEG*');
    return lines.join('\n');
  };

  const copyVinculo = async (it: DhlIntakeRow) => {
    try {
      await navigator.clipboard.writeText(buildVinculoDhlText(it));
      setCopiedVinculoId(it.id);
      setTimeout(() => setCopiedVinculoId((c) => (c === it.id ? null : c)), 1800);
    } catch {}
  };
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedWa, setCopiedWa] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'email' | 'whatsapp' | 'both' | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [waTextById, setWaTextById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const r = await authFetch(`/api/dhl/intake/by-mission/${encodeURIComponent(missionId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErrorMsg(j?.error || 'Não foi possível carregar os links do fornecedor.');
        setIntakes([]);
        return;
      }
      const j = await r.json();
      setIntakes(Array.isArray(j?.intakes) ? j.intakes : []);
      if (j?.reminderConfig && typeof j.reminderConfig.maxCount === 'number' && typeof j.reminderConfig.cycleHours === 'number') {
        setReminderConfig({ maxCount: j.reminderConfig.maxCount, cycleHours: j.reminderConfig.cycleHours });
      }
    } catch {
      setErrorMsg('Falha de conexão ao carregar links do fornecedor.');
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onChange = (ev: Event) => {
      const detail: any = (ev as CustomEvent).detail;
      if (!detail || detail.mission_id === missionId || detail.missionId === missionId) load();
    };
    window.addEventListener('dhl-intake-changed', onChange);
    return () => window.removeEventListener('dhl-intake-changed', onChange);
  }, [missionId, load]);

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const buildPublicLink = (token: string) => `${baseOrigin}/fornecedor/dhl?token=${token}`;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink((c) => (c === url ? null : c)), 1500);
    } catch {}
  };

  const copyWaText = async (intakeId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWa(intakeId);
      setTimeout(() => setCopiedWa((c) => (c === intakeId ? null : c)), 1500);
    } catch {}
  };

  const generateLink = async (channel: 'email' | 'whatsapp' | 'both') => {
    if (!missionId) return;
    setGenerating(channel);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem('authToken') || '';
      const r = await fetch('/api/dhl/intake/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ missionId, channel }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.url) {
        if (j?.code === 'PROVIDER_EMAIL_REQUIRED') {
          setErrorMsg(`O fornecedor ${j.providerName || ''} ainda não tem e-mail cadastrado. Abra "Editar OS" para cadastrar o e-mail e gerar o link, ou use "Só WhatsApp".`);
        } else {
          setErrorMsg(j?.error || 'Falha ao gerar link.');
        }
        return;
      }
      const parts: string[] = [];
      if ((channel === 'whatsapp' || channel === 'both') && j.whatsappSent) parts.push('WhatsApp enviado ao fornecedor.');
      else if ((channel === 'whatsapp' || channel === 'both') && j.whatsappError) parts.push(`WhatsApp não enviado: ${j.whatsappError}.`);
      if ((channel === 'email' || channel === 'both') && j.emailSent) parts.push(`E-mail enviado para ${j.providerEmail || 'o fornecedor'}.`);
      else if ((channel === 'email' || channel === 'both') && j.emailError) parts.push(`E-mail não enviado: ${j.emailError}.`);
      setSuccessMsg(parts.length ? parts.join(' ') : 'Link gerado com sucesso.');
      if (j.intakeId && j.whatsappText) {
        setWaTextById((prev) => ({ ...prev, [j.intakeId]: j.whatsappText }));
      }
      await load();
      window.dispatchEvent(new CustomEvent('dhl-intake-changed', { detail: { mission_id: missionId } }));
    } catch (e: any) {
      setErrorMsg(e?.message || 'Falha de rede ao gerar o link.');
    } finally {
      setGenerating(null);
    }
  };

  const copySnapshot = async (it: DhlIntakeRow) => {
    const lines: string[] = [];
    lines.push(`OS — Dados enviados pelo fornecedor`);
    lines.push(`Fornecedor: ${it.provider_name || '—'}`);
    lines.push(`Enviado em: ${fmt(it.submitted_at)}`);
    lines.push('');
    const block = (label: string, a?: EscoltistaSnapshot | null) => {
      if (!a) return;
      lines.push(`== ${label} ==`);
      if (a.nome) lines.push(`Nome: ${a.nome}`);
      if (a.cpf) lines.push(`CPF: ${a.cpf}`);
      if (a.rg) lines.push(`RG: ${a.rg}${a.orgao_emissor ? ' / ' + a.orgao_emissor : ''}`);
      if (a.cnh) lines.push(`CNH: ${a.cnh}${a.cnh_categoria ? ' (' + a.cnh_categoria + ')' : ''}${a.cnh_vencimento ? ' — venc.: ' + (fmtDateBr(a.cnh_vencimento) || a.cnh_vencimento) : ''}`);
      if (a.cnv_numero) lines.push(`CNV: ${a.cnv_numero}${a.cnv_validade ? ' — venc.: ' + (fmtDateBr(a.cnv_validade) || a.cnv_validade) : ''}`);
      if (a.celular) lines.push(`Celular: ${a.celular}`);
      const end = [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ');
      if (end) lines.push(`Endereço: ${end}`);
      if (a.admissao) lines.push(`Admissão: ${fmtDateBr(a.admissao) || a.admissao}`);
      lines.push('');
    };
    block('ESCOLTISTA 1', it.agent1_snapshot);
    block('ESCOLTISTA 2', it.agent2_snapshot);
    const v = it.vehicle_snapshot;
    if (v) {
      lines.push('== VEÍCULO ==');
      if (v.placa) lines.push(`Placa: ${v.placa}`);
      if (v.renavam) lines.push(`Renavam: ${v.renavam}`);
      if (v.marca || v.modelo || v.ano) lines.push(`Marca/Modelo/Ano: ${[v.marca, v.modelo, v.ano].filter(Boolean).join(' / ')}`);
      if (v.cor) lines.push(`Cor: ${v.cor}`);
      if (v.tecnologia) lines.push(`Tecnologia: ${v.tecnologia}`);
      if (v.id_rastreador) lines.push(`ID Rastreador: ${v.id_rastreador}`);
      if (v.comunicacao) lines.push(`Comunicação: ${v.comunicacao}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(it.id);
      setTimeout(() => setCopiedId((c) => (c === it.id ? null : c)), 1500);
    } catch {}
  };

  const renderTimeline = (it: DhlIntakeRow) => {
    const st = it.effective_status;
    const done = (cond: boolean) => cond
      ? { circle: 'bg-green-600 text-white', line: 'bg-green-600', text: 'text-green-700' }
      : { circle: 'bg-gray-200 text-gray-400', line: 'bg-gray-200', text: 'text-gray-400' };

    const s1 = done(true);
    const s2 = done(st === 'preenchido');
    const s3Active = st === 'preenchido' && !!it.mirror_proof_url;
    const s3 = done(s3Active);

    if (st === 'cancelado') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg" data-testid={`timeline-${it.id}`}>
          <XCircle size={14} className="text-gray-500" />
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-600">Link cancelado em {fmt(it.expires_at)}</span>
        </div>
      );
    }
    if (st === 'expirado') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg" data-testid={`timeline-${it.id}`}>
          <AlertTriangle size={14} className="text-orange-600" />
          <span className="text-[11px] font-black uppercase tracking-wider text-orange-700">Link expirado em {fmt(it.expires_at)}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 px-2 py-2.5 bg-white rounded-lg border border-gray-200" data-testid={`timeline-${it.id}`}>
        {/* Etapa 1: enviado */}
        <div className="flex flex-col items-center min-w-[70px]">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${s1.circle}`}>
            <Send size={11} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-wider mt-1 ${s1.text} text-center leading-tight`}>Link enviado</span>
          <span className="text-[8px] text-gray-500 font-mono leading-tight">{fmt(it.created_at)}</span>
        </div>
        <div className={`flex-1 h-0.5 ${s2.line}`} />
        {/* Etapa 2: dados recebidos */}
        <div className="flex flex-col items-center min-w-[80px]">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${s2.circle}`}>
            {st === 'preenchido' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
          </div>
          <span className={`text-[8px] font-black uppercase tracking-wider mt-1 ${s2.text} text-center leading-tight`}>
            {st === 'preenchido' ? 'Dados recebidos' : 'Aguardando dados'}
          </span>
          {it.submitted_at && (
            <span className="text-[8px] text-gray-500 font-mono leading-tight">{fmt(it.submitted_at)}</span>
          )}
        </div>
        <div className={`flex-1 h-0.5 ${s3.line}`} />
        {/* Etapa 3: print espelhamento */}
        <div className="flex flex-col items-center min-w-[80px]">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${s3.circle}`}>
            <Paperclip size={11} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-wider mt-1 ${s3.text} text-center leading-tight`}>
            {s3Active ? 'Espelhamento ok' : 'Sem espelhamento'}
          </span>
        </div>
      </div>
    );
  };

  const renderAgent = (label: string, a: EscoltistaSnapshot | null | undefined, key: string, intakeId: string) => {
    if (!a) {
      return (
        <div className="bg-gray-50 rounded p-2" data-testid={`block-${key}-${intakeId}`}>
          <p className="font-black uppercase tracking-wider text-gray-500 mb-0.5 text-[10px]">{label}</p>
          <p className="italic text-gray-400 text-[10px]">— não informado —</p>
        </div>
      );
    }
    const end = [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ');
    return (
      <div className="bg-gray-50 rounded p-2 space-y-0.5 text-[10px]" data-testid={`block-${key}-${intakeId}`}>
        <p className="font-black uppercase tracking-wider text-gray-700 mb-0.5">{label}</p>
        {a.nome && <p><span className="font-bold">Nome:</span> {a.nome}</p>}
        {a.cpf && <p><span className="font-bold">CPF:</span> {a.cpf}</p>}
        {a.rg && <p><span className="font-bold">RG:</span> {a.rg}{a.orgao_emissor ? ` / ${a.orgao_emissor}` : ''}</p>}
        {a.cnh && <p><span className="font-bold">CNH:</span> {a.cnh}{a.cnh_categoria ? ` (${a.cnh_categoria})` : ''}{a.cnh_vencimento ? ` — venc.: ${fmtDateBr(a.cnh_vencimento) || a.cnh_vencimento}` : ''}</p>}
        {a.cnv_numero && <p><span className="font-bold">CNV:</span> {a.cnv_numero}{a.cnv_validade ? ` — venc.: ${fmtDateBr(a.cnv_validade) || a.cnv_validade}` : ''}</p>}
        {a.celular && <p><span className="font-bold">Celular:</span> {a.celular}</p>}
        {end && <p><span className="font-bold">Endereço:</span> {end}</p>}
        {a.admissao && <p><span className="font-bold">Admissão:</span> {fmtDateBr(a.admissao) || a.admissao}</p>}
      </div>
    );
  };

  const renderVehicle = (v: VehicleSnapshot | null | undefined, intakeId: string) => {
    if (!v) {
      return (
        <div className="bg-gray-50 rounded p-2" data-testid={`block-vehicle-${intakeId}`}>
          <p className="font-black uppercase tracking-wider text-gray-500 mb-0.5 text-[10px]">Veículo</p>
          <p className="italic text-gray-400 text-[10px]">— não informado —</p>
        </div>
      );
    }
    return (
      <div className="bg-gray-50 rounded p-2 space-y-0.5 text-[10px]" data-testid={`block-vehicle-${intakeId}`}>
        <p className="font-black uppercase tracking-wider text-gray-700 mb-0.5">Veículo</p>
        {v.placa && <p><span className="font-bold">Placa:</span> {v.placa}</p>}
        {v.renavam && <p><span className="font-bold">Renavam:</span> {v.renavam}</p>}
        <p><span className="font-bold">Marca:</span> {v.marca || <span className="italic text-gray-400">— não informado —</span>}</p>
        <p><span className="font-bold">Modelo:</span> {v.modelo || <span className="italic text-gray-400">— não informado —</span>}</p>
        <p><span className="font-bold">Ano:</span> {v.ano || <span className="italic text-gray-400">— não informado —</span>}</p>
        {v.cor && <p><span className="font-bold">Cor:</span> {v.cor}</p>}
        {v.tecnologia && <p><span className="font-bold">Tecnologia:</span> {v.tecnologia}</p>}
        {v.id_rastreador && <p><span className="font-bold">ID Rastreador:</span> {v.id_rastreador}</p>}
        {v.comunicacao && <p><span className="font-bold">Comunicação:</span> {v.comunicacao}</p>}
      </div>
    );
  };

  const accentBorder = isDhlClient ? '#D40511' : '#d1d5db';
  const titleColor = isDhlClient ? '#7f1d1d' : '#374151';
  const providerChangedUnsaved = !!(
    currentProvider?.trim()
    && savedProvider?.trim()
    && normProvider(currentProvider) !== normProvider(savedProvider)
  );
  const intakeForCurrentProvider = intakes.find(
    (it) => normProvider(it.provider_name) === normProvider(currentProvider)
      && (it.effective_status === 'pendente' || it.effective_status === 'preenchido'),
  );
  const canGenerateLink = !!currentProvider?.trim() && !providerChangedUnsaved;
  const needsLinkForCurrentProvider = canGenerateLink && !intakeForCurrentProvider;
  const sortedIntakes = [...intakes].sort((a, b) => {
    const aCur = normProvider(a.provider_name) === normProvider(currentProvider) ? 0 : 1;
    const bCur = normProvider(b.provider_name) === normProvider(currentProvider) ? 0 : 1;
    return aCur - bCur;
  });

  const renderGenerateButtons = (testIdPrefix: string) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => generateLink('both')}
        disabled={generating !== null || !canGenerateLink}
        title={!canGenerateLink ? (providerChangedUnsaved ? 'Salve a OS com o novo fornecedor antes de gerar o link' : 'Selecione o fornecedor na OS') : 'Gera o link, envia e-mail e prepara mensagem de WhatsApp'}
        className="px-3 h-9 rounded-lg bg-gray-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"
        data-testid={`${testIdPrefix}-both`}
      >
        {generating === 'both' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {generating === 'both' ? 'Gerando...' : 'Gerar link (E-mail + WhatsApp)'}
      </button>
      <button
        type="button"
        onClick={() => generateLink('email')}
        disabled={generating !== null || !canGenerateLink}
        className="px-3 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"
        data-testid={`${testIdPrefix}-email`}
      >
        {generating === 'email' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
        Só e-mail
      </button>
      <button
        type="button"
        onClick={() => generateLink('whatsapp')}
        disabled={generating !== null || !canGenerateLink}
        className="px-3 h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"
        data-testid={`${testIdPrefix}-whatsapp`}
      >
        {generating === 'whatsapp' ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
        Só WhatsApp
      </button>
    </div>
  );

  return (
    <div className="mt-4 pt-4 border-t-2 border-dashed rounded-lg" style={{ borderColor: accentBorder }} data-testid="panel-dhl-timeline">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: titleColor }}>
          {isDhlClient ? 'Cadastro operacional DHL — link externo' : 'Cadastro operacional — link do fornecedor'}
          {intakes.length > 0 && <span className="text-gray-500"> ({intakes.length})</span>}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-2 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
          data-testid="btn-refresh-dhl-timeline"
          title="Atualizar"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Atualizar
        </button>
      </div>

      {errorMsg && (
        <p className="text-[10px] text-red-700 italic mb-2" data-testid="text-dhl-timeline-error">{errorMsg}</p>
      )}
      {successMsg && (
        <p className="text-[10px] text-green-700 italic mb-2" data-testid="text-dhl-timeline-success">{successMsg}</p>
      )}

      {currentProvider?.trim() && (
        <p className="text-[10px] text-gray-700 mb-2" data-testid="text-intake-current-provider">
          <span className="font-black uppercase tracking-wider">Fornecedor na tela:</span>{' '}
          <span className="font-bold">{currentProvider}</span>
          {intakeForCurrentProvider ? (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-black uppercase text-[9px]">
              <CheckCircle2 size={10} /> Link ativo — {intakeForCurrentProvider.effective_status === 'preenchido' ? 'dados recebidos' : 'aguardando preenchimento'}
            </span>
          ) : providerChangedUnsaved ? (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black uppercase text-[9px]">
              <AlertTriangle size={10} /> Fornecedor alterado — salve a OS para gerar link
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900 font-black uppercase text-[9px]">
              <Clock size={10} /> Sem link para este fornecedor
            </span>
          )}
        </p>
      )}

      {providerChangedUnsaved && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-[10px] text-amber-900" data-testid="banner-provider-changed">
          <p className="font-black uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={12} /> Fornecedor alterado nesta OS
          </p>
          <p className="mt-1 font-medium">
            De <b>{savedProvider}</b> para <b>{currentProvider}</b>. Salve as alterações e use os botões abaixo para enviar o link ao <b>novo prestador</b>.
          </p>
        </div>
      )}

      {needsLinkForCurrentProvider && intakes.length > 0 && !providerChangedUnsaved && (
        <div className="mb-3 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200" data-testid="banner-new-provider-link">
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-900 mb-2">
            Gerar link para {currentProvider}
          </p>
          <p className="text-[10px] text-blue-800 mb-2">
            Há links de outros fornecedores nesta OS, mas nenhum ativo para o fornecedor atual. Gere um novo link abaixo.
          </p>
          {renderGenerateButtons('btn-generate-link-new-provider')}
        </div>
      )}

      {loading && intakes.length === 0 ? (
        <p className="text-[10px] text-gray-500 italic" data-testid="text-dhl-timeline-loading">Carregando...</p>
      ) : intakes.length === 0 ? (
        <div className="flex flex-col items-start gap-2" data-testid="empty-dhl-timeline">
          <p className="text-[10px] text-gray-600 italic">
            Nenhum link gerado para esta OS ainda. Gere agora para enviar ao fornecedor por e-mail e WhatsApp — ele cadastra escoltistas e veículo direto no link.
          </p>
          {renderGenerateButtons('btn-generate-link-empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedIntakes.map((it) => {
            const isCurrentProvider = normProvider(it.provider_name) === normProvider(currentProvider);
            const st = it.effective_status;
            const badge = st === 'preenchido'
              ? { bg: 'bg-green-100', fg: 'text-green-800', label: 'Dados inseridos' }
              : st === 'cancelado'
                ? { bg: 'bg-gray-200', fg: 'text-gray-700', label: 'Cancelado' }
                : st === 'expirado'
                  ? { bg: 'bg-orange-100', fg: 'text-orange-800', label: 'Expirado' }
                  : { bg: 'bg-yellow-100', fg: 'text-yellow-800', label: 'Aguardando dados' };
            const url = buildPublicLink(it.token);
            const isExpanded = expandedId === it.id;
            const hasSnapshots = canViewSnapshots && st === 'preenchido' && (it.agent1_snapshot || it.agent2_snapshot || it.vehicle_snapshot);

            return (
              <div key={it.id} className={`bg-white border rounded-lg p-2.5 text-[10px] ${isCurrentProvider ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`} data-testid={`row-dhl-intake-${it.id}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 ${badge.bg} ${badge.fg} font-black uppercase tracking-wider rounded`} data-testid={`status-dhl-intake-${it.id}`}>
                      {badge.label}
                    </span>
                    {isCurrentProvider && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-black uppercase tracking-wider rounded text-[9px]" data-testid={`tag-current-provider-${it.id}`}>
                        Fornecedor atual
                      </span>
                    )}
                  </div>
                  <span className="text-gray-500 font-mono">{it.provider_name || '—'}</span>
                </div>

                {renderTimeline(it)}

                {/* Progresso parcial do cadastro feito pelo fornecedor + contador de aberturas */}
                {(st === 'pendente' || st === 'preenchido') && (() => {
                  const filled = st === 'preenchido';
                  const items: { label: string; ok: boolean }[] = [
                    { label: 'Escoltista 1', ok: filled || !!it.progress_agent1 || !!it.agent1_snapshot },
                    { label: 'Escoltista 2', ok: filled || !!it.progress_agent2 || !!it.agent2_snapshot },
                    { label: 'Veículo', ok: filled || !!it.progress_vehicle || !!it.vehicle_snapshot },
                    { label: 'Espelho', ok: filled || !!it.progress_mirror || !!it.mirror_proof_url },
                  ];
                  const opens = Number(it.open_count) || 0;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100" data-testid={`block-progress-${it.id}`}>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {items.map((c, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${c.ok ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                            data-testid={`chip-progress-${i}-${it.id}`}
                          >
                            {c.ok ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                            {c.label} {c.ok ? 'ok' : 'pendente'}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600" data-testid={`text-opens-${it.id}`}>
                        <span className="font-bold">Aberturas do link:</span> {opens}
                        {opens > 0 && (it.last_opened_at || it.first_opened_at) && (
                          <span className="text-gray-500"> · última em {fmt(it.last_opened_at || it.first_opened_at)}</span>
                        )}
                        {opens === 0 && <span className="text-gray-500"> · fornecedor ainda não abriu</span>}
                      </p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-gray-600">
                  <span><Mail size={10} className="inline mr-1" />{it.sent_to_email || '—'}</span>
                  <span><Phone size={10} className="inline mr-1" />{it.sent_to_phone || '—'}</span>
                  <span>Expira: {fmt(it.expires_at)}</span>
                </div>

                {st === 'pendente' && (() => {
                  const { maxCount, cycleHours } = reminderConfig;
                  const row = (
                    channel: 'email' | 'whatsapp',
                    label: string,
                    Icon: any,
                    count: number,
                    lastSentAt: string | null | undefined,
                    hasTarget: boolean,
                  ) => {
                    if (!hasTarget && count <= 0) return null;
                    const remaining = Math.max(0, maxCount - count);
                    const limitReached = count >= maxCount;
                    let nextLabel = '';
                    if (!limitReached) {
                      if (lastSentAt) {
                        const diffH = (new Date(lastSentAt).getTime() + cycleHours * 3600000 - Date.now()) / 3600000;
                        nextLabel = diffH <= 0 ? 'próximo a qualquer momento' : `próximo em ~${Math.max(1, Math.round(diffH))}h`;
                      } else {
                        nextLabel = 'próximo a qualquer momento';
                      }
                    }
                    return (
                      <li
                        key={channel}
                        className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${limitReached ? 'text-red-700' : 'text-gray-700'}`}
                        data-testid={`reminder-${channel}-${it.id}`}
                      >
                        <Icon size={10} className="inline" />
                        <span className="font-bold">{label}:</span>
                        <span data-testid={`reminder-${channel}-count-${it.id}`}>
                          {count} de {maxCount} lembretes automáticos enviados
                        </span>
                        {limitReached ? (
                          <span
                            className="font-black uppercase tracking-wider text-red-700"
                            data-testid={`reminder-${channel}-limit-${it.id}`}
                          >
                            · limite atingido — reenviar manualmente
                          </span>
                        ) : (
                          <span className="text-gray-500" data-testid={`reminder-${channel}-next-${it.id}`}>
                            · {nextLabel}; restam {remaining}
                          </span>
                        )}
                      </li>
                    );
                  };
                  const emailRow = row('email', 'E-mail', Mail, Number(it.provider_reminder_count) || 0, it.provider_reminder_sent_at, !!it.sent_to_email);
                  const waRow = row('whatsapp', 'WhatsApp', Phone, Number(it.provider_whatsapp_reminder_count) || 0, it.provider_whatsapp_reminder_sent_at, !!it.sent_to_phone);
                  if (!emailRow && !waRow) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100" data-testid={`block-reminders-${it.id}`}>
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-600 mb-1">Lembretes automáticos</p>
                      <ul className="space-y-0.5">{emailRow}{waRow}</ul>
                    </div>
                  );
                })()}

                {/* Link público para o operacional acessar */}
                {(st === 'pendente' || st === 'preenchido') && (() => {
                  const waText = waTextById[it.id] || it.whatsapp_text || '';
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider text-[10px]"
                        data-testid={`link-open-intake-${it.id}`}
                      >
                        <ExternalLink size={11} /> Abrir link do fornecedor
                      </a>
                      <button
                        type="button"
                        onClick={() => copyLink(url)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black uppercase tracking-wider text-[10px]"
                        data-testid={`btn-copy-link-${it.id}`}
                      >
                        {copiedLink === url ? <><Check size={11} className="text-green-600" /> Copiado</> : <><Copy size={11} /> Copiar URL</>}
                      </button>
                      {waText && (
                        <button
                          type="button"
                          onClick={() => copyWaText(it.id, waText)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wider text-[10px]"
                          data-testid={`btn-copy-wa-${it.id}`}
                          title="Copia a mensagem formatada de WhatsApp com link e dados da OS"
                        >
                          {copiedWa === it.id ? <><Check size={11} /> Copiado</> : <><MessageSquare size={11} /> Copiar WhatsApp</>}
                        </button>
                      )}
                      {st === 'pendente' && (
                        <button
                          type="button"
                          onClick={() => generateLink('both')}
                          disabled={generating !== null}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-900 hover:bg-black text-white font-black uppercase tracking-wider text-[10px] disabled:opacity-50"
                          data-testid={`btn-resend-link-${it.id}`}
                          title="Reenvia o link por e-mail e WhatsApp"
                        >
                          {generating === 'both' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                          Reenviar
                        </button>
                      )}
                    </div>
                  );
                })()}

                {hasSnapshots && (
                  <>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 gap-2 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : it.id)}
                          className="text-[10px] font-black uppercase tracking-wider text-red-700 hover:text-red-900 flex items-center gap-1"
                          data-testid={`btn-toggle-intake-details-${it.id}`}
                        >
                          <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          {isExpanded ? 'Ocultar dados do fornecedor' : 'Ver dados preenchidos pelo fornecedor'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverlayId(it.id)}
                          className="text-[10px] font-black uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded flex items-center gap-1"
                          data-testid={`btn-open-overlay-${it.id}`}
                          title="Abrir todos os dados em uma única tela"
                        >
                          <Maximize2 size={11} /> Ver tudo em uma tela
                        </button>
                      </div>
                      {isExpanded && (
                        <button
                          type="button"
                          onClick={() => copySnapshot(it)}
                          className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black uppercase tracking-wider flex items-center gap-1 text-[10px]"
                          data-testid={`btn-copy-intake-${it.id}`}
                        >
                          {copiedId === it.id ? <><Check size={11} className="text-green-600" /> Copiado</> : <><Copy size={11} /> Copiar texto</>}
                        </button>
                      )}
                    </div>
                    {isExpanded && isDhlClient && (
                      <button
                        type="button"
                        onClick={() => copyVinculo(it)}
                        className="mt-3 w-full px-4 h-12 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all border-2 border-yellow-500"
                        data-testid={`btn-solicitar-vinculo-${it.id}`}
                        title="Copia para a área de transferência o texto pronto para solicitar vínculo dos escoltistas e do veículo à DHL"
                      >
                        {copiedVinculoId === it.id
                          ? <><Check size={16} className="text-green-700" /> Texto de vínculo copiado — cole no e-mail/WhatsApp para a DHL</>
                          : <><Send size={16} /> Solicitar vínculo para DHL (Escoltista 1, Escoltista 2 e veículo)</>
                        }
                      </button>
                    )}
                    {isExpanded && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-gray-700 animate-in slide-in-from-top-1 duration-150" data-testid={`details-intake-${it.id}`}>
                        {renderAgent('Escoltista 1', it.agent1_snapshot, 'agent1', it.id)}
                        {renderAgent('Escoltista 2', it.agent2_snapshot, 'agent2', it.id)}
                        {renderVehicle(it.vehicle_snapshot, it.id)}
                        {it.mirror_proof_url && (
                          <div className="md:col-span-3">
                            <a
                              href={it.mirror_proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-black uppercase tracking-wider text-[10px]"
                              data-testid={`link-mirror-proof-${it.id}`}
                            >
                              <Paperclip size={11} /> Print do espelhamento{it.mirror_proof_filename ? ` (${it.mirror_proof_filename})` : ''}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Overlay (sobreposto) com todos os dados em uma única tela ── */}
      {overlayId && (() => {
        const it = intakes.find((x) => x.id === overlayId);
        if (!it) return null;
        const a1 = it.agent1_snapshot;
        const a2 = it.agent2_snapshot;
        const v = it.vehicle_snapshot;
        const end = (a: EscoltistaSnapshot | null | undefined) =>
          a ? [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ') : '';
        const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
          value ? (
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{label}</span>
              <span className="text-[12px] text-gray-900 font-medium break-words">{value}</span>
            </div>
          ) : null;
        const AgentBlock: React.FC<{ titulo: string; a: EscoltistaSnapshot | null | undefined }> = ({ titulo, a }) => (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <User className="w-4 h-4 text-red-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">{titulo}</h3>
            </div>
            {!a ? (
              <p className="text-xs italic text-gray-400">— não informado pelo fornecedor —</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="col-span-2"><Row label="Nome" value={a.nome} /></div>
                <Row label="CPF" value={a.cpf} />
                <Row label="RG / Órgão" value={a.rg ? `${a.rg}${a.orgao_emissor ? ' / ' + a.orgao_emissor : ''}` : null} />
                <Row label="CNH" value={a.cnh ? `${a.cnh}${a.cnh_categoria ? ' (' + a.cnh_categoria + ')' : ''}` : null} />
                <Row label="Venc. CNH" value={fmtDateBr(a.cnh_vencimento)} />
                <Row label="CNV" value={a.cnv_numero} />
                <Row label="Venc. CNV" value={fmtDateBr(a.cnv_validade)} />
                <Row label="Celular" value={a.celular} />
                <Row label="Admissão" value={fmtDateBr(a.admissao)} />
                <div className="col-span-2"><Row label="Endereço" value={end(a)} /></div>
              </div>
            )}
          </div>
        );
        return (
          <div
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setOverlayId(null)}
            data-testid={`overlay-intake-${it.id}`}
          >
            <div
              className="bg-gray-50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 bg-white border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {isDhlClient && (
                    <div className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-black uppercase tracking-wider">DHL</div>
                  )}
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">Dados preenchidos pelo fornecedor</h2>
                    <p className="text-[11px] text-gray-500">{it.provider_name || '—'} · Enviado em {fmt(it.submitted_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isDhlClient && (
                  <button
                    type="button"
                    onClick={() => copyVinculo(it)}
                    className="px-3 h-10 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-black uppercase tracking-wider flex items-center gap-1.5 text-[11px] border-2 border-yellow-500"
                    data-testid={`overlay-btn-vinculo-${it.id}`}
                    title="Copia o texto pronto para solicitar vínculo dos escoltistas e do veículo à DHL"
                  >
                    {copiedVinculoId === it.id
                      ? <><Check size={14} className="text-green-700" /> Vínculo copiado</>
                      : <><Send size={14} /> Solicitar vínculo para DHL</>
                    }
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copySnapshot(it)}
                    className="px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black uppercase tracking-wider flex items-center gap-1 text-[10px]"
                    data-testid={`overlay-btn-copy-${it.id}`}
                  >
                    {copiedId === it.id ? <><Check size={12} className="text-green-600" /> Copiado</> : <><Copy size={12} /> Copiar texto</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlayId(null)}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800"
                    data-testid={`overlay-btn-close-${it.id}`}
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AgentBlock titulo="Escoltista 1" a={a1} />
                  <AgentBlock titulo="Escoltista 2" a={a2} />
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                    <Truck className="w-4 h-4 text-red-600" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">Veículo da escolta</h3>
                  </div>
                  {!v ? (
                    <p className="text-xs italic text-gray-400">— não informado pelo fornecedor —</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
                      <Row label="Placa" value={v.placa} />
                      <Row label="Renavam" value={v.renavam} />
                      <Row label="Marca" value={v.marca} />
                      <Row label="Modelo" value={v.modelo} />
                      <Row label="Ano" value={v.ano} />
                      <Row label="Cor" value={v.cor} />
                      <Row label="Tecnologia" value={v.tecnologia} />
                      <Row label="ID Rastreador" value={v.id_rastreador} />
                      <div className="col-span-2"><Row label="Comunicação" value={v.comunicacao} /></div>
                    </div>
                  )}
                </div>
                {it.mirror_proof_url && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <Paperclip className="w-4 h-4 text-red-600" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">Print do espelhamento</h3>
                    </div>
                    <a
                      href={it.mirror_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-black uppercase tracking-wider text-[11px]"
                      data-testid={`overlay-link-mirror-${it.id}`}
                    >
                      <ExternalLink size={12} /> Abrir comprovante{it.mirror_proof_filename ? ` (${it.mirror_proof_filename})` : ''}
                    </a>
                    {/* Pré-visualização inline da imagem, quando aplicável */}
                    {/\.(png|jpe?g|webp|gif)$/i.test(it.mirror_proof_url) && (
                      <div className="mt-3">
                        <img
                          src={it.mirror_proof_url}
                          alt="Print do espelhamento"
                          className="max-h-[40vh] w-auto rounded-lg border border-gray-200"
                          data-testid={`overlay-img-mirror-${it.id}`}
                        />
                      </div>
                    )}
                  </div>
                )}
                {!a1 && !a2 && !v && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
                    <p className="text-xs font-bold">Nenhum dado foi persistido por este link.</p>
                    <p className="text-[11px] mt-1">Provavelmente este intake foi criado em uma versão antiga do sistema. Gere um novo link para o fornecedor preencher.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DhlIntakeTimeline;
