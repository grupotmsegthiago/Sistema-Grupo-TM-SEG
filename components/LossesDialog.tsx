import React, { useMemo, useState } from 'react';
import { X, TrendingDown, Download, ExternalLink, AlertTriangle, Search } from 'lucide-react';
import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import {
  computeCanonicalRevenueCost,
  getCanonicalDateRange,
  filterMissionsByPeriod,
  type CanonicalPeriod,
} from '../lib/missionFinancialsCanonical';

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
};

const LossesDialog: React.FC<Props> = ({
  isOpen, onClose, missions, clientTables, providerTables, clientsData,
  viewPeriod, customStartDate, customEndDate, onOpenMission,
}) => {
  const [includeLowMargin, setIncludeLowMargin] = useState(false);
  const [search, setSearch] = useState('');

  const rows: Row[] = useMemo(() => {
    if (!isOpen) return [];
    const allowed: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
    // Mesmo fallback dos cards de meta (DailyGoalThermometer): se o período não
    // for canônico (ex.: 'HISTORY'), cai para TODAY. Mantém a janela alinhada.
    const period = (allowed.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY') as CanonicalPeriod;
    const [start, end] = getCanonicalDateRange(period, customStartDate, customEndDate);
    const inPeriod = filterMissionsByPeriod(missions || [], start, end);
    const refs = { clientTables, providerTables, clientsData };
    const out: Row[] = [];
    for (const m of inPeriod) {
      if (m.status === MissionStatus.REFUSED) continue;
      const r = computeCanonicalRevenueCost(m, refs);
      if (r.rev <= 0 && r.cost <= 0) continue;
      const loss = r.cost - r.rev;
      const marginPct = r.rev > 0 ? ((r.rev - r.cost) / r.rev) * 100 : -100;
      // Prejuízo direto: custo > receita
      // OU margem muito baixa (< 10%) se o usuário quiser incluir
      if (loss > 0 || (includeLowMargin && marginPct < 10)) {
        out.push({ m, rev: r.rev, cost: r.cost, loss, marginPct });
      }
    }
    out.sort((a, b) => b.loss - a.loss);
    return out;
  }, [isOpen, missions, clientTables, providerTables, clientsData, viewPeriod, customStartDate, customEndDate, includeLowMargin]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(r => {
      const id = String(r.m.id || '').toUpperCase();
      const cli = String(r.m.client || '').toUpperCase();
      const prov = String(r.m.provider || '').toUpperCase();
      return id.includes(q) || cli.includes(q) || prov.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const t = { count: filteredRows.length, rev: 0, cost: 0, loss: 0 };
    for (const r of filteredRows) { t.rev += r.rev; t.cost += r.cost; t.loss += r.loss; }
    return t;
  }, [filteredRows]);

  const exportCsv = () => {
    const header = ['OS', 'Cliente', 'Fornecedor', 'Status', 'Origem', 'Destino', 'KM', 'Receita', 'Custo', 'Prejuizo', 'Margem%'];
    const lines = [header.join(';')];
    for (const r of filteredRows) {
      lines.push([
        r.m.id || '',
        (r.m.client || '').replace(/;/g, ','),
        (r.m.provider || '').replace(/;/g, ','),
        r.m.status || '',
        (r.m.origin || '').replace(/;/g, ',').slice(0, 80),
        (r.m.destination || '').replace(/;/g, ',').slice(0, 80),
        String(r.m.total_distance || r.m.totalDistance || ''),
        r.rev.toFixed(2).replace('.', ','),
        r.cost.toFixed(2).replace('.', ','),
        r.loss.toFixed(2).replace('.', ','),
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

  // Usa o mesmo período efetivo do cálculo (com fallback para TODAY), evitando
  // mostrar "HISTORY" enquanto a janela real é "Hoje".
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
              <p className="text-xs text-gray-600">Período: <span className="font-semibold">{periodLabel}</span> — custo do fornecedor maior que a receita do cliente</p>
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
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={14} className="text-red-600" />
            <span className="font-bold text-red-700">{totals.count}</span>
            <span className="text-gray-700">{totals.count === 1 ? 'OS' : 'OSs'} listada{totals.count === 1 ? '' : 's'}</span>
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
                  const isLoss = r.loss > 0;
                  return (
                    <tr key={r.m.id} className="border-b border-gray-100 hover:bg-red-50/40 transition" data-testid={`row-loss-${r.m.id}`}>
                      <td className="px-4 py-2 font-mono font-bold text-gray-900 text-xs">{r.m.id}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={r.m.client || ''}>{r.m.client || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={r.m.provider || ''}>{r.m.provider || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">{r.m.status || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.rev)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900">{fmt(r.cost)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${isLoss ? 'text-red-700' : 'text-amber-600'}`} data-testid={`text-loss-${r.m.id}`}>
                        {isLoss ? fmt(r.loss) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${r.marginPct < 0 ? 'text-red-700' : r.marginPct < 10 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {r.marginPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => { onOpenMission(r.m); onClose(); }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition"
                          title="Abrir financeiro da OS"
                          data-testid={`button-open-mission-${r.m.id}`}
                        >
                          Abrir <ExternalLink size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LossesDialog;
