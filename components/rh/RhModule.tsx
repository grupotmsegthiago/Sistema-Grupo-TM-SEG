import React from 'react';
import RhDashboard from './RhDashboard';
import RhEmployeeList from './RhEmployeeList';
import RhEmployeeForm from './RhEmployeeForm';
import RhEmployeeProfile from './RhEmployeeProfile';
import RhCrudList from './RhCrudList';
import RhPayrollTable from './RhPayrollTable';
import TimeClockSystem from '../TimeClockSystem';
import RHPointReport from '../RHPointReport';
import {
  Building2, Briefcase, Gift, Trophy, Star, AlertTriangle, Plane, Stethoscope,
  FileText, Settings, Clock, UserPlus, BarChart3,
} from 'lucide-react';

interface RhModuleProps {
  screen: string;
  selectedId: string | null;
  onNavigate: (screen: string) => void;
  onEdit: (screen: string, id: string) => void;
}

const RhReports: React.FC = () => (
  <div>
    <RhPageHeader title="Relatórios RH" subtitle="Exportação PDF, Excel e CSV" icon={BarChart3} />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {['Folha salarial', 'Funcionários', 'Horas / Ponto', 'Horas extras', 'Comissões', 'Premiações', 'Bonificações', 'Faltas', 'Atrasos', 'Férias'].map((r) => (
        <div key={r} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow">
          <h3 className="font-bold text-sm uppercase">{r}</h3>
          <p className="text-xs text-gray-500 mt-2">Disponível via exportação CSV na tela correspondente ou folha de pagamento.</p>
        </div>
      ))}
    </div>
  </div>
);

