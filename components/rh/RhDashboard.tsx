import React, { useEffect, useState } from 'react';
import { Users, UserCheck, Plane, AlertCircle, UserPlus, UserMinus, Wallet, Trophy, Gift, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import RhPageHeader from './shared/RhPageHeader';
import RhStatCard from './shared/RhStatCard';
import { supabase } from '../../lib/supabase';
import { maskCurrency } from '../../lib/rh/masks';

const COLORS = ['#dc2626', '#1f2937', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

const RhDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [payrollPreview, setPayrollPreview] = useState(0);
  const [commissions, setCommissions] = useState(0);
  const [awards, setAwards] = useState(0);
  const [bonuses, setBonuses] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const [{ data: employees }, { data: sal }, { data: comm }, { data: aw }, { data: bon }] = await Promise.all([
        supabase.from('rh_employees').select('status, department_id, admission_date, rh_departments(name)').is('deleted_at', null),
        supabase.from('rh_salary_configs').select('base_salary').is('deleted_at', null),
        supabase.from('rh_commissions').select('commission_amount').eq('reference_month', now.toISOString().slice(0, 7)).is('deleted_at', null),
        supabase.from('rh_awards').select('amount').is('deleted_at', null),
        supabase.from('rh_bonuses').select('amount').eq('reference_month', now.toISOString().slice(0, 7)).is('deleted_at', null),
      ]);

      const statusCount: Record<string, number> = {};
      const deptCount: Record<string, number> = {};
      let admissions = 0;
      (employees || []).forEach((e: any) => {
        statusCount[e.status] = (statusCount[e.status] || 0) + 1;
        const dn = e.rh_departments?.name || 'Sem departamento';
        deptCount[dn] = (deptCount[dn] || 0) + 1;
        if (e.admission_date && e.admission_date >= monthStart) admissions++;
      });

      setStats({
        totalEmployees: employees?.length || 0,
        activeEmployees: statusCount['Ativo'] || 0,
        onLeave: statusCount['Afastado'] || 0,
        onVacation: statusCount['Férias'] || 0,
        admissionsThisMonth: admissions,
        dismissalsThisMonth: statusCount['Desligado'] || 0,
        byDepartment: deptCount,
        byStatus: statusCount,
      });
      setPayrollPreview((sal || []).reduce((s, r) => s + Number(r.base_salary || 0), 0));
      setCommissions((comm || []).reduce((s, r) => s + Number(r.commission_amount || 0), 0));
      setAwards((aw || []).reduce((s, r) => s + Number(r.amount || 0), 0));
      setBonuses((bon || []).reduce((s, r) => s + Number(r.amount || 0), 0));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deptData = Object.entries(stats?.byDepartment || {}).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(stats?.byStatus || {}).map(([name, value]) => ({ name, value }));

  if (loading) return <div className="p-8 text-center text-gray-400">Carregando dashboard RH...</div>;

  return (
    <div className="space-y-6">
      <RhPageHeader title="Dashboard RH" subtitle="Visão geral de pessoas, folha e indicadores" icon={Users} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <RhStatCard title="Total Funcionários" value={stats?.totalEmployees || 0} icon={Users} />
        <RhStatCard title="Ativos" value={stats?.activeEmployees || 0} icon={UserCheck} color="bg-green-50 text-green-600" />
        <RhStatCard title="Afastados" value={stats?.onLeave || 0} icon={AlertCircle} color="bg-amber-50 text-amber-600" />
        <RhStatCard title="Férias" value={stats?.onVacation || 0} icon={Plane} color="bg-blue-50 text-blue-600" />
        <RhStatCard title="Admissões/mês" value={stats?.admissionsThisMonth || 0} icon={UserPlus} />
        <RhStatCard title="Demissões/mês" value={stats?.dismissalsThisMonth || 0} icon={UserMinus} color="bg-gray-100 text-gray-600" />
        <RhStatCard title="Folha prevista" value={maskCurrency(payrollPreview)} icon={Wallet} />
        <RhStatCard title="Comissões" value={maskCurrency(commissions)} icon={Star} />
        <RhStatCard title="Premiações" value={maskCurrency(awards)} icon={Trophy} />
        <RhStatCard title="Bonificações" value={maskCurrency(bonuses)} icon={Gift} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Funcionários por departamento</h3>
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

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Situação dos funcionários</h3>
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

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Evolução da folha (estimativa)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={[
            { mes: 'Jan', valor: payrollPreview * 0.9 },
            { mes: 'Fev', valor: payrollPreview * 0.92 },
            { mes: 'Mar', valor: payrollPreview * 0.95 },
            { mes: 'Abr', valor: payrollPreview * 0.97 },
            { mes: 'Mai', valor: payrollPreview * 0.99 },
            { mes: 'Jun', valor: payrollPreview },
          ]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" />
            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => maskCurrency(v)} />
            <Line type="monotone" dataKey="valor" stroke="#dc2626" strokeWidth={3} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RhDashboard;
