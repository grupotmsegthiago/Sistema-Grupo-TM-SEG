import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';
import type { GcCommissionPlan, GcRep } from '../../../lib/gestores/comercial/types';

const emptyForm = {
  full_name: '',
  job_title: 'Comercial',
  portfolio_label: '',
  admission_date: '',
  monthly_goal: '0',
  quarterly_goal: '0',
  yearly_goal: '0',
  commission_percent: '0',
  commission_plan_id: '',
  status: 'Ativo',
  notes: '',
};

const GcReps: React.FC = () => {
  const user = getGcUser();
  const [reps, setReps] = useState<GcRep[]>([]);
  const [plans, setPlans] = useState<GcCommissionPlan[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [r, p] = await Promise.all([
      supabase.from('gc_reps').select('*').is('deleted_at', null).order('full_name'),
      supabase.from('gc_commission_plans').select('*').is('deleted_at', null),
    ]);
    if (!r.error) setReps((r.data || []) as GcRep[]);
    if (!p.error) setPlans((p.data || []) as GcCommissionPlan[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setMsg('');
    if (!form.full_name.trim()) {
      setMsg('Nome obrigatório.');
      return;
    }
    const payload = {
      full_name: form.full_name.trim(),
      job_title: form.job_title || null,
      portfolio_label: form.portfolio_label || null,
      admission_date: form.admission_date || null,
      monthly_goal: Number(form.monthly_goal) || 0,
      quarterly_goal: Number(form.quarterly_goal) || 0,
      yearly_goal: Number(form.yearly_goal) || 0,
      commission_percent: Number(form.commission_percent) || 0,
      commission_plan_id: form.commission_plan_id || null,
      status: form.status,
      notes: form.notes || null,
      created_by: user.name || null,
    };
    const { data, error } = await supabase.from('gc_reps').insert([payload]).select('id').single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Execute a migration do Gestor Comercial no Supabase.'
        : error.message);
      return;
    }
    await logGcAudit({
      entity: 'gc_reps',
      entityId: data.id,
      actionType: 'CREATE',
      newValue: payload,
    });
    setForm(emptyForm);
    setMsg('Comercial cadastrado.');
    await load();
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title="Cadastro Comercial"
        subtitle="Nome, cargo, carteira, metas, planos de comissão/premiação — tudo parametrizável"
        icon={UserPlus}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {(
          [
            ['full_name', 'Nome'],
            ['job_title', 'Cargo'],
            ['portfolio_label', 'Carteira'],
            ['admission_date', 'Data de admissão'],
            ['monthly_goal', 'Meta mensal'],
            ['quarterly_goal', 'Meta trimestral'],
            ['yearly_goal', 'Meta anual'],
            ['commission_percent', '% comissão base'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
            <input
              type={key.includes('date') ? 'date' : key.includes('goal') || key.includes('percent') ? 'number' : 'text'}
              className="mt-1 w-full border rounded-xl px-3 py-2"
              value={(form as any)[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="text-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400">Plano de comissão</span>
          <select
            className="mt-1 w-full border rounded-xl px-3 py-2"
            value={form.commission_plan_id}
            onChange={(e) => setForm({ ...form, commission_plan_id: e.target.value })}
          >
            <option value="">Nenhum</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
          <select className="mt-1 w-full border rounded-xl px-3 py-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Ativo</option>
            <option>Inativo</option>
            <option>Férias</option>
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[10px] font-bold uppercase text-slate-400">Observações</span>
          <textarea className="mt-1 w-full border rounded-xl px-3 py-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button type="button" onClick={() => void save()} className="md:col-span-2 px-4 py-2 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm">
          Salvar comercial
        </button>
        {msg && <p className="md:col-span-2 text-sm">{msg}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-400">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Cargo</th>
              <th className="text-left p-3">Carteira</th>
              <th className="text-left p-3">Meta mês</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3 font-semibold">{r.full_name}</td>
                <td className="p-3">{r.job_title || '—'}</td>
                <td className="p-3">{r.portfolio_label || '—'}</td>
                <td className="p-3">{Number(r.monthly_goal).toLocaleString('pt-BR')}</td>
                <td className="p-3">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GcReps;
