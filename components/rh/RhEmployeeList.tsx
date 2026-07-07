import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Users, AlertCircle, Upload, Loader2, ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';
import { fetchRhEmployees } from '../../lib/rh/fetchRhEmployees';
import { fetchEmployeeCostSummary } from '../../lib/rh/fetchEmployeeCostSummary';
import { authFetch } from '../../lib/authFetch';
import { maskCurrency, maskPercent } from '../../lib/rh/masks';
import RhPageHeader from './shared/RhPageHeader';
import type { RhEmployee } from '../../types/rh';
import type { RhEmployeeCostBreakdown } from '../../lib/rh/employeeCostSummary';
import { canEditRh, canViewSalary } from '../../lib/rh/permissions';

interface Props {
  onAdd: () => void;
  onOpen: (id: string) => void;
}

const COST_LABELS: { key: keyof RhEmployeeCostBreakdown; label: string }[] = [
  { key: 'baseSalary', label: 'Salário base' },
  { key: 'nightShiftBonus', label: 'Adicional noturno' },
  { key: 'hazardPay', label: 'Periculosidade' },
  { key: 'unhealthyPay', label: 'Insalubridade' },
  { key: 'overtimeValue', label: 'Horas extras' },
  { key: 'grossSalary', label: 'Salário bruto' },
  { key: 'benefits', label: 'Benefícios (VT, VR, plano…)' },
  { key: 'fgts', label: 'FGTS (8%)' },
  { key: 'commissions', label: 'Comissões' },
  { key: 'awards', label: 'Premiações' },
  { key: 'bonuses', label: 'Bonificações' },
  { key: 'netSalary', label: 'Salário líquido (estimado)' },
];

