import React, { useEffect, useState } from 'react';
import { Calculator, Download, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../lib/NotificationContext';
import { generatePayrollClient } from '../../lib/rh/payrollClient';
import RhPageHeader from './shared/RhPageHeader';
import { maskCurrency } from '../../lib/rh/masks';
import { canEditRh } from '../../lib/rh/permissions';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';

const RhPayrollTable: React.FC = () => {
  const { showNotification } = useNotification();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const editable = canEditRh();

  useEffect(() => { load(); }, [month]);

  useRealtimeRefresh(['rh_payroll_runs', 'rh_payroll_items'], () => {
    load();
  });

  const load = async () => {
    setLoading(true);
    const { data: run } = await supabase.from('rh_payroll_runs').select('id').eq('reference_month', month).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!run) { setItems([]); setLoading(false); return; }
    const { data } = await supabase.from('rh_payroll_items').select('*').eq('payroll_run_id', run.id);
    setItems(data || []);
    setLoading(false);
  };

  const generate = async () => {
    try {
      const data = await generatePayrollClient(month);
      showNotification('success', `Folha gerada: ${data.items} funcionário(s)`);
      load();
    } catch (e: any) {
      showNotification('error', e.message);
    }
  };

  const totals = items.reduce((acc, i) => ({
    base: acc.base + Number(i.base_salary || 0),
    commission: acc.commission + Number(i.commission || 0),
    awards: acc.awards + Number(i.awards || 0),
    bonuses: acc.bonuses + Number(i.bonuses || 0),
    discounts: acc.discounts + Number(i.discounts || 0),
    net: acc.net + Number(i.net_salary || 0),
    total: acc.total + Number(i.total_pay || 0),
  }), { base: 0, commission: 0, awards: 0, bonuses: 0, discounts: 0, net: 0, total: 0 });

  const exportCsv = () => {
    const headers = ['Funcionário', 'Salário Base', 'Comissão', 'Premiação', 'Bonificação', 'Benefícios', 'Descontos', 'INSS', 'IRRF', 'Líquido', 'Total'];
    const rows = items.map((i) => [
      i.details_json?.employee_name || i.employee_id,
      i.base_salary, i.commission, i.awards, i.bonuses, i.benefits, i.discounts, i.inss, i.irrf, i.net_salary, i.total_pay,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `folha-${month}.csv`;
    a.click();
  };

  return (
    <div>
      <RhPageHeader
        title="Folha de Pagamento"
        subtitle="Cálculo consolidado mensal"
        icon={Calculator}
        actions={
          <div className="flex gap-2 flex-wrap">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            {editable && <button type="button" onClick={generate} className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase"><RefreshCw size={14} /> Gerar folha</button>}
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-bold uppercase"><Download size={14} /> CSV</button>
          </div>
        }
      />

      <div className="bg-white rounded-2xl border overflow-x-auto shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 text-white">
            <tr>
              {['Funcionário', 'Cargo', 'Base', 'Comissão', 'Premiação', 'Bonificação', 'H.Extras', 'Benefícios', 'Descontos', 'Faltas', 'Atrasos', 'INSS', 'IRRF', 'FGTS', 'Líquido', 'Total'].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-bold uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="p-8 text-center text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={16} className="p-8 text-center text-gray-400">Nenhuma folha gerada para este mês. Clique em &quot;Gerar folha&quot;.</td></tr>
            ) : items.map((i) => (
              <tr key={i.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{i.details_json?.employee_name || '—'}</td>
                <td className="px-3 py-2">{i.details_json?.position || '—'}</td>
                <td className="px-3 py-2">{maskCurrency(i.base_salary)}</td>
                <td className="px-3 py-2">{maskCurrency(i.commission)}</td>
                <td className="px-3 py-2">{maskCurrency(i.awards)}</td>
                <td className="px-3 py-2">{maskCurrency(i.bonuses)}</td>
                <td className="px-3 py-2">{maskCurrency(i.overtime)}</td>
                <td className="px-3 py-2">{maskCurrency(i.benefits)}</td>
                <td className="px-3 py-2 text-red-600">{maskCurrency(i.discounts)}</td>
                <td className="px-3 py-2">{maskCurrency(i.absences)}</td>
                <td className="px-3 py-2">{maskCurrency(i.delays)}</td>
                <td className="px-3 py-2">{maskCurrency(i.inss)}</td>
                <td className="px-3 py-2">{maskCurrency(i.irrf)}</td>
                <td className="px-3 py-2">{maskCurrency(i.fgts)}</td>
                <td className="px-3 py-2 font-bold text-green-700">{maskCurrency(i.net_salary)}</td>
                <td className="px-3 py-2 font-black">{maskCurrency(i.total_pay)}</td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot className="bg-gray-100 font-bold">
              <tr>
                <td className="px-3 py-3" colSpan={2}>TOTAIS</td>
                <td className="px-3 py-2">{maskCurrency(totals.base)}</td>
                <td className="px-3 py-2">{maskCurrency(totals.commission)}</td>
                <td className="px-3 py-2">{maskCurrency(totals.awards)}</td>
                <td className="px-3 py-2">{maskCurrency(totals.bonuses)}</td>
                <td colSpan={3} />
                <td className="px-3 py-2 text-red-600">{maskCurrency(totals.discounts)}</td>
                <td colSpan={4} />
                <td className="px-3 py-2 text-green-700">{maskCurrency(totals.net)}</td>
                <td className="px-3 py-2">{maskCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default RhPayrollTable;