const RhSettings: React.FC = () => {
  const [inssRows, setInssRows] = React.useState<any[]>([]);
  React.useEffect(() => {
    supabase.from('rh_tax_brackets').select('*').order('bracket_from').then(({ data }) => setInssRows(data || []));
  }, []);
  return (
    <div>
      <RhPageHeader title="Configurações RH" subtitle="Faixas INSS/IRRF e parâmetros" icon={Settings} />
      <div className="bg-white rounded-2xl border p-6">
        <h3 className="font-bold text-sm uppercase mb-4">Faixas INSS / IRRF (2026)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 uppercase text-xs"><th className="py-2">Tipo</th><th>De</th><th>Até</th><th>Alíquota</th><th>Dedução</th></tr></thead>
            <tbody>
              {inssRows.map((r) => (
                <tr key={r.id} className="border-t"><td className="py-2">{r.tax_type}</td><td>{r.bracket_from}</td><td>{r.bracket_to || '—'}</td><td>{r.rate_pct}%</td><td>{r.deduction}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-4">Atualize as faixas diretamente na tabela rh_tax_brackets no Supabase quando houver mudança legal.</p>
      </div>
    </div>
  );
};

const RhSalaries: React.FC<{ onNavigate: (s: string) => void; onEdit: (s: string, id: string) => void }> = ({ onNavigate, onEdit }) => (
  <RhEmployeeList onAdd={() => onNavigate('rh-employee-form')} onEdit={(id) => onEdit('rh-employee-form', id)} onProfile={(id) => onEdit('rh-employee-profile', id)} />
);

const RhModule: React.FC<RhModuleProps> = ({ screen, selectedId, onNavigate, onEdit }) => {
  switch (screen) {
    case 'rh-dashboard': return <RhDashboard />;
    case 'rh-employees': return <RhEmployeeList onAdd={() => onNavigate('rh-employee-form')} onEdit={(id) => onEdit('rh-employee-form', id)} onProfile={(id) => onEdit('rh-employee-profile', id)} />;
    case 'rh-employee-form': return <RhEmployeeForm id={selectedId} onBack={() => onNavigate('rh-employees')} />;
    case 'rh-employee-profile': return selectedId ? <RhEmployeeProfile id={selectedId} onBack={() => onNavigate('rh-employees')} onEdit={() => onEdit('rh-employee-form', selectedId)} /> : <RhEmployeeList onAdd={() => onNavigate('rh-employee-form')} onEdit={(id) => onEdit('rh-employee-form', id)} onProfile={(id) => onEdit('rh-employee-profile', id)} />;
    case 'rh-admissions': return (
      <RhCrudList title="Admissões" subtitle="Processo admissional" table="rh_admissions" icon={UserPlus}
        fields={[
          { key: 'candidate_name', label: 'Candidato', required: true },
          { key: 'expected_admission', label: 'Previsão admissão', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Em andamento', label: 'Em andamento' }, { value: 'Concluída', label: 'Concluída' }, { value: 'Cancelada', label: 'Cancelada' }] },
          { key: 'notes', label: 'Observações', type: 'textarea' },
        ]}
        columns={[{ key: 'candidate_name', label: 'Candidato' }, { key: 'expected_admission', label: 'Previsão' }, { key: 'status', label: 'Status' }]}
      />
    );
    case 'rh-positions': return (
      <RhCrudList title="Cargos" table="rh_positions" icon={Briefcase}
        fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'cbo_code', label: 'CBO' }, { key: 'base_salary', label: 'Salário base', type: 'number' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
        columns={[{ key: 'name', label: 'Cargo' }, { key: 'cbo_code', label: 'CBO' }, { key: 'base_salary', label: 'Salário base' }]}
      />
    );
    case 'rh-departments': return (
      <RhCrudList title="Departamentos" table="rh_departments" icon={Building2}
        fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'code', label: 'Código' }, { key: 'cost_center', label: 'Centro de custo' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
        columns={[{ key: 'name', label: 'Departamento' }, { key: 'code', label: 'Código' }, { key: 'cost_center', label: 'Centro de custo' }]}
      />
    );
    case 'rh-salaries': return <RhSalaries onNavigate={onNavigate} onEdit={onEdit} />;
    case 'rh-benefits': return (
      <RhCrudList title="Benefícios" table="rh_benefits" icon={Gift}
        fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'benefit_type', label: 'Tipo', required: true }, { key: 'default_value', label: 'Valor padrão', type: 'number' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
        columns={[{ key: 'name', label: 'Benefício' }, { key: 'benefit_type', label: 'Tipo' }, { key: 'default_value', label: 'Valor' }]}
      />
    );
    case 'rh-work-schedule': return (
      <RhCrudList title="Jornada de Trabalho" table="rh_work_schedules" icon={Clock}
        fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'weekly_hours', label: 'Horas semanais', type: 'number' }, { key: 'tolerance_minutes', label: 'Tolerância (min)', type: 'number' }]}
        columns={[{ key: 'name', label: 'Jornada' }, { key: 'weekly_hours', label: 'Horas/sem' }, { key: 'tolerance_minutes', label: 'Tolerância' }]}
      />
    );
    case 'rh-timeclock': return <TimeClockSystem />;
    case 'rh-point-report': return <RHPointReport />;
    case 'rh-commissions': return (
      <RhCrudList title="Regras de Comissão" subtitle="Integração automática com OS finalizadas" table="rh_commission_rules" icon={Star}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'name', label: 'Nome regra', required: true },
          { key: 'rule_type', label: 'Tipo', type: 'select', options: RH_COMMISSION_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'calc_type', label: 'Cálculo', type: 'select', options: [{ value: 'fixed', label: 'Valor fixo' }, { value: 'percent', label: 'Percentual' }] },
          { key: 'fixed_value', label: 'Valor fixo (R$)', type: 'number' },
          { key: 'percent_value', label: 'Percentual (%)', type: 'number' },
          { key: 'min_threshold', label: 'Valor mínimo', type: 'number' },
          { key: 'client_filter', label: 'Filtro cliente' },
        ]}
        columns={[{ key: 'name', label: 'Regra' }, { key: 'rule_type', label: 'Tipo' }, { key: 'calc_type', label: 'Cálculo' }, { key: 'fixed_value', label: 'Fixo' }, { key: 'percent_value', label: '%' }]}
      />
    );
    case 'rh-awards': return (
      <RhCrudList title="Premiações" table="rh_awards" icon={Trophy}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'name', label: 'Nome', required: true },
          { key: 'amount', label: 'Valor', type: 'number', required: true },
          { key: 'award_date', label: 'Data', type: 'date' },
          { key: 'reason', label: 'Motivo' },
          { key: 'responsible', label: 'Responsável' },
          { key: 'status', label: 'Status', type: 'select', options: RH_PAYMENT_STATUS.map((s) => ({ value: s, label: s })) },
        ]}
        columns={[{ key: 'name', label: 'Premiação' }, { key: 'amount', label: 'Valor' }, { key: 'award_date', label: 'Data' }, { key: 'status', label: 'Status' }]}
      />
    );
    case 'rh-bonuses': return (
      <RhCrudList title="Bonificações" table="rh_bonuses" icon={Gift}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'bonus_type', label: 'Tipo', type: 'select', options: RH_BONUS_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'amount', label: 'Valor', type: 'number', required: true },
          { key: 'description', label: 'Descrição', type: 'textarea' },
          { key: 'status', label: 'Status', type: 'select', options: RH_PAYMENT_STATUS.map((s) => ({ value: s, label: s })) },
        ]}
        columns={[{ key: 'bonus_type', label: 'Tipo' }, { key: 'amount', label: 'Valor' }, { key: 'status', label: 'Status' }]}
      />
    );
    case 'rh-warnings': return (
      <RhCrudList title="Advertências" table="rh_warnings" icon={AlertTriangle}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'warning_date', label: 'Data', type: 'date' },
          { key: 'warning_type', label: 'Tipo', type: 'select', options: RH_WARNING_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'reason', label: 'Motivo', required: true, type: 'textarea' },
          { key: 'responsible', label: 'Responsável' },
        ]}
        columns={[{ key: 'warning_date', label: 'Data' }, { key: 'warning_type', label: 'Tipo' }, { key: 'reason', label: 'Motivo' }]}
      />
    );
    case 'rh-vacations': return (
      <RhCrudList title="Férias" table="rh_vacations" icon={Plane}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'start_date', label: 'Início', type: 'date' },
          { key: 'end_date', label: 'Fim', type: 'date' },
          { key: 'return_date', label: 'Retorno', type: 'date' },
          { key: 'days_sold', label: 'Dias vendidos', type: 'number' },
          { key: 'status', label: 'Status' },
        ]}
        columns={[{ key: 'start_date', label: 'Início' }, { key: 'end_date', label: 'Fim' }, { key: 'status', label: 'Status' }]}
      />
    );
    case 'rh-leaves': return (
      <RhCrudList title="Afastamentos" table="rh_leaves" icon={Stethoscope}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'leave_type', label: 'Motivo', type: 'select', options: RH_LEAVE_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'start_date', label: 'Início', type: 'date', required: true },
          { key: 'end_date', label: 'Fim', type: 'date' },
          { key: 'reason', label: 'Descrição', type: 'textarea' },
        ]}
        columns={[{ key: 'leave_type', label: 'Tipo' }, { key: 'start_date', label: 'Início' }, { key: 'end_date', label: 'Fim' }]}
      />
    );
    case 'rh-payslips': return (
      <RhCrudList title="Holerites" table="rh_payslips" icon={FileText}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'reference_month', label: 'Mês (YYYY-MM)', required: true },
          { key: 'file_url', label: 'URL do arquivo' },
        ]}
        columns={[{ key: 'reference_month', label: 'Referência' }, { key: 'employee_id', label: 'Funcionário' }]}
      />
    );
    case 'rh-payroll': return <RhPayrollTable />;
    case 'rh-reports': return <RhReports />;
    case 'rh-settings': return <RhSettings />;
  case 'rh-exams': return (
      <RhCrudList title="Exames Médicos" table="rh_medical_exams" icon={Stethoscope}
        fields={[
          { key: 'employee_id', label: 'ID Funcionário', required: true },
          { key: 'exam_type', label: 'Tipo', type: 'select', options: RH_EXAM_TYPES.map((t) => ({ value: t, label: t })) },
          { key: 'exam_date', label: 'Data exame', type: 'date', required: true },
          { key: 'expiry_date', label: 'Validade', type: 'date' },
          { key: 'clinic_name', label: 'Clínica' },
          { key: 'result', label: 'Resultado' },
        ]}
        columns={[{ key: 'exam_type', label: 'Tipo' }, { key: 'exam_date', label: 'Data' }, { key: 'expiry_date', label: 'Validade' }]}
      />
    );
    default: return <RhDashboard />;
  }
};

export default RhModule;
