import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '../lib/authFetch';
import {
  Mail, Phone, Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ExternalLink, Paperclip, Copy, Check, RefreshCw, Loader2,
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
}

interface DhlReminderConfig { maxCount: number; cycleHours: number; }

interface Props {
  missionId: string;
  canViewSnapshots?: boolean;
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

const DhlIntakeTimeline: React.FC<Props> = ({ missionId, canViewSnapshots = true }) => {
  const [intakes, setIntakes] = useState<DhlIntakeRow[]>([]);
  const [reminderConfig, setReminderConfig] = useState<DhlReminderConfig>({ maxCount: 3, cycleHours: 12 });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const r = await authFetch(`/api/dhl/intake/by-mission/${encodeURIComponent(missionId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErrorMsg(j?.error || 'Não foi possível carregar o painel DHL.');
        setIntakes([]);
        return;
      }
      const j = await r.json();
      setIntakes(Array.isArray(j?.intakes) ? j.intakes : []);
      if (j?.reminderConfig && typeof j.reminderConfig.maxCount === 'number' && typeof j.reminderConfig.cycleHours === 'number') {
        setReminderConfig({ maxCount: j.reminderConfig.maxCount, cycleHours: j.reminderConfig.cycleHours });
      }
    } catch {
      setErrorMsg('Falha de conexão ao carregar painel DHL.');
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
      if (a.cnh) lines.push(`CNH: ${a.cnh}${a.cnh_categoria ? ' (' + a.cnh_categoria + ')' : ''}${a.cnh_vencimento ? ' — venc.: ' + a.cnh_vencimento : ''}`);
      if (a.cnv_numero) lines.push(`CNV: ${a.cnv_numero}${a.cnv_validade ? ' — venc.: ' + a.cnv_validade : ''}`);
      if (a.celular) lines.push(`Celular: ${a.celular}`);
      const end = [a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', ');
      if (end) lines.push(`Endereço: ${end}`);
      if (a.admissao) lines.push(`Admissão: ${a.admissao}`);
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
        {a.cnh && <p><span className="font-bold">CNH:</span> {a.cnh}{a.cnh_categoria ? ` (${a.cnh_categoria})` : ''}{a.cnh_vencimento ? ` — venc.: ${a.cnh_vencimento}` : ''}</p>}
        {a.cnv_numero && <p><span className="font-bold">CNV:</span> {a.cnv_numero}{a.cnv_validade ? ` — venc.: ${a.cnv_validade}` : ''}</p>}
        {a.celular && <p><span className="font-bold">Celular:</span> {a.celular}</p>}
        {end && <p><span className="font-bold">Endereço:</span> {end}</p>}
        {a.admissao && <p><span className="font-bold">Admissão:</span> {a.admissao}</p>}
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
        {(v.marca || v.modelo || v.ano) && <p><span className="font-bold">Marca/Modelo/Ano:</span> {[v.marca, v.modelo, v.ano].filter(Boolean).join(' / ')}</p>}
        {v.cor && <p><span className="font-bold">Cor:</span> {v.cor}</p>}
        {v.tecnologia && <p><span className="font-bold">Tecnologia:</span> {v.tecnologia}</p>}
        {v.id_rastreador && <p><span className="font-bold">ID Rastreador:</span> {v.id_rastreador}</p>}
        {v.comunicacao && <p><span className="font-bold">Comunicação:</span> {v.comunicacao}</p>}
      </div>
    );
  };

  return (
    <div className="mt-4 pt-4 border-t-2 border-dashed rounded-lg" style={{ borderColor: '#D40511' }} data-testid="panel-dhl-timeline">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#7f1d1d' }}>
          Acompanhamento DHL {intakes.length > 0 && <span className="text-gray-500">({intakes.length})</span>}
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

      {loading && intakes.length === 0 ? (
        <p className="text-[10px] text-gray-500 italic" data-testid="text-dhl-timeline-loading">Carregando...</p>
      ) : intakes.length === 0 ? (
        <p className="text-[10px] text-gray-500 italic" data-testid="text-dhl-timeline-empty">
          Nenhum link gerado para esta OS ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {intakes.map((it) => {
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
              <div key={it.id} className="bg-white border border-gray-200 rounded-lg p-2.5 text-[10px]" data-testid={`row-dhl-intake-${it.id}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`px-2 py-0.5 ${badge.bg} ${badge.fg} font-black uppercase tracking-wider rounded`} data-testid={`status-dhl-intake-${it.id}`}>
                    {badge.label}
                  </span>
                  <span className="text-gray-500 font-mono">{it.provider_name || '—'}</span>
                </div>

                {renderTimeline(it)}

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
                {(st === 'pendente' || st === 'preenchido') && (
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
                  </div>
                )}

                {hasSnapshots && (
                  <>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : it.id)}
                        className="text-[10px] font-black uppercase tracking-wider text-red-700 hover:text-red-900 flex items-center gap-1"
                        data-testid={`btn-toggle-intake-details-${it.id}`}
                      >
                        <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        {isExpanded ? 'Ocultar dados do fornecedor' : 'Ver dados preenchidos pelo fornecedor'}
                      </button>
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
    </div>
  );
};

export default DhlIntakeTimeline;
