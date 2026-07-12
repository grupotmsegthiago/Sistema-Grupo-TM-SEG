import React, { useMemo, useRef, useState } from 'react';
import { X, Percent, Download, ExternalLink, AlertTriangle, Search, Layers, Link2 } from 'lucide-react';
import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { computeCanonicalRevenueCost, type CanonicalRefs } from '../lib/missionFinancialsCanonical';

export const LOW_MARGIN_THRESHOLD_PCT = 20;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Missões do período/filtro do card (lista principal). */
  missions: any[];
  /** Todas as missões carregadas — para resolver filhas da OS mãe. */
  allMissions?: any[];
  clientTables: ClientPriceTable[];
  providerTables: ProviderCostTable[];
  clientsData: Client[];
  periodLabel: string;
  scopeLabel?: string;
  onOpenMission: (m: Mission) => void;
}

type Row = {
  m: any;
  rev: number;
  cost: number;
  profit: number;
  marginPct: number;
};

type ChildSummary = {
  id: string;
  status: string;
  rev: number;
  cost: number;
  profit: number;
  marginPct: number;
};

type GroupSummary = {
  children: ChildSummary[];
  motherRev: number;
  motherCost: number;
  motherProfit: number;
  groupRev: number;
  groupCost: number;
  groupProfit: number;
  groupMarginPct: number;
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function buildGroupSummary(motherId: string, allMissions: any[], refs: CanonicalRefs): GroupSummary | null {
  const motherMission = allMissions.find((m) => m?.id === motherId);
  if (!motherMission) return null;

  const kids = allMissions.filter(
    (m) => m?.parent_mission_id === motherId && m?.is_same_os === true,
  );
  if (kids.length === 0) return null;

  const motherCr = computeCanonicalRevenueCost(motherMission, refs);
  const motherRev = motherCr.rev;
  const motherCost = motherCr.cost;
  const motherProfit = motherRev - motherCost;

  const children: ChildSummary[] = kids.map((k) => {
    const cr = computeCanonicalRevenueCost(k, refs);
    const cost = k.is_same_os ? 0 : cr.cost;
    const rev = cr.rev;
    const profit = rev - cost;
    const marginPct = rev > 0 ? (profit / rev) * 100 : -100;
    return { id: k.id, status: k.status || '—', rev, cost, profit, marginPct };
  });

  const groupRev = motherRev + children.reduce((s, c) => s + c.rev, 0);
  const groupCost = motherCost + children.reduce((s, c) => s + c.cost, 0);
  const groupProfit = groupRev - groupCost;
  const groupMarginPct = groupRev > 0 ? (groupProfit / groupRev) * 100 : -100;

  return {
    children,
    motherRev,
    motherCost,
    motherProfit,
    groupRev,
    groupCost,
    groupProfit,
    groupMarginPct,
  };
}

const LowMarginDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  missions,
  allMissions,
  clientTables,
  providerTables,
  clientsData,
  periodLabel,
  scopeLabel,
  onOpenMission,
}) => {
  const [search, setSearch] = useState('');
  const [hoverParent, setHoverParent] = useState<{ id: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  const missionPool = allMissions ?? missions;

  const refs = useMemo(
    () => ({ clientTables, providerTables, clientsData }),
    [clientTables, providerTables, clientsData],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of missionPool || []) {
      const pid = m?.parent_mission_id;
      if (pid && m?.is_same_os === true) {
        const arr = map.get(pid) || [];
        arr.push(m);
        map.set(pid, arr);
      }
    }
    return map;
  }, [missionPool]);

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHoverParent(null), 150);
  };
  const toggleParentPopover = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    cancelClose();
    if (hoverParent?.id === id) {
      setHoverParent(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverParent({ id, top: rect.bottom + 6, left: rect.left });
  };
  const openParentPopover = (id: string, e: React.MouseEvent) => {
    cancelClose();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverParent({ id, top: rect.bottom + 6, left: rect.left });
  };

  const openParentDetail = useMemo(() => {
    if (!hoverParent) return null;
    return buildGroupSummary(hoverParent.id, missionPool, refs);
  }, [hoverParent, missionPool, refs]);

  const rows: Row[] = useMemo(() => {
    if (!isOpen) return [];
    const out: Row[] = [];
    for (const m of missions || []) {
      if (m.status === MissionStatus.REFUSED) continue;
      const r = computeCanonicalRevenueCost(m, refs);
      if (r.rev <= 0 && r.cost <= 0) continue;
      const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
      if (marginPct < LOW_MARGIN_THRESHOLD_PCT) {
        out.push({
          m,
          rev: r.rev,
          cost: r.cost,
          profit: r.rev - r.cost,
          marginPct,
        });
      }
    }
    out.sort((a, b) => a.marginPct - b.marginPct);
    return out;
  }, [isOpen, missions, refs]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const id = String(r.m.id || '').toUpperCase();
      const cli = String(r.m.client || '').toUpperCase();
      const prov = String(r.m.provider || '').toUpperCase();
      return id.includes(q) || cli.includes(q) || prov.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const t = { count: filteredRows.length, rev: 0, cost: 0, profit: 0 };
    for (const r of filteredRows) {
      t.rev += r.rev;
      t.cost += r.cost;
      t.profit += r.profit;
    }
    return t;
  }, [filteredRows]);

  const exportCsv = () => {
    const header = [
      'OS',
      'Cliente',
      'Fornecedor',
      'Status',
      'OS_Mae',
      'Qtd_Filhas',
      'Receita',
      'Custo',
      'Lucro',
      'Margem%',
      'Receita_Grupo',
      'Custo_Grupo',
      'Lucro_Grupo',
      'Margem_Grupo%',
    ];
    const lines = [header.join(';')];
    for (const r of filteredRows) {
      const childCount = (childrenByParent.get(r.m.id) || []).length;
      const group = childCount > 0 ? buildGroupSummary(r.m.id, missionPool, refs) : null;
      lines.push([
        r.m.id || '',
        (r.m.client || '').replace(/;/g, ','),
        (r.m.provider || '').replace(/;/g, ','),
        r.m.status || '',
        childCount > 0 ? 'SIM' : 'NAO',
        String(childCount),
        r.rev.toFixed(2).replace('.', ','),
        r.cost.toFixed(2).replace('.', ','),
        r.profit.toFixed(2).replace('.', ','),
        r.marginPct.toFixed(1).replace('.', ','),
        group ? group.groupRev.toFixed(2).replace('.', ',') : '',
        group ? group.groupCost.toFixed(2).replace('.', ',') : '',
        group ? group.groupProfit.toFixed(2).replace('.', ',') : '',
        group ? group.groupMarginPct.toFixed(1).replace('.', ',') : '',
      ].join(';'));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `os-margem-abaixo-${LOW_MARGIN_THRESHOLD_PCT}pct-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const scopeText = scopeLabel ? ` — ${scopeLabel}` : '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
      data-testid="dialog-low-margin"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
              <Percent size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">OS com margem abaixo de {LOW_MARGIN_THRESHOLD_PCT}%</h2>
              <p className="text-xs text-gray-600">
                Período: <span className="font-semibold">{periodLabel}</span>
                {scopeText}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/60 text-gray-500 hover:text-gray-800 transition"
            data-testid="button-close-low-margin"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por OS, cliente ou fornecedor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
              data-testid="input-search-low-margin"
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-lg transition"
            data-testid="button-export-low-margin"
          >
            <Download size={14} /> CSV
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50/50 border-b border-amber-100">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="font-bold text-amber-800">{totals.count}</span>
            <span className="text-gray-700">{totals.count === 1 ? 'OS' : 'OSs'} listada{totals.count === 1 ? '' : 's'}</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-600">
              Receita: <span className="font-bold text-gray-900">{fmt(totals.rev)}</span>
            </span>
            <span className="text-gray-600">
              Custo: <span className="font-bold text-gray-900">{fmt(totals.cost)}</span>
            </span>
            <span className="text-amber-800 font-bold">Lucro: {fmt(totals.profit)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
              <Percent size={42} className="text-emerald-400 mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                Nenhuma OS com margem abaixo de {LOW_MARGIN_THRESHOLD_PCT}% no período.
              </p>
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
                  <th className="px-3 py-2.5 text-right">Lucro</th>
                  <th className="px-3 py-2.5 text-right">Margem</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const isLoss = r.profit < 0;
                  const childCount = (childrenByParent.get(r.m.id) || []).length;
                  const isMother = childCount > 0;
                  const group = isMother ? buildGroupSummary(r.m.id, missionPool, refs) : null;
                  const groupLoss = (group?.groupProfit ?? 0) < 0;

                  return (
                    <React.Fragment key={r.m.id}>
                      <tr
                        className="border-b border-gray-100 hover:bg-amber-50/40 transition"
                        data-testid={`row-low-margin-${r.m.id}`}
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
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={r.m.client || ''}>
                          {r.m.client || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={r.m.provider || ''}>
                          {r.m.provider || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">
                            {r.m.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.rev)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.cost)}</td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-bold ${isLoss ? 'text-red-700' : 'text-amber-700'}`}
                        >
                          {fmt(r.profit)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-bold ${
                            r.marginPct < 0 ? 'text-red-700' : r.marginPct < 10 ? 'text-amber-600' : 'text-orange-600'
                          }`}
                        >
                          {r.marginPct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              onOpenMission(r.m);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition"
                            title="Abrir financeiro da OS"
                            data-testid={`button-open-low-margin-${r.m.id}`}
                          >
                            Abrir <ExternalLink size={11} />
                          </button>
                        </td>
                      </tr>
                      {isMother && group && (
                        <tr className="border-b border-amber-100 bg-amber-50/30" data-testid={`row-low-margin-group-${r.m.id}`}>
                          <td colSpan={9} className="px-4 py-2.5">
                            <div className="rounded-xl border border-amber-200 bg-white/80 p-2.5 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                                  <Layers size={11} /> Resumo do grupo (mãe + {childCount} filha{childCount !== 1 ? 's' : ''})
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                  <span className="text-gray-600">
                                    Receita grupo: <strong className="text-gray-900">{fmt(group.groupRev)}</strong>
                                  </span>
                                  <span className="text-gray-600">
                                    Custo grupo: <strong className="text-gray-900">{fmt(group.groupCost)}</strong>
                                  </span>
                                  <span className={`font-black ${groupLoss ? 'text-red-700' : 'text-emerald-700'}`}>
                                    {groupLoss ? 'Prejuízo grupo' : 'Lucro grupo'}: {fmt(group.groupProfit)} ({group.groupMarginPct.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              <div className="grid gap-1">
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[10px]">
                                  <span className="font-mono font-black text-amber-800">
                                    {r.m.id} <span className="text-[8px] text-amber-600">(MÃE)</span>
                                  </span>
                                  <div className="flex items-center gap-3 font-mono">
                                    <span className="text-green-700">{fmt(group.motherRev)}</span>
                                    <span className="text-red-600">{fmt(group.motherCost)}</span>
                                    <span className={group.motherProfit < 0 ? 'text-red-700 font-bold' : 'text-emerald-700 font-bold'}>
                                      {fmt(group.motherProfit)}
                                    </span>
                                  </div>
                                </div>
                                {group.children.map((c) => (
                                  <div
                                    key={c.id}
                                    className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[10px]"
                                    data-testid={`row-low-margin-child-${c.id}`}
                                  >
                                    <span className="font-mono font-bold text-blue-800 flex items-center gap-1">
                                      <Link2 size={9} /> {c.id}
                                      <span className="text-[8px] font-semibold text-blue-600 uppercase">{c.status}</span>
                                    </span>
                                    <div className="flex items-center gap-3 font-mono">
                                      <span className="text-green-700">{fmt(c.rev)}</span>
                                      <span className={c.cost > 0 ? 'text-red-600' : 'text-gray-400'}>{fmt(c.cost)}</span>
                                      <span className={c.profit < 0 ? 'text-red-700 font-bold' : 'text-emerald-700 font-bold'}>
                                        {fmt(c.profit)} ({c.marginPct.toFixed(1)}%)
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {hoverParent && openParentDetail && (
        <div
          className="fixed z-[110] w-[340px] max-w-[92vw] bg-white rounded-xl shadow-2xl border-2 border-amber-300 overflow-hidden"
          style={{
            top: hoverParent.top,
            left: Math.min(hoverParent.left, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 350),
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          data-testid={`popover-mother-low-margin-${hoverParent.id}`}
        >
          <div className="flex items-center gap-2 bg-amber-600 text-white px-3 py-2">
            <Layers size={13} />
            <span className="text-[11px] font-black uppercase tracking-wider">OS Mãe {hoverParent.id}</span>
            <span className="ml-auto text-[9px] bg-amber-800 px-2 py-0.5 rounded-full font-bold">
              {openParentDetail.children.length} filha{openParentDetail.children.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-2 py-2">
            <div className="bg-green-100 rounded-lg p-1.5 text-center">
              <p className="text-[8px] font-bold text-green-600 uppercase">Receita grupo</p>
              <p className="text-[11px] font-black text-green-800">{fmt(openParentDetail.groupRev)}</p>
            </div>
            <div className="bg-red-100 rounded-lg p-1.5 text-center">
              <p className="text-[8px] font-bold text-red-600 uppercase">Custo grupo</p>
              <p className="text-[11px] font-black text-red-800">{fmt(openParentDetail.groupCost)}</p>
            </div>
            <div
              className={`rounded-lg p-1.5 text-center ${openParentDetail.groupProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}
            >
              <p
                className={`text-[8px] font-bold uppercase ${openParentDetail.groupProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {openParentDetail.groupProfit >= 0 ? 'Lucro grupo' : 'Prejuízo grupo'}
              </p>
              <p
                className={`text-[11px] font-black ${openParentDetail.groupProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}
              >
                {fmt(openParentDetail.groupProfit)}
              </p>
              <p className="text-[9px] font-bold text-gray-600">{openParentDetail.groupMarginPct.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LowMarginDialog;
