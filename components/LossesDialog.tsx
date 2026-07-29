import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, TrendingDown, Download, ExternalLink, AlertTriangle, Search, Layers, Link2, MailWarning } from 'lucide-react';
import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { canRequestOsAnalysis } from '../lib/osAnalysisAccess';
import RequestOsAnalysisModal, { type RequestOsAnalysisPayload } from './RequestOsAnalysisModal';
import {
  computeCanonicalRevenueCost,
  getCanonicalDateRange,
  filterMissionsByPeriod,
  type CanonicalPeriod,
} from '../lib/missionFinancialsCanonical';
import {
  buildChildrenByParentId,
  collectLinkedFamilyIds,
  isLinkedChildMission,
} from '../lib/missionLinkage';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  missions: any[];
  clientTables: ClientPriceTable[];
  providerTables: ProviderCostTable[];
  clientsData: Client[];
  viewPeriod: string;
  customStartDate?: string;
  customEndDate?: string;
  onOpenMission: (m: Mission) => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIOD_LABEL: Record<string, string> = {
  TODAY: 'Hoje', YESTERDAY: 'Ontem', WEEK: 'Esta Semana',
  MONTH: 'Este Mês', YEAR: 'Este Ano', CUSTOM: 'Período Customizado', ALL: 'Tudo',
};

type Row = {
  m: any;
  rev: number;
  cost: number;
  loss: number;       // cost - rev
  marginPct: number;  // (rev - cost) / rev * 100  (negativo no prejuízo)
  /** Entrou na lista só por vínculo (mãe/filha), não por prejuízo próprio. */
  linkedOnly: boolean;
};

const LINKED_SELECT =
  'id,client,provider,status,origin,destination,is_same_os,parent_mission_id,revenue_value,cost_value,start_time,created_at,billing_approved,total_distance_km'