const RhEmployeeList: React.FC<Props> = ({ onAdd, onOpen }) => {
  const [rows, setRows] = useState<RhEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [costByEmployee, setCostByEmployee] = useState<Record<string, RhEmployeeCostBreakdown>>({});
  const [costTotals, setCostTotals] = useState<ReturnType<typeof import('../../lib/rh/employeeCostSummary').sumCostBreakdowns> | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const editable = canEditRh();
  const showCosts = canViewSalary();

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const { rows: data, error } = await fetchRhEmployees();
    setRows(data);
    if (error && data.length === 0) setLoadError(error);
    setLoading(false);
  };

  const loadCosts = async () => {
    if (!showCosts) return;
    setCostLoading(true);
    setCostError(null);
    try {
      const data = await fetchEmployeeCostSummary(month);
      const map: Record<string, RhEmployeeCostBreakdown> = {};
      for (const item of data.items) map[item.employeeId] = item;
      setCostByEmployee(map);
      setCostTotals(data.totals);
    } catch (e: any) {
      setCostByEmployee({});
      setCostTotals(null);
      setCostError(e?.message || 'Falha ao carregar custos');
    } finally {
      setCostLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadCosts(); }, [month, showCosts, rows.length]);
  useRealtimeRefresh('rh_employees', load);
  useRealtimeRefresh('rh_salary_configs', loadCosts);
  useRealtimeRefresh('rh_commissions', loadCosts);
  useRealtimeRefresh('rh_awards', loadCosts);
  useRealtimeRefresh('rh_bonuses', loadCosts);

  const importPlanilha = async () => {
    if (!editable || importing) return;
    setImporting(true);
    setImportMsg(null);
    setLoadError(null);
    try {
      const res = await authFetch('/api/rh/seed-employees', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Falha HTTP ${res.status}`);
      }
      const total = (json.created || 0) + (json.updated || 0);
      setImportMsg(`Importação concluída: ${total} funcionário(s) da planilha TM SEGURANÇA.`);
      if (json.errors?.length) {
        setLoadError(json.errors.join(' · '));
      }
      await load();
    } catch (e: any) {
      setLoadError(e?.message || 'Falha ao importar planilha');
    } finally {
      setImporting(false);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Ativo: 'bg-green-100 text-green-700',
      'Férias': 'bg-blue-100 text-blue-700',
      Afastado: 'bg-amber-100 text-amber-700',
      Desligado: 'bg-gray-200 text-gray-600',
      Experiência: 'bg-purple-100 text-purple-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.matricula, r.cpf, r.email, r.status]
        .some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const showImportCta = editable && !loading && rows.length === 0;

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderCostCell = (employeeId: string, field: keyof RhEmployeeCostBreakdown) => {
    const cost = costByEmployee[employeeId];
    if (!cost) return '—';
    if (!cost?.hasSalaryConfig && field !== 'commissions' && field !== 'awards' && field !== 'bonuses' && field !== 'variablePay' && field !== 'companyCost') {
      return '—';
    }
    const value = cost[field];
    return typeof value === 'number' ? maskCurrency(value) : '—';
  };

  return (
    <div>
      <RhPageHeader
        title="Funcionários"
        subtitle="Custos mensais por colaborador e valor total para a empresa — clique na linha para abrir a pasta"
        icon={Users}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {showCosts && (
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
                title="Mês de referência dos custos"
              />
            )}
            {showImportCta && (
              <button
                type="button"
                onClick={() => void importPlanilha()}
                disabled={importing}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-xs font-bold uppercase disabled:opacity-60"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Importar planilha TM SEG (12)
              </button>
            )}
            <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-xs font-bold uppercase">
              <Plus size={16} /> Novo funcionário
            </button>
          </div>
        )}
      />
      {importMsg && (
        <div className="mb-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm font-medium">
          {importMsg}
        </div>
      )}
      {(loadError || showImportCta) && !importMsg && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Nenhum funcionário no banco</p>
            <p className="mt-1 text-xs">
              {loadError || 'Os 12 colaboradores da planilha TM SEGURANÇA ainda não foram importados para o Supabase.'}
            </p>
            {showImportCta && (
              <button
                type="button"
                onClick={() => void importPlanilha()}
                disabled={importing}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-amber-700 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-60"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Importar agora
              </button>
            )}
          </div>
        </div>
      )}
      {costError && showCosts && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">{costError}</div>
      )}
      {loading ? <p className="text-gray-400">Carregando...</p> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg text-sm"
            />
            {showCosts && costTotals && (
              <div className="flex items-center gap-2 text-sm">
                <Calculator size={16} className="text-red-600" />
                <span className="text-gray-500">Custo total da equipe ({month}):</span>
                <span className="font-black text-red-700">{maskCurrency(costTotals.companyCost)}</span>
                {costLoading && <Loader2 size={14} className="animate-spin text-gray-400" />}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {showCosts && <th className="w-8 px-2 py-3" />}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Matrícula</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Nome</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Departamento</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cargo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Situação</th>
                  {showCosts && (
                    <>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Bruto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Benefícios</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">FGTS</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Variáveis</th>
                      <th className="px-4 py-3 text-xs font-bold text-red-600 uppercase whitespace-nowrap">Custo empresa</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">% do total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={showCosts ? 12 : 5} className="px-4 py-10 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
                ) : filtered.map((row) => {
                  const cost = costByEmployee[row.id];
                  const isExpanded = expandedId === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="border-t border-gray-50 cursor-pointer hover:bg-red-50/40"
                        onClick={() => onOpen(row.id)}
                      >
                        {showCosts && (
                          <td className="px-2 py-3">
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500"
                              onClick={(e) => toggleExpand(e, row.id)}
                              title="Ver detalhamento de custos"
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-700">{row.matricula || '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{row.full_name}</td>
                        <td className="px-4 py-3 text-gray-700">{(row as any).rh_departments?.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{(row as any).rh_positions?.name || '—'}</td>
                        <td className="px-4 py-3">{statusBadge(row.status)}</td>
                        {showCosts && (
                          <>
                            <td className="px-4 py-3 whitespace-nowrap">{costLoading ? '…' : renderCostCell(row.id, 'grossSalary')}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{costLoading ? '…' : renderCostCell(row.id, 'benefits')}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{costLoading ? '…' : renderCostCell(row.id, 'fgts')}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{costLoading ? '…' : renderCostCell(row.id, 'variablePay')}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-black text-red-700">
                              {costLoading ? '…' : (cost ? maskCurrency(cost.companyCost) : '—')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-700">
                              {costLoading ? '…' : (cost && costTotals ? maskPercent(cost.companyCost, costTotals.companyCost) : '—')}
                            </td>
                          </>
                        )}
                      </tr>
                      {showCosts && isExpanded && (
                        <tr className="bg-gray-50/80 border-t border-gray-100">
                          <td colSpan={12} className="px-6 py-4">
                            {!cost?.hasSalaryConfig && !cost?.variablePay ? (
                              <p className="text-sm text-amber-700">Sem configuração salarial cadastrada para este colaborador.</p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                                {COST_LABELS.map(({ key, label }) => {
                                  const value = cost ? cost[key] : 0;
                                  if (typeof value !== 'number' || value === 0) return null;
                                  return (
                                    <div key={key} className="flex justify-between gap-4 border-b border-gray-200/80 pb-2">
                                      <span className="text-gray-500">{label}</span>
                                      <span className="font-semibold text-gray-800">{maskCurrency(value)}</span>
                                    </div>
                                  );
                                })}
                                <div className="md:col-span-2 lg:col-span-3 mt-2 p-3 rounded-xl bg-red-50 border border-red-100 flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold text-red-800 uppercase text-xs tracking-wide">
                                    Valor para a empresa (mês {month})
                                  </span>
                                  <span className="text-lg font-black text-red-700">
                                    {cost ? maskCurrency(cost.companyCost) : '—'}
                                  </span>
                                  {cost && costTotals ? (
                                    <span className="text-sm font-bold text-gray-600">
                                      {maskPercent(cost.companyCost, costTotals.companyCost)} do custo total da equipe
                                    </span>
                                  ) : null}
                                  <p className="w-full text-[11px] text-red-700/80">
                                    Bruto + FGTS (CLT) + benefícios + comissões + premiações + bonificações. Contrato PJ não inclui FGTS.
                                  </p>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {showCosts && costTotals && filtered.length > 0 && (
                <tfoot className="bg-gray-900 text-white text-xs font-bold">
                  <tr>
                    <td className="px-4 py-3" colSpan={showCosts ? 6 : 5}>TOTAIS — {filtered.length} colaborador(es)</td>
                    <td className="px-4 py-3 whitespace-nowrap">{maskCurrency(costTotals.grossSalary)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{maskCurrency(costTotals.benefits)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{maskCurrency(costTotals.fgts)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{maskCurrency(costTotals.variablePay)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-red-300">{maskCurrency(costTotals.companyCost)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} registro(s)
            {showCosts && costTotals ? ` · ${costTotals.withConfig} com salário configurado` : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default RhEmployeeList;
