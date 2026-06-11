import React, { useMemo, useState } from 'react';
import { X, TableProperties, Download, ExternalLink, AlertTriangle, Search } from 'lucide-react';
import { Mission, MissionStatus, ClientPriceTable, ProviderCostTable, Client } from '../types';
import { calculateMissionFinancials } from '../lib/financialUtils';
import {
  getCanonicalDateRange,
  filterMissionsByPeriod,
  type CanonicalPeriod,
} from '../lib/missionFinancialsCanonical';

export type MissingTableRow = {
  m: any;
  missingClient: boolean;
  missingProvider: boolean;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rows: MissingTableRow[];
  viewPeriod: string;
  onOpenMission: (m: Mission) => void;
  // Quando informado, substitui o rótulo de período no cabeçalho (ex.: piso fixo).
  scopeLabel?: string;
}

const PERIOD_LABEL: Record<string, string> = {
  TODAY: 'Hoje', YESTERDAY: 'Ontem', WEEK: 'Esta Semana',
  MONTH: 'Este Mês', YEAR: 'Este Ano', CUSTOM: 'Período Customizado', ALL: 'Tudo',
};

type Row = MissingTableRow;

export const computeMissingTableRows = (
  missions: any[],
  clientTables: ClientPriceTable[],
  providerTables: ProviderCostTable[],
  clientsData: Client[],
  viewPeriod: string,
  customStartDate?: string,
  customEndDate?: string,
  // Quando true, `missions` já vem filtrada pelo período canônico (evita varrer
  // a lista inteira duas vezes quando o chamador já fez esse filtro).
  alreadyFiltered = false,
): Row[] => {
  let inPeriod: any[];
  if (alreadyFiltered) {
    inPeriod = missions || [];
  } else {
    const allowed: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
    const period = (allowed.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY') as CanonicalPeriod;
    const [start, end] = getCanonicalDateRange(period, customStartDate, customEndDate);
    inPeriod = filterMissionsByPeriod(missions || [], start, end);
  }
  const now = new Date();
  const out: Row[] = [];
  for (const m of inPeriod) {
    if (m.status === MissionStatus.REFUSED) continue;
    // OS já faturada/verificada tem valor congelado — não precisa de tabela.
    if (m.billing_approved || m.billing_verified_by) continue;
    // OS com valor zero intencional (cancelada/recusada sem cobrança) não exige tabela.
    if (m.valor_zero_motivo) continue;
    // OS "mesma OS" (filha) tem custo do fornecedor zerado de propósito — não exige tabela própria.
    if (m.is_same_os) continue;
    try {
      const clientName = ((m as any).originalClientName || m.client || '').toString().trim();
      const matchedClient = clientsData.find(c => c.name === clientName);
      // Passa a missão como está (inclusive CANCELLED) para que o motor aplique
      // as regras de cancelamento e selecione a tabela mínima quando houver.
      const missionObj: Mission = {
        ...m,
        startKm: m.startKm ?? m.start_km,
        endKm: m.endKm ?? m.end_km,
        startTime: m.startTime ?? m.start_time,
        endTime: m.endTime ?? m.end_time,
        createdAt: m.createdAt ?? m.created_at,
        lastUpdate: m.lastUpdate ?? m.last_update,
        totalDistance: m.totalDistance ?? m.total_distance,
      } as Mission;
      const fin = calculateMissionFinancials(missionObj, clientTables, providerTables, matchedClient, now);
      const missingClient = !fin.hasClientTable;
      const missingProvider = !fin.hasProviderTable;
      if (missingClient || missingProvider) {
        out.push({ m, missingClient, missingProvider });
      }
    } catch {
      // Se o cálculo falhar, trata como sem tabela (precisa de atenção).
      out.push({ m, missingClient: true, missingProvider: true });
    }
  }
  out.sort((a, b) => String(a.m.id || '').localeCompare(String(b.m.id || '')));
  return out;
};

const MissingTableDialog: React.FC<Props> = ({
  isOpen, onClose, rows, viewPeriod, onOpenMission, scopeLabel,
}) => {
  const [search, setSearch] = useState('');

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

  const exportCsv = () => {
    const header = ['OS', 'Cliente', 'Fornecedor', 'Status', 'Origem', 'Destino', 'KM', 'Sem Tabela Cliente', 'Sem Tabela Fornecedor'];
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
        r.missingClient ? 'SIM' : '',
        r.missingProvider ? 'SIM' : '',
      ].join(';'));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `os-sem-tabela-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const allowedLbl: CanonicalPeriod[] = ['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM', 'ALL'];
  const effectivePeriod = (allowedLbl.includes(viewPeriod as CanonicalPeriod) ? viewPeriod : 'TODAY');
  const periodLabel = PERIOD_LABEL[effectivePeriod] || effectivePeriod;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" data-testid="dialog-missing-table">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
              <TableProperties size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">OS sem Tabela</h2>
              <p className="text-xs text-gray-600">{scopeLabel ? <>Escopo: <span className="font-semibold">{scopeLabel}</span></> : <>Período: <span className="font-semibold">{periodLabel}</span></>} — missões sem tabela de preço (cliente) ou de custo (fornecedor)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/60 text-gray-500 hover:text-gray-800 transition" data-testid="button-close-missing-table">
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
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
              data-testid="input-search-missing-table"
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-lg transition"
            data-testid="button-export-missing-table"
          >
            <Download size={14} /> CSV
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50/50 border-b border-amber-100 text-sm">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="font-bold text-amber-700">{filteredRows.length}</span>
          <span className="text-gray-700">{filteredRows.length === 1 ? 'OS' : 'OSs'} sem tabela atribuída</span>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
              <TableProperties size={42} className="text-emerald-400 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Nenhuma OS sem tabela no período.</p>
              <p className="text-xs text-gray-500 mt-1">Todas as missões têm tabela de preço e de custo aplicadas.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-200 shadow-sm z-10">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">OS</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Fornecedor</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-center">Tabela Cliente</th>
                  <th className="px-3 py-2.5 text-center">Tabela Fornecedor</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.m.id} className="border-b border-gray-100 hover:bg-amber-50/40 transition" data-testid={`row-missing-table-${r.m.id}`}>
                    <td className="px-4 py-2 font-mono font-bold text-gray-900 text-xs">{r.m.id}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={r.m.client || ''}>{r.m.client || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={r.m.provider || ''}>{r.m.provider || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">{r.m.status || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.missingClient
                        ? <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">SEM TABELA</span>
                        : <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">OK</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.missingProvider
                        ? <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">SEM TABELA</span>
                        : <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">OK</span>}
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissingTableDialog;