const LossesDialog: React.FC<Props> = ({
  isOpen, onClose, missions, clientTables, providerTables, clientsData,
  viewPeriod, customStartDate, customEndDate, onOpenMission,
}) => {
  const [includeLowMargin, setIncludeLowMargin] = useState(false);
  const [search, setSearch] = useState('');
  // Popover de OS Mãe (hover no desktop + clique para mobile/touch).
  const [hoverParent, setHoverParent] = useState<{ id: string; top: number; left: number } | null>(null);
  /** OS vinculadas buscadas no Supabase sem filtro de cliente (completam o pool local). */
  const [extraLinked, setExtraLinked] = useState<any[]>([]);
  const [requestAnalysisOpen, setRequestAnalysisOpen] = useState(false);
  const [requestAnalysisPayload, setRequestAnalysisPayload] = useState<RequestOsAnalysisPayload | null>(null);
  const canAskAnalysis = useMemo(() => {
    try {
      return canRequestOsAnalysis(JSON.parse(localStorage.getItem('userData') || '{}'));
    } catch {
      return false;
    }
  }, []);

  const refs = useMemo(
    () => ({ clientTables, providerTables, clientsData }),
    [clientTables, providerTables, clientsData],
  );

  // Pool completo: missões da tela + vínculos trazidos do banco (qualquer cliente).
  const missionPool = useMemo(() => {
    const byId = new Map<string, any>();
    for (const m of missions || []) {
      if (m?.id) byId.set(String(m.id), m);
    }
    for (const m of extraLinked) {
      if (m?.id && !byId.has(String(m.id))) byId.set(String(m.id), m);
    }
    return Array.from(byId.values());
  }, [missions, extraLinked]);

  // Mapa OS Mãe -> filhas (qualquer cliente).
  const childrenByParent = useMemo(
    () => buildChildrenByParentId(missionPool),
    [missionPool],
  );

  // Ao abrir: para cada OS com prejuízo no período, busca mãe/filhas no banco
  // SEM filtrar por cliente — garante que vínculo de outro cliente apareça.
  useEffect(() => {
    if (!isOpen) {
      setExtraLinked([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      const allowed: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
      const period = (allowed.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY') as CanonicalPeriod;
      const [start, end] = getCanonicalDateRange(period, customStartDate, customEndDate);
      const inPeriod = filterMissionsByPeriod(missions || [], start, end);
      const localRefs = { clientTables, providerTables, clientsData };
      const anchorIds: string[] = [];
      for (const m of inPeriod) {
        if (m.status === MissionStatus.REFUSED) continue;
        const r = computeCanonicalRevenueCost(m, localRefs);
        if (r.rev <= 0 && r.cost <= 0) continue;
        const loss = r.cost - r.rev;
        const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
        if (loss > 0 || (includeLowMargin && marginPct < 10)) {
          anchorIds.push(String(m.id));
          if (isLinkedChildMission(m) && m.parent_mission_id) {
            anchorIds.push(String(m.parent_mission_id));
          }
        }
      }
      // Também âncoras que já são mães no pool local
      for (const m of missions || []) {
        if (m?.is_same_os && m?.parent_mission_id) {
          anchorIds.push(String(m.parent_mission_id));
        }
      }
      const uniqueAnchors = [...new Set(anchorIds.filter(Boolean))];
      if (uniqueAnchors.length === 0) {
        if (!cancelled) setExtraLinked([]);
        return;
      }

      const fetched: any[] = [];
      const seen = new Set<string>();

      // Mães por id
      for (let i = 0; i < uniqueAnchors.length; i += 40) {
        const chunk = uniqueAnchors.slice(i, i + 40);
        const { data, error } = await supabase
          .from('missions')
          .select(LINKED_SELECT)
          .in('id', chunk);
        if (error) {
          console.warn('[LossesDialog] falha ao buscar OS mães vinculadas:', error.message);
          continue;
        }
        for (const row of data || []) {
          if (row?.id && !seen.has(row.id)) {
            seen.add(row.id);
            fetched.push(row);
          }
        }
      }

      // Filhas de cada âncora (e das mães encontradas) — sem filtro de cliente
      const parentIds = [...new Set([
        ...uniqueAnchors,
        ...fetched.map((r) => String(r.id)),
        ...fetched.filter((r) => r.parent_mission_id).map((r) => String(r.parent_mission_id)),
      ])];
      for (let i = 0; i < parentIds.length; i += 40) {
        const chunk = parentIds.slice(i, i + 40);
        const { data, error } = await supabase
          .from('missions')
          .select(LINKED_SELECT)
          .in('parent_mission_id', chunk);
        if (error) {
          console.warn('[LossesDialog] falha ao buscar OS filhas vinculadas:', error.message);
          continue;
        }
        for (const row of data || []) {
          if (row?.id && !seen.has(row.id)) {
            seen.add(row.id);
            fetched.push(row);
          }
        }
      }

      if (!cancelled) setExtraLinked(fetched);
    };

    void run();
    return () => { cancelled = true; };
  }, [isOpen, missions, clientTables, providerTables, clientsData, viewPeriod, customStartDate, customEndDate, includeLowMargin]);

  // Pequeno atraso ao fechar para permitir mover o mouse do selo até o popover.
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setHoverParent(null), 150); };
  const toggleParentPopover = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    cancelClose();
    if (hoverParent?.id === id) { setHoverParent(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverParent({ id, top: rect.bottom + 6, left: rect.left });
  };
  const openParentPopover = (id: string, e: React.MouseEvent) => {
    cancelClose();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverParent({ id, top: rect.bottom + 6, left: rect.left });
  };

  const rows: Row[] = useMemo(() => {
    if (!isOpen) return [];
    const allowed: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
    const period = (allowed.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY') as CanonicalPeriod;
    const [start, end] = getCanonicalDateRange(period, customStartDate, customEndDate);
    const inPeriod = filterMissionsByPeriod(missions || [], start, end);
    const out: Row[] = [];
    const lossIds = new Set<string>();

    for (const m of inPeriod) {
      if (m.status === MissionStatus.REFUSED) continue;
      const r = computeCanonicalRevenueCost(m, refs);
      if (r.rev <= 0 && r.cost <= 0) continue;
      const loss = r.cost - r.rev;
      const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
      if (loss > 0 || (includeLowMargin && marginPct < 10)) {
        out.push({ m, rev: r.rev, cost: r.cost, loss, marginPct, linkedOnly: false });
        lossIds.add(String(m.id));
      }
    }

    // Inclui mãe/filhas vinculadas (qualquer cliente), mesmo sem prejuízo próprio.
    const familyIds = collectLinkedFamilyIds(lossIds, missionPool);
    const already = new Set(out.map((r) => String(r.m.id)));
    for (const id of familyIds) {
      if (already.has(id)) continue;
      const m = missionPool.find((x) => String(x.id) === id);
      if (!m || m.status === MissionStatus.REFUSED) continue;
      const r = computeCanonicalRevenueCost(m, refs);
      const cost = m.is_same_os ? 0 : r.cost;
      const loss = cost - r.rev;
      const marginPct = r.rev > 0 ? ((r.rev - cost) / r.rev) * 100 : (cost > 0 ? -100 : 0);
      out.push({ m, rev: r.rev, cost, loss, marginPct, linkedOnly: true });
      already.add(id);
    }

    out.sort((a, b) => {
      // Prejuízo próprio primeiro; vínculos depois. Dentro de cada grupo, maior prejuízo.
      if (a.linkedOnly !== b.linkedOnly) return a.linkedOnly ? 1 : -1;
      return b.loss - a.loss;
    });
    return out;
  }, [isOpen, missions, missionPool, refs, viewPeriod, customStartDate, customEndDate, includeLowMargin]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    // Busca casa uma OS — e mantém a família vinculada junto (independente do cliente).
    const matchedIds = new Set<string>();
    for (const r of rows) {
      const id = String(r.m.id || '').toUpperCase();
      const cli = String(r.m.client || '').toUpperCase();
      const prov = String(r.m.provider || '').toUpperCase();
      if (id.includes(q) || cli.includes(q) || prov.includes(q)) matchedIds.add(String(r.m.id));
    }
    const withFamily = collectLinkedFamilyIds(matchedIds, missionPool);
    return rows.filter((r) => withFamily.has(String(r.m.id)));
  }, [rows, search, missionPool]);

  const totals = useMemo(() => {
    // Totais financeiros só das OS com prejuízo/margem baixa próprios (não inflar com só-vinculadas).
    const lossRows = filteredRows.filter((r) => !r.linkedOnly);
    const t = { count: lossRows.length, linkedCount: filteredRows.filter((r) => r.linkedOnly).length, rev: 0, cost: 0, loss: 0 };
    for (const r of lossRows) { t.rev += r.rev; t.cost += r.cost; t.loss += Math.max(0, r.loss); }
    return t;
  }, [filteredRows]);

  // Valores de cada OS filha do popover aberto (custo zero para continuidade/is_same_os).
  const openParentDetail = useMemo(() => {
    if (!hoverParent) return null;
    const kids = childrenByParent.get(hoverParent.id) || [];
    const children = kids.map((k) => {
      const cr = computeCanonicalRevenueCost(k as any, refs);
      const cost = k.is_same_os ? 0 : cr.cost;
      return {
        id: String(k.id),
        status: String(k.status || '—'),
        client: String(k.client || ''),
        rev: cr.rev,
        cost,
        margin: cr.rev - cost,
      };
    });
    const motherMission = missionPool.find((m) => m?.id === hoverParent.id);
    const motherCr = motherMission ? computeCanonicalRevenueCost(motherMission, refs) : { rev: 0, cost: 0 };
    const motherRev = motherCr.rev;
    const motherCost = motherCr.cost;
    const groupRev = motherRev + children.reduce((s, c) => s + c.rev, 0);
    const groupCost = motherCost + children.reduce((s, c) => s + c.cost, 0);
    return { children, motherRev, motherCost, groupRev, groupCost, groupMargin: groupRev - groupCost };
  }, [hoverParent, childrenByParent, refs, missionPool]);

  const exportCsv = () => {
    const header = ['OS', 'Cliente', 'Fornecedor', 'Status', 'Vinculo', 'Origem', 'Destino', 'KM', 'Receita', 'Custo', 'Prejuizo', 'Margem%'];
    const lines = [header.join(';')];
    for (const r of filteredRows) {
      const vinculo = r.linkedOnly
        ? (isLinkedChildMission(r.m) ? 'FILHA' : 'VINCULADA')
        : ((childrenByParent.get(String(r.m.id)) || []).length > 0 ? 'MAE' : '');
      lines.push([
        r.m.id || '',
        (r.m.client || '').replace(/;/g, ','),
        (r.m.provider || '').replace(/;/g, ','),
        r.m.status || '',
        vinculo,
        (r.m.origin || '').replace(/;/g, ',').slice(0, 80),
        (r.m.destination || '').replace(/;/g, ',').slice(0, 80),
        String(r.m.total_distance || r.m.totalDistance || ''),
        r.rev.toFixed(2).replace('.', ','),
        r.cost.toFixed(2).replace('.', ','),
        r.linkedOnly ? '' : r.loss.toFixed(2).replace('.', ','),
        r.marginPct.toFixed(1).replace('.', ','),
      ].join(';'));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `os-com-prejuizo-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const allowedLbl: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
  const effectivePeriod = (allowedLbl.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY');
  const periodLabel = PERIOD_LABEL[effectivePeriod] || effectivePeriod;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" data-testid="dialog-losses">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-md">
              <TrendingDown size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">OS com Prejuízo</h2>
              <p className="text-xs text-gray-600">
                Período: <span className="font-semibold">{periodLabel}</span> — custo do fornecedor maior que a receita do cliente.
                OS vinculadas aparecem mesmo com cliente diferente.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/60 text-gray-500 hover:text-gray-800 transition" data-testid="button-close-losses">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por OS, cliente ou fornecedor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              data-testid="input-search-losses"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeLowMargin}
              onChange={e => setIncludeLowMargin(e.target.checked)}
              className="rounded border-gray-300"
              data-testid="checkbox-include-low-margin"
            />
            Incluir margem baixa (&lt; 10%)
          </label>
          <button
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-lg transition"
            data-testid="button-export-losses"
          >
            <Download size={14} /> CSV
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-red-50/50 border-b border-red-100">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <AlertTriangle size={14} className="text-red-600" />
            <span className="font-bold text-red-700">{totals.count}</span>
            <span className="text-gray-700">{totals.count === 1 ? 'OS' : 'OSs'} com prejuízo</span>
            {totals.linkedCount > 0 && (
              <span className="text-amber-800 text-xs font-semibold" data-testid="text-linked-count">
                + {totals.linkedCount} vinculada{totals.linkedCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-600">Receita: <span className="font-bold text-gray-900">{fmt(totals.rev)}</span></span>
            <span className="text-gray-600">Custo: <span className="font-bold text-gray-900">{fmt(totals.cost)}</span></span>
            <span className="text-red-700 font-bold">Prejuízo total: {fmt(totals.loss)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
              <TrendingDown size={42} className="text-emerald-400 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Nenhuma OS com prejuízo no período.</p>
              <p className="text-xs text-gray-500 mt-1">Todas as missões cobriram seu custo de fornecedor.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-200 shadow-sm z-10">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">OS</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Fornecedor</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Receita</th>
                  <th className="px-3 py-2.5 text-right">Custo</th>
                  <th className="px-3 py-2.5 text-right">Prejuízo</th>
                  <th className="px-3 py-2.5 text-right">Margem</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const isLoss = !r.linkedOnly && r.loss > 0;
                  const childCount = (childrenByParent.get(r.m.id) || []).length;
                  const isMother = childCount > 0;
                  const isChild = isLinkedChildMission(r.m);
                  return (
                    <tr
                      key={r.m.id}
                      className={`border-b border-gray-100 transition ${r.linkedOnly ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-red-50/40'}`}
                      data-testid={`row-loss-${r.m.id}`}
                      data-linked-only={r.linkedOnly ? 'true' : 'false'}
                    >
                      <td className="px-4 py-2 font-mono font-bold text-gray-900 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{r.m.id}</span>
                          {isMother && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black uppercase tracking-wide cursor-help select-none"
                              onMouseEnter={(e) => openParentPopover(r.m.id, e)}
                              onMouseLeave={scheduleClose}
                              onClick={(e) => toggleParentPopover(r.m.id, e)}
                              data-testid={`badge-mother-${r.m.id}`}
                            >
                              <Layers size={9} /> OS MÃE
                              <span className="bg-amber-600 text-white rounded-full px-1 leading-none">{childCount}</span>
                            </span>
                          )}
                          {isChild && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300 text-[9px] font-black uppercase tracking-wide"
                              title={`Vinculada à OS mãe ${r.m.parent_mission_id}`}
                              data-testid={`badge-child-${r.m.id}`}
                            >
                              <Link2 size={9} /> FILHA
                            </span>
                          )}
                          {r.linkedOnly && !isChild && !isMother && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 text-[9px] font-black uppercase">
                              VINCULADA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={r.m.client || ''}>{r.m.client || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={r.m.provider || ''}>{r.m.provider || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">{r.m.status || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.rev)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.cost)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${isLoss ? 'text-red-700' : 'text-gray-400'}`} data-testid={`text-loss-${r.m.id}`}>
                        {isLoss ? fmt(r.loss) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${r.marginPct < 0 ? 'text-red-700' : r.marginPct < 10 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {r.marginPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          {canAskAnalysis && (
                            <button
                              type="button"
                              onClick={() => {
                                setRequestAnalysisPayload({
                                  missionId: r.m.id,
                                  client: r.m.client,
                                  provider: r.m.provider,
                                  revenueBefore: r.rev,
                                  costBefore: r.cost,
                                  resultBefore: r.rev - r.cost,
                                  source: 'losses',
                                });
                                setRequestAnalysisOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition"
                              title="Pedir análise (Bárbara e Giovanna)"
                              data-testid={`button-request-analysis-${r.m.id}`}
                            >
                              <MailWarning size={11} /> Análise
                            </button>
                          )}
                          <button
                            onClick={() => { onOpenMission(r.m); onClose(); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition"
                            title="Abrir financeiro da OS"
                            data-testid={`button-open-mission-${r.m.id}`}
                          >
                            Abrir <ExternalLink size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {hoverParent && openParentDetail && (
        <div
          className="fixed z-[110] w-[360px] max-w-[92vw] bg-white rounded-xl shadow-2xl border-2 border-amber-300 overflow-hidden"
          style={{ top: hoverParent.top, left: Math.min(hoverParent.left, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 370) }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          data-testid={`popover-mother-${hoverParent.id}`}
        >
          <div className="flex items-center gap-2 bg-amber-600 text-white px-3 py-2">
            <Layers size={13} />
            <span className="text-[11px] font-black uppercase tracking-wider">OS Mãe {hoverParent.id}</span>
            <span className="ml-auto text-[9px] bg-amber-800 px-2 py-0.5 rounded-full font-bold">
              {openParentDetail.children.length} filha{openParentDetail.children.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
              <span className="font-mono font-black text-[11px] text-amber-800">{hoverParent.id} <span className="text-[8px] font-bold text-amber-600">(MÃE)</span></span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="text-green-700">{fmt(openParentDetail.motherRev)}</span>
                <span className="text-red-600">{fmt(openParentDetail.motherCost)}</span>
              </div>
            </div>
            {openParentDetail.children.map((c) => (
              <div key={c.id} className="flex flex-col gap-0.5 p-2 rounded-lg bg-blue-50 border border-blue-200" data-testid={`popover-child-${c.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[11px] text-blue-800 flex items-center gap-1">
                    <Link2 size={9} /> {c.id}
                  </span>
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="text-green-700">{fmt(c.rev)}</span>
                    <span className={c.cost > 0 ? 'text-red-600' : 'text-gray-400'}>{fmt(c.cost)}</span>
                  </div>
                </div>
                {c.client && (
                  <span className="text-[9px] text-blue-700/80 truncate" title={c.client}>Cliente: {c.client}</span>
                )}
              </div>
            ))}
            {openParentDetail.children.length === 0 && (
              <p className="text-[11px] text-gray-500 px-1 py-2">Nenhuma OS filha vinculada encontrada.</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
            <div className="bg-green-100 rounded-lg p-1.5 text-center">
              <p className="text-[8px] font-bold text-green-600 uppercase">Receita grupo</p>
              <p className="text-[11px] font-black text-green-800">{fmt(openParentDetail.groupRev)}</p>
            </div>
            <div className="bg-red-100 rounded-lg p-1.5 text-center">
              <p className="text-[8px] font-bold text-red-600 uppercase">Custo grupo</p>
              <p className="text-[11px] font-black text-red-800">{fmt(openParentDetail.groupCost)}</p>
            </div>
            <div className={`rounded-lg p-1.5 text-center ${openParentDetail.groupMargin >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <p className={`text-[8px] font-bold uppercase ${openParentDetail.groupMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Margem grupo</p>
              <p className={`text-[11px] font-black ${openParentDetail.groupMargin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{fmt(openParentDetail.groupMargin)}</p>
            </div>
          </div>
        </div>
      )}

      <RequestOsAnalysisModal
        open={requestAnalysisOpen}
        onClose={() => setRequestAnalysisOpen(false)}
        payload={requestAnalysisPayload}
      />
    </div>
  );
};

export default LossesDialog;
