import React, { useEffect, useState } from 'react';
import { Users, UserCheck, Plane, AlertCircle, UserPlus, Wallet, Trophy, Gift, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import RhPageHeader from './shared/RhPageHeader';
import RhStatCard from './shared/RhStatCard';
import RhAdminSettings from './RhAdminSettings';
import { supabase } from '../../lib/supabase';
import { maskCurrency } from '../../lib/rh/masks';
import { RH_SELECT_CLASS, RH_LABEL_CLASS } from '../../lib/rh/constants';
import { canEditRh } from '../../lib/rh/permissions';

const COLORS = ['#dc2626', '#1f2937', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

const RhDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterId, setFilterId] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [employeeDetail, setEmployeeDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const showAdmin = canEditRh();

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { load(); }, [filterId]);

  const loadEmployees = async () => {
    const { data } = await supabase.from('rh_employees').select('id, full_name, status').is('deleted_at', null).order('full_name');
    setEmployees(data || []);
  };

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const month = now.toISOString().slice(0, 7);
      const monthStart = `${month}-01`;

      if (filterId) {
        const [{ data: emp }, { data: sal }, { data: comm }, { data: aw }, { data: bon }, { data: warn }] = await Promise.all([
          supabase.from('rh_employees').select('*, rh_positions(name), rh_departments(name)').eq('id', filterId).single(),
          supabase.from('rh_salary_configs').select('base_salary').eq('employee_id', filterId).is('deleted_at', null).order('effective_from', { ascending: false }).limit(1),
          supabase.from('rh_commissions').select('commission_amount').eq('employee_id', filterId).eq('reference_month', month).is('deleted_at', null),
          supabase.from('rh_awards').select('amount').eq('employee_id', filterId).is('deleted_at', null),
          supabase.from('rh_bonuses').select('amount').eq('employee_id', filterId).eq('reference_month', month).is('deleted_at', null),
          supabase.from('rh_warnings').select('id').eq('employee_id', filterId).is('deleted_at', null),
        ]);
        setEmployeeDetail(emp);
        setStats({
          totalEmployees: 1,
          activeEmployees: emp?.status === 'Ativo' ? 1 : 0,
          payrollPreview: Number(sal?.[0]?.base_salary || 0),
          commissions: (comm || []).reduce((s, r) => s + Number(r.commission_amount || 0), 0),
          awards: (aw || []).reduce((s, r) => s + Number(r.amount || 0), 0),
          bonuses: (bon || []).reduce((s, r) => s + Number(r.amount || 0), 0),
          warnings: warn?.length || 0,
          filtered: true,
        });
      } else {
        const [{ data: emps }, { data: sal }, { data: comm }, { data: aw }, { data: bon }] = await Promise.all([
          supabase.from('rh_employees').select('status, department_id, admission_date, rh_departments(name)').is('deleted_at', null),
          supabase.from('rh_salary_configs').select('base_salary').is('deleted_at', null),
          supabase.from('rh_commissions').select('commission_amount').eq('reference_month', month).is('deleted_at', null),
          supabase.from('rh_awards').select('amount').is('deleted_at', null),
          supabase.from('rh_bonuses').select('amount').eq('reference_month', month).is('deleted_at', null),
        ]);
        const statusCount: Record<string, number> = {};
        const deptCount: Record<string, number> = {};
        let admissions = 0;
        (emps || []).forEach((e: any) => {
          statusCount[e.status] = (statusCount[e.status] || 0) + 1;
          const dn = e.rh_departments?.name || 'Sem departamento';
          deptCount[dn] = (deptCount[dn] || 0) + 1;
          if (e.admission_date && e.admission_date >= monthStart) admissions++;
        });
        setEmployeeDetail(null);
        setStats({
          totalEmployees: emps?.length || 0,
          activeEmployees: statusCount['Ativo'] || 0,
          onLeave: statusCount['Afastado'] || 0,
          onVacation: statusCount['Férias'] || 0,
          admissionsThisMonth: admissions,
          byDepartment: deptCount,
          byStatus: statusCount,
          payrollPreview: (sal || []).reduce((s, r) => s + Number(r.base_salary || 0), 0),
          commissions: (comm || []).reduce((s, r) => s + Number(r.commission_amount || 0), 0),
          awards: (aw || []).reduce((s, r) => s + Number(r.amount || 0), 0),
          bonuses: (bon || []).reduce((s, r) => s + Number(r.amount || 0), 0),
          filtered: false,
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deptData = Object.entries(stats?.byDepartment || {}).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(stats?.byStatus || {}).map(([name, value]) => ({ name, value }));

  if (loading && !stats) return <div className="p-8 text-center text-gray-400">Carregando dashboard RH...</div>;

  return (
    <div className="space-y-6">
      <RhPageHeader title="Dashboard RH" subtitle="Visão geral — filtre por funcionário se necessário" icon={Users} />

      <div className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 max-w-md">
          <label className={RH_LABEL_CLASS}>Filtrar por funcionário</label>
          <select className={RH_SELECT_CLASS} value={filterId} onChange={(e) => setFilterId(e.target.value)}>
            <option value="">Todos os funcionários</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.status})</option>)}
          </select>
        </div>
        {employeeDetail && (
          <div className="text-sm">
            <p className="font-bold">{employeeDetail.full_name}</p>
            <p className="text-gray-500 text-xs">{(employeeDetail as any).rh_positions?.name || '—'} · {(employeeDetail as any).rh_departments?.name || '—'}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {!stats?.filtered && (
          <>
            <RhStatCard title="Total Funcionários" value={stats?.totalEmployees || 0} icon={Users} />
            <RhStatCard title="Ativos" value={stats?.activeEmployees || 0} icon={UserCheck} color="bg-green-50 text-green-600" />
            <RhStatCard title="Afastados" value={stats?.onLeave || 0} icon={AlertCircle} color="bg-amber-50 text-amber-600" />
            <RhStatCard title="Férias" value={stats?.onVacation || 0} icon={Plane} color="bg-blue-50 text-blue-600" />
            <RhStatCard title="Admissões/mês" value={stats?.admissionsThisMonth || 0} icon={UserPlus} />
          </>
        )}
        <RhStatCard title="Folha prevista" value={maskCurrency(stats?.payrollPreview || 0)} icon={Wallet} />
        <RhStatCard title="Comissões (mês)" value={maskCurrency(stats?.commissions || 0)} icon={Star} />
        <RhStatCard title="Premiações" value={maskCurrency(stats?.awards || 0)} icon={Trophy} />
        <RhStatCard title="Bonificações (mês)" value={maskCurrency(stats?.bonuses || 0)} icon={Gift} />
        {stats?.filtered && stats.warnings != null && (
          <RhStatCard title="Advertências" value={stats.warnings} icon={AlertCircle} color="bg-red-50 text-red-600" />
        )}
      </div>

      {!stats?.filtered && deptData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Por departamento</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Por situação</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showAdmin && <RhAdminSettings />}
    </div>
  );
};

export default RhDashboard;
