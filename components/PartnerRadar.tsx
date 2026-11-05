import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Loader2,
  Mail,
  Plus,
  Radar,
  RefreshCw,
  Search,
  UploadCloud,
  Columns3,
  Bot,
  Pause,
  Play,
  Globe,
  Instagram,
  Phone,
  ShieldCheck,
  ShieldAlert,
  ScanSearch,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { useNotification } from '../lib/NotificationContext';
import { digitosCnpj, formatarCnpj, cnpjValido14 } from '../lib/partnerProspects/cnpj';
import { checarDuplicataCnpj, avisoNomeParecido } from '../lib/partnerProspects/dedupe';
import { parseProspectCsv } from '../lib/partnerProspects/csvImport';
import { rotuloStatus } from '../lib/partnerProspects/status';
import type { PartnerProspect, PartnerProspectStatus } from '../lib/partnerProspects/types';
import PartnerProspectEmailModal from './PartnerProspectEmailModal';
import PartnerProspectKanban from './PartnerProspectKanban';
import PartnerHomologation from './PartnerHomologation';

type Tab = 'radar' | 'esteira';

type RobotState = {
  enabled?: boolean | null;
  run_status?: 'running' | 'paused' | string | null;
  current_activity?: string | null;
  last_city?: string | null;
  found_today?: number | null;
  found_today_date?: string | null;
  last_run_at?: string | null;
  last_ufs?: string[] | null;
  last_inserted?: number | null;
  last_error?: string | null;
  cycle_count?: number | null;
};

const emptyForm = {
  cnpj: '',
  company_name: '',
  trade_name: '',
  state_uf: '',
  city: '',
  email: '',
  phone: '',
  contact_name: '',
  notes: '',
};

interface PartnerRadarProps {
  onEditProvider?: (id: string) => void;
}

