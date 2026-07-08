import React, { useEffect, useState } from 'react';
import { Calendar, DollarSign, AlertTriangle, Clock, Trophy, Gift, FileText, Users, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import RhPageHeader from './shared/RhPageHeader';
import { maskCurrency } from '../../lib/rh/masks';
import { monthsBetween } from '../../lib/rh/payroll';
import { formatDateBR } from '../../lib/dateUtils';
import type { RhEmployee } from '../../types/rh';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';

interface Props {
  id: string;
  onBack: () => void;
  onEdit: () => void;
}

const RhEmployeeProfile: React.FC<Props> = ({ id, onBack, onEdit }) => {
  const [employee, setEmployee] = useState<RhEmployee | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [timeClock, setTimeClock] = useState<any[]>([]);

  useEffect(() => { load(); }, [id]);

  useRealtimeRefresh(
    [
      'rh_employees',
      'rh_salary_configs',
      'rh_warnings',
      'rh_commissions',
      'rh_awards',
      'rh_bonuses',
      'time_clock',
    ],
    () => {
      load();
    },
  );

  const load = async () => {
    const { data: emp } = await supabase.from('rh_employees')
      .select('*, rh_positions(name), rh_departments(name)')
      .eq('id', id).single();
    setEmployee(emp);

    const [{ data: sal }, { data: warn }, { data: comm }, { data: aw }, { data: bon }, { data: logs }, { data: audit }] = await Promise.all([
      supabase.from('rh_salary_configs').select('*').eq('employee_id', id).order('effective_from', { ascending: false }),
      supabase.from('rh_warnings').select('*').eq('employee_id', id).is('deleted_at', null).order('warning_date', { ascending: false }),
      supabase.from('rh_commissions').select('*').eq('employee_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
      supabase.from('rh_awards').select('*').eq('employee_id', id).is('deleted_at', null).order('award_date', { ascending: false }).limit(20),
      supabase.from('rh_bonuses').select('*').eq('employee_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
      emp?.user_id ? supabase.from('time_clock').select('*').eq('user_id', emp.user_id).order('timestamp', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
      supabase.from('rh_audit_logs').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    ]);

    setSalaryHistory(sal || []);
    setWarnings(warn || []);
    setCommissions(comm || []);
    setAwards(aw || []);
    setBonuses(bon || []);
    setTimeClock(logs || []);

    const events: any[] = [];
    if (emp?.admission_date) events.push({ date: emp.admission_date, title: 'Admissão', type: 'admission' });
    (sal || []).forEach((s: any) => events.push({ date: s.effective_from, title: `Salário: ${maskCurrency(s.base_salary)}`, type: 'salary' }));
    (warn || []).forEach((w: any) => events.push({ date: w.warning_date, title: `Advertência ${w.warning_type}`, type: 'warning' }));
    (aw || []).forEach((a: any) => events.push({ date: a.award_date, title: `Premiação: ${a.name}`, type: 'award' }));
    (audit || []).forEach((a: any) => events.push({ date: a.created_at, title: `${a.action} — ${a.entity}`, type: 'audit' }));
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setTimeline(events);
  };

  if (!employee) return <div className="p-8 text-center text-gray-400">Carregando perfil...</div>;

  const tenure = employee.admission_date ? monthsBetween(employee.admission_date) : 0;

  return (
    <div className="space-y-6">
      <RhPageHeader
        title={employee.full_name}
        subtitle={`${(employee as any).rh_positions?.name || 'Sem cargo'} · ${(employee as any).rh_departments?.name || 'Sem departamento'}`}
        onBack={onBack}
        actions={<button type="button" onClick={onEdit} className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase">Editar</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border p-6 text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-3xl font-black text-gray-400 overflow-hidden">
            {employee.photo_url ? <img src={employee.photo_url} alt="" className="w-full h-full object-cover" /> : employee.full_name.charAt(0)}
          </div>
          <h2 className="mt-4 font-black text-lg">{employee.full_name}</h2>
          <p className="text-sm text-gray-500">Matrícula {employee.matricula || '—'}</p>
          <p className="text-xs text-red-600 font-bold mt-2 uppercase">{employee.status}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
            <div><span className="text-gray-400 text-xs">Tempo empresa</span><p className="font-bold">{tenure} meses</p></div>
            <div><span className="text-gray-400 text-xs">Admissão</span><p className="font-bold">{employee.admission_date ? formatDateBR(employee.admission_date) : '—'}</p></div>
            <div><span className="text-gray-400 text-xs">CPF</span><p className="font-bold">{employee.cpf || '—'}</p></div>
            <div><span className="text-gray-400 text-xs">E-mail</span><p className="font-bold truncate">{employee.email || '—'}</p></div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border p-4"><DollarSign size={16} className="text-red-500" /><p className="text-[10px] uppercase text-gray-400 mt-2">Salário atual</p><p className="font-black">{maskCurrency(salaryHistory[0]?.base_salary || 0)}</p></div>
            <div className="bg-white rounded-xl border p-4"><Trophy size={16} className="text-amber-500" /><p className="text-[10px] uppercase text-gray-400 mt-2">Premiações</p><p className="font-black">{awards.length}</p></div>
            <div className="bg-white rounded-xl border p-4"><Gift size={16} className="text-green-500" /><p className="text-[10px] uppercase text-gray-400 mt-2">Bonificações</p><p className="font-black">{bonuses.length}</p></div>
            <div className="bg-white rounded-xl border p-4"><AlertTriangle size={16} className="text-red-500" /><p className="text-[10px] uppercase text-gray-400 mt-2">Advertências</p><p className="font-black">{warnings.length}</p></div>
          </div>

          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-bold text-sm uppercase mb-4 flex items-center gap-2"><Calendar size={16} /> Timeline</h3>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {timeline.length === 0 ? <p className="text-gray-400 text-sm">Sem eventos registrados.</p> : timeline.map((ev, i) => (
                <div key={i} className="flex gap-3 items-start border-l-2 border-red-200 pl-4">
                  <p className="text-[10px] text-gray-400 w-20 shrink-0">{formatDateBR(ev.date)}</p>
                  <p className="text-sm font-medium">{ev.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Comissões recentes" icon={TrendingUp} items={commissions} render={(c) => `${c.description || c.mission_id} — ${maskCurrency(c.commission_amount)}`} />
        <Section title="Pontos registrados" icon={Clock} items={timeClock} render={(t) => `${t.type} — ${new Date(t.timestamp).toLocaleString('pt-BR')}`} />
        <Section title="Histórico salarial" icon={DollarSign} items={salaryHistory} render={(s) => `${formatDateBR(s.effective_from)} — ${maskCurrency(s.base_salary)}`} />
        <Section title="Advertências" icon={AlertTriangle} items={warnings} render={(w) => `${w.warning_type}: ${w.reason}`} />
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: any; items: any[]; render: (item: any) => string }> = ({ title, icon: Icon, items, render }) => (
  <div className="bg-white rounded-2xl border p-5">
    <h3 className="font-bold text-sm uppercase mb-3 flex items-center gap-2"><Icon size={16} /> {title}</h3>
    {items.length === 0 ? <p className="text-gray-400 text-sm">Nenhum registro.</p> : (
      <ul className="space-y-2 text-sm">{items.map((item, i) => <li key={item.id || i} className="border-b border-gray-50 pb-2">{render(item)}</li>)}</ul>
    )}
  </div>
);

export default RhEmployeeProfile;