const PartnerRadar: React.FC<PartnerRadarProps> = ({ onEditProvider }) => {
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<Tab>('radar');
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [items, setItems] = useState<PartnerProspect[]>([]);
  const [providersCnpj, setProvidersCnpj] = useState<{ id: string; cnpj: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [uf, setUf] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [emailTarget, setEmailTarget] = useState<PartnerProspect | null>(null);
  const [homologTarget, setHomologTarget] = useState<PartnerProspect | null>(null);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseProspectCsv>>([]);
  const [importing, setImporting] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [robot, setRobot] = useState<RobotState | null>(null);
  const [robotBusy, setRobotBusy] = useState(false);
  const [novosFlash, setNovosFlash] = useState(0);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [enrichBatchBusy, setEnrichBatchBusy] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('userData') || '{}');
      setCurrentUserName(String(u?.name || ''));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setTableMissing(false);
    try {
      const [prospectsRes, providersRes, robotRes] = await Promise.all([
        supabase.from('partner_prospects').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('providers').select('id, cnpj, name'),
        supabase.from('partner_radar_robot_state').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (prospectsRes.error) {
        const msg = String(prospectsRes.error.message || '');
        if (/partner_prospects|does not exist|schema cache/i.test(msg)) {
          setTableMissing(true);
          setItems([]);
          return;
        }
        throw prospectsRes.error;
      }
      setItems((prospectsRes.data || []) as PartnerProspect[]);
      setProvidersCnpj(
        (providersRes.data || []).map((p: any) => ({
          id: String(p.id),
          cnpj: String(p.cnpj || ''),
          name: String(p.name || ''),
        })),
      );
      if (!robotRes.error && robotRes.data) setRobot(robotRes.data as RobotState);
      else setRobot(null);
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao carregar o Radar', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const robotRunning = robot?.run_status === 'running' && robot?.enabled !== false;

  const robotLabel = useMemo(() => {
    if (!robot) return 'Robô: estado indisponível';
    const cidade = robot.last_city ? ` · ${robot.last_city}` : '';
    if (robotRunning) {
      const hoje = Number(robot.found_today || 0);
      const agora =
        robot.current_activity ||
        (robot.last_city ? `Buscando agora: ${robot.last_city}` : 'Rodando…');
      return `Robô Rodando 24h | ${agora} | ${hoje} encontradas hoje${cidade}`;
    }
    return `Robô Pausado${cidade}`;
  }, [robot, robotRunning]);

  const handleRobotControl = async (action: 'start' | 'pause') => {
    setRobotBusy(true);
    try {
      const res = await authFetch('/api/partner-radar/control', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha no controle do robô');
      showNotification(
        action === 'start' ? 'Robô ligado' : 'Robô pausado',
        action === 'start'
          ? 'Esteira contínua ativa — micro-lotes a cada ~1 minuto.'
          : 'Varredura interrompida.',
        action === 'start' ? 'success' : 'info',
      );
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha', 'error');
    } finally {
      setRobotBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Tempo real: estado do robô + novos prospectos.
  useEffect(() => {
    const ch = supabase
      .channel('partner-radar-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partner_radar_robot_state' },
        (payload) => {
          if (payload.new) setRobot(payload.new as RobotState);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'partner_prospects' },
        (payload) => {
          const row = payload.new as PartnerProspect;
          if (!row?.id) return;
          setItems((prev) => (prev.some((p) => p.id === row.id) ? prev : [row, ...prev]));
          if (row.source === 'robo_24h') {
            setNovosFlash((n) => n + 1);
            setTimeout(() => setNovosFlash((n) => Math.max(0, n - 1)), 8000);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'partner_prospects' },
        (payload) => {
          const row = payload.new as PartnerProspect;
          if (!row?.id) return;
          setItems((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const radarBase = useMemo(() => items.filter((p) => p.status === 'radar'), [items]);

  const ufCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of radarBase) {
      const u = String(p.state_uf || '').toUpperCase() || '—';
      map.set(u, (map.get(u) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [radarBase]);

  const radarItems = useMemo(() => {
    return radarBase.filter((p) => {
      if (uf && String(p.state_uf || '').toUpperCase() !== uf.toUpperCase()) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const dig = digitosCnpj(search);
      const emailsBlob = [...(p.emails || []), p.email || ''].join(' ').toLowerCase();
      return (
        String(p.company_name || '').toLowerCase().includes(q) ||
        String(p.trade_name || '').toLowerCase().includes(q) ||
        emailsBlob.includes(q) ||
        String(p.website || '').toLowerCase().includes(q) ||
        String(p.address_full || '').toLowerCase().includes(q) ||
        (dig.length >= 3 && digitosCnpj(p.cnpj).includes(dig))
      );
    });
  }, [radarBase, search, uf]);

  const esteiraItems = useMemo(
    () => items.filter((p) => !['radar', 'descartado', 'ativo'].includes(p.status)),
    [items],
  );

  const logEvent = async (
    prospectId: string,
    eventType: string,
    fromStatus?: string | null,
    toStatus?: string | null,
    note?: string,
  ) => {
    await supabase.from('partner_prospect_events').insert([
      {
        prospect_id: prospectId,
        event_type: eventType,
        from_status: fromStatus || null,
        to_status: toStatus || null,
        note: note || null,
        created_by: currentUserName || null,
      },
    ]);
  };

  const handleCreate = async () => {
    if (!cnpjValido14(form.cnpj)) {
      showNotification('Atenção', 'CNPJ precisa ter 14 dígitos.', 'warning');
      return;
    }
    if (!form.company_name.trim()) {
      showNotification('Atenção', 'Informe a razão social.', 'warning');
      return;
    }
    const dup = checarDuplicataCnpj(form.cnpj, providersCnpj, items);
    if (!dup.ok) {
      const msg =
        dup.motivo === 'duplicado_fornecedor'
          ? 'CNPJ já existe no cadastro de fornecedores.'
          : dup.motivo === 'duplicado_prospecto'
            ? 'CNPJ já está na fila de prospecção.'
            : 'CNPJ inválido.';
      showNotification('Bloqueado', msg, 'warning');
      return;
    }
    const aviso = avisoNomeParecido(form.company_name, providersCnpj);
    if (aviso) {
      showNotification('Aviso', `Nome parecido com fornecedor: ${aviso.name}. CNPJ diferente — pode seguir.`, 'info');
    }
    setSaving(true);
    try {
      const payload = {
        cnpj: dup.cnpj,
        company_name: form.company_name.trim().toUpperCase(),
        trade_name: form.trade_name.trim().toUpperCase() || null,
        state_uf: form.state_uf.trim().toUpperCase().slice(0, 2) || null,
        city: form.city.trim().toUpperCase() || null,
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        contact_name: form.contact_name.trim() || null,
        notes: form.notes.trim() || null,
        source: 'manual',
        status: 'radar',
        pf_status: 'nao_verificado',
        created_by: currentUserName || null,
        updated_by: currentUserName || null,
      };
      const { data, error } = await supabase.from('partner_prospects').insert([payload]).select('*').single();
      if (error) throw error;
      if (data?.id) await logEvent(data.id, 'criado', null, 'radar', 'Inclusão manual');
      setForm(emptyForm);
      setShowForm(false);
      showNotification('Sucesso', 'Empresa adicionada ao Radar.', 'success');
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async (p: PartnerProspect) => {
    const { error } = await supabase
      .from('partner_prospects')
      .update({ status: 'descartado', updated_by: currentUserName || null, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) {
      showNotification('Erro', error.message, 'error');
      return;
    }
    await logEvent(p.id, 'descartado', p.status, 'descartado');
    showNotification('Arquivado', 'Prospecto descartado.', 'info');
    await load();
  };

  const handleEnrich = async (p: PartnerProspect) => {
    if (!p.website) {
      showNotification('Atenção', 'Sem site para raspar. Preencha o website antes.', 'warning');
      return;
    }
    setEnrichingIds((prev) => new Set(prev).add(p.id));
    try {
      const res = await authFetch(`/api/partner-prospects/${p.id}/enrich`, { method: 'POST', body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha no enriquecimento');
      if (data.prospect) {
        setItems((prev) => prev.map((row) => (row.id === p.id ? { ...row, ...data.prospect } : row)));
      }
      showNotification(
        'Enriquecido',
        `${p.trade_name || p.company_name}: ${data.prospect?.enrichment_status || 'ok'}`,
        'success',
      );
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha ao enriquecer', 'error');
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    }
  };

  const handleEnrichPendingBatch = async () => {
    setEnrichBatchBusy(true);
    try {
      const res = await authFetch('/api/partner-prospects/enrich-pending', {
        method: 'POST',
        body: JSON.stringify({ limit: 40 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha no lote');
      showNotification(
        'Lote concluído',
        `${data.processed || 0} prospecto(s) reprocessado(s)` +
          (data.errors?.length ? ` · ${data.errors.length} erro(s)` : ''),
        'success',
      );
      await load();
    } catch (e: any) {
      showNotification('Erro', e?.message || 'Falha no lote', 'error');
    } finally {
      setEnrichBatchBusy(false);
    }
  };

  const handleMove = async (id: string, status: PartnerProspectStatus) => {
    const atual = items.find((p) => p.id === id);
    if (!atual) return;
    const { error } = await supabase
      .from('partner_prospects')
      .update({ status, updated_by: currentUserName || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      showNotification('Erro', error.message, 'error');
      return;
    }
    await logEvent(id, 'status', atual.status, status);
    await load();
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const rows = parseProspectCsv(text);
    setCsvPreview(rows);
    if (!rows.length) showNotification('Atenção', 'CSV vazio ou sem cabeçalho válido.', 'warning');
  };

  const handleImportCsv = async () => {
    const validos = csvPreview.filter((r) => !r.erro);
    if (!validos.length) {
      showNotification('Atenção', 'Nenhuma linha válida para importar.', 'warning');
      return;
    }
    setImporting(true);
    let ok = 0;
    let skip = 0;
    const jaNaFila: { id: string; cnpj: string }[] = items.map((p) => ({ id: p.id, cnpj: p.cnpj }));
    try {
      for (const row of validos) {
        const dup = checarDuplicataCnpj(row.cnpj, providersCnpj, jaNaFila);
        if (!dup.ok) {
          skip++;
          continue;
        }
        const { data, error } = await supabase
          .from('partner_prospects')
          .insert([
            {
              cnpj: dup.cnpj,
              company_name: row.company_name.trim().toUpperCase(),
              trade_name: row.trade_name?.trim().toUpperCase() || null,
              state_uf: row.state_uf || null,
              city: row.city?.trim().toUpperCase() || null,
              email: row.email?.trim().toLowerCase() || null,
              phone: row.phone?.trim() || null,
              website: row.website?.trim() || null,
              contact_name: row.contact_name?.trim() || null,
              pf_authorization_number: row.pf_authorization_number || null,
              pf_status: row.pf_status || 'nao_verificado',
              notes: row.notes || null,
              source: 'csv',
              status: 'radar',
              created_by: currentUserName || null,
            },
          ])
          .select('id')
          .single();
        if (error) {
          skip++;
          continue;
        }
        if (data?.id) {
          await logEvent(data.id, 'import_csv', null, 'radar');
          jaNaFila.push({ id: data.id, cnpj: dup.cnpj });
        }
        ok++;
      }
      showNotification('Importação', `${ok} incluído(s), ${skip} ignorado(s) (duplicata/erro).`, 'success');
      setCsvPreview([]);
      await load();
    } finally {
      setImporting(false);
    }
  };

  const handleNotes = async (p: PartnerProspect) => {
    const note = window.prompt('Nota da prospecção:', p.notes || '');
    if (note === null) return;
    const { error } = await supabase
      .from('partner_prospects')
      .update({ notes: note, updated_by: currentUserName || null, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) showNotification('Erro', error.message, 'error');
    else {
      await logEvent(p.id, 'nota', p.status, p.status, note.slice(0, 200));
      await load();
    }
  };

  if (tableMissing) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-6">
          <h2 className="text-sm font-black uppercase text-amber-900">Radar de Parceiros</h2>
          <p className="text-sm text-amber-800 mt-2">
            A tabela <code className="font-mono">partner_prospects</code> ainda não existe no Supabase.
            Aplique a migration <code className="font-mono">migrations/2026_11_05_partner_prospects.sql</code> no
            projeto <code className="font-mono">ajhmmjuewdsukecaimik</code> e recarregue esta tela.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Radar className="text-red-700" size={22} /> Radar de Parceiros
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Prospecção de escolta. Homologação cria fornecedor Bloqueado — tabela de custo no cadastro oficial.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1 border ${
                robotRunning
                  ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                  : 'text-amber-900 bg-amber-50 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${robotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}
              />
              <Bot size={13} /> {robotLabel}
            </span>
            {novosFlash > 0 ? (
              <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                +{novosFlash} novo(s) do robô
              </span>
            ) : null}
          </div>
          {robot?.last_error ? (
            <p className="text-[10px] text-amber-700 mt-1 truncate" title={robot.last_error}>
              Último aviso do robô: {robot.last_error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {robotRunning ? (
            <button
              type="button"
              disabled={robotBusy}
              onClick={() => void handleRobotControl('pause')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {robotBusy ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
              Pausar Robô
            </button>
          ) : (
            <button
              type="button"
              disabled={robotBusy}
              onClick={() => void handleRobotControl('start')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {robotBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Ligar Robô Contínuo
            </button>
          )}
          <button
            type="button"
            disabled={enrichBatchBusy}
            onClick={() => void handleEnrichPendingBatch()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60"
            title="Reprocessa pending/partial com site"
          >
            {enrichBatchBusy ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
            Enrich pending
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-red-700 text-white hover:bg-red-800"
          >
            <Plus size={14} /> Incluir
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('radar')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wide border-b-2 ${tab === 'radar' ? 'border-red-700 text-red-700' : 'border-transparent text-gray-500'}`}
        >
          Radar ({items.filter((i) => i.status === 'radar').length})
        </button>
        <button
          type="button"
          onClick={() => setTab('esteira')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wide border-b-2 inline-flex items-center gap-1 ${tab === 'esteira' ? 'border-red-700 text-red-700' : 'border-transparent text-gray-500'}`}
        >
          <Columns3 size={14} /> Esteira ({esteiraItems.length})
        </button>
      </div>

      {showForm ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              ['cnpj', 'CNPJ'],
              ['company_name', 'Razão social'],
              ['trade_name', 'Nome fantasia'],
              ['state_uf', 'UF'],
              ['city', 'Cidade'],
              ['email', 'E-mail'],
              ['phone', 'Telefone'],
              ['contact_name', 'Responsável'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="text-[10px] font-bold uppercase text-gray-500">{label}</label>
              <input
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-3">
            <label className="text-[10px] font-bold uppercase text-gray-500">Notas</label>
            <input
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-xs font-bold text-gray-600">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreate()}
              className="inline-flex items-center gap-1 px-4 py-2 text-xs font-bold bg-red-700 text-white rounded-lg disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar no Radar
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'radar' ? (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-[11px] font-black uppercase text-gray-500">Importar CSV</p>
            <p className="text-xs text-gray-500">
              Cabeçalhos: cnpj; razao_social; nome_fantasia; uf; cidade; email; telefone; contato; portaria_pf
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleCsvFile(e.target.files?.[0] || null)}
              className="text-xs"
            />
            {csvPreview.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  {csvPreview.filter((r) => !r.erro).length} válida(s) · {csvPreview.filter((r) => r.erro).length} com erro
                </p>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleImportCsv()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-700 text-white disabled:opacity-60"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  Importar válidas
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setUf('')}
              className={`text-[10px] font-black uppercase tracking-wide rounded-lg px-2.5 py-1 border ${
                !uf ? 'bg-red-700 text-white border-red-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Todos ({radarBase.length})
            </button>
            {ufCounts.map(([u, n]) => (
              <button
                key={u}
                type="button"
                onClick={() => setUf(u === '—' ? '' : u)}
                className={`text-[10px] font-black uppercase tracking-wide rounded-lg px-2.5 py-1 border ${
                  uf.toUpperCase() === u
                    ? 'bg-red-700 text-white border-red-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {u} ({n})
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Buscar razão, fantasia, CNPJ, e-mail, site…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="animate-spin text-red-700" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-black">
                    <tr>
                      <th className="px-3 py-2">Empresa</th>
                      <th className="px-3 py-2">CNPJ</th>
                      <th className="px-3 py-2">Contatos</th>
                      <th className="px-3 py-2">Canais</th>
                      <th className="px-3 py-2">PF / Alvará</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radarItems.map((p) => {
                      const emailsList = [
                        ...new Set(
                          [...(p.emails || []), p.email || '']
                            .map((e) => String(e || '').trim().toLowerCase())
                            .filter((e) => e.includes('@')),
                        ),
                      ].slice(0, 5);
                      const endereco =
                        p.address_full ||
                        [p.address_street, p.address_number, p.address_district, p.city, p.state_uf, p.address_cep]
                          .filter(Boolean)
                          .join(', ') ||
                        [p.city, p.state_uf].filter(Boolean).join(' / ');
                      const cnpjOk = !!(p.cnpj && p.cnpj_verified_at);
                      const pfOk = p.pf_status === 'regular' || !!p.pf_authorization_number;
                      return (
                        <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                          <td className="px-3 py-2.5 max-w-[280px]">
                            <div className="font-bold text-gray-800 text-xs">
                              {p.trade_name || p.company_name}
                            </div>
                            {p.trade_name ? (
                              <div className="text-[10px] text-gray-500">{p.company_name}</div>
                            ) : null}
                            {endereco ? (
                              <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{endereco}</div>
                            ) : null}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.source === 'robo_24h' ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                  <Bot size={10} /> Robô 24h
                                </span>
                              ) : null}
                              {p.enrichment_status && p.enrichment_status !== 'complete' ? (
                                <span className="text-[9px] font-black uppercase text-slate-600 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                                  Enrich: {p.enrichment_status}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-xs">{p.cnpj ? formatarCnpj(p.cnpj) : '—'}</div>
                            {p.cnpj ? (
                              <span
                                className={`mt-1 inline-flex text-[9px] font-black uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                                  cnpjOk
                                    ? 'text-emerald-800 bg-emerald-50 border-emerald-100'
                                    : 'text-amber-800 bg-amber-50 border-amber-100'
                                }`}
                              >
                                {cnpjOk ? 'Verificado Receita' : 'Pendente'}
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex text-[9px] font-black uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                                Pendente de CNPJ
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {p.phone ? (
                              <div className="inline-flex items-center gap-1 text-gray-800">
                                <Phone size={12} className="text-gray-400" /> {p.phone}
                              </div>
                            ) : (
                              <div className="text-gray-400">Sem telefone</div>
                            )}
                            {emailsList.length ? (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[10px] font-bold text-indigo-700">
                                  {emailsList.length} e-mail(s)
                                </summary>
                                <ul className="mt-1 space-y-0.5 text-[10px] font-mono text-gray-600">
                                  {emailsList.map((e) => (
                                    <li key={e}>{e}</li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <div className="text-[10px] text-gray-400 mt-0.5">Sem e-mails</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {p.website ? (
                                <a
                                  href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  title={p.website}
                                >
                                  <Globe size={14} />
                                </a>
                              ) : (
                                <span className="w-7 h-7 rounded-lg border border-dashed border-gray-200 inline-flex items-center justify-center text-gray-300">
                                  <Globe size={14} />
                                </span>
                              )}
                              {p.instagram ? (
                                <a
                                  href={
                                    p.instagram.startsWith('http')
                                      ? p.instagram
                                      : `https://instagram.com/${p.instagram.replace(/^@/, '')}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-pink-100 text-pink-600 hover:bg-pink-50"
                                  title={p.instagram}
                                >
                                  <Instagram size={14} />
                                </a>
                              ) : (
                                <span className="w-7 h-7 rounded-lg border border-dashed border-gray-200 inline-flex items-center justify-center text-gray-300">
                                  <Instagram size={14} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {pfOk ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                                <ShieldCheck size={11} /> Autorizada PF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                <ShieldAlert size={11} /> Não verificado
                              </span>
                            )}
                            {p.pf_authorization_number ? (
                              <div className="text-[10px] text-gray-500 mt-1 font-mono">
                                {p.pf_authorization_number}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                disabled={enrichingIds.has(p.id) || !p.website}
                                title={!p.website ? 'Sem site para raspar' : 'Raspar site + IA agora'}
                                onClick={() => void handleEnrich(p)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-indigo-700 text-white disabled:opacity-50"
                              >
                                {enrichingIds.has(p.id) ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <ScanSearch size={12} />
                                )}
                                Enriquecer com IA
                              </button>
                              <button
                                type="button"
                                onClick={() => setEmailTarget(p)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-red-700 text-white"
                              >
                                <Mail size={12} /> Enviar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDiscard(p)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-gray-100 text-gray-700"
                              >
                                <Archive size={12} /> Descartar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!radarItems.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                          Nenhum prospecto no Radar. Inclua manualmente ou importe um CSV.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <PartnerProspectKanban
          items={esteiraItems}
          onMove={handleMove}
          onHomologar={setHomologTarget}
          onNotes={handleNotes}
        />
      )}

      {emailTarget ? (
        <PartnerProspectEmailModal
          prospect={emailTarget}
          senderName={currentUserName}
          onClose={() => setEmailTarget(null)}
          onSent={async () => {
            setEmailTarget(null);
            setTab('esteira');
            await load();
          }}
        />
      ) : null}

      {homologTarget ? (
        <PartnerHomologation
          prospect={homologTarget}
          onClose={() => setHomologTarget(null)}
          onDone={async (providerId) => {
            setHomologTarget(null);
            await load();
            if (providerId && onEditProvider) onEditProvider(providerId);
          }}
        />
      ) : null}

      {items.some((i) => i.status === 'ativo') ? (
        <p className="text-[10px] text-gray-400">
          Homologados nesta sessão: {items.filter((i) => i.status === 'ativo').length} · status {rotuloStatus('ativo')}
        </p>
      ) : null}
    </div>
  );
};

export default PartnerRadar;
