import React, { useEffect, useState } from 'react';
import { Building2, Briefcase, Gift, Settings, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import RhCrudList from './RhCrudList';
import RhPayrollTable from './RhPayrollTable';

/** Cadastros auxiliares e folha global — embutido no dashboard RH. */
const RhAdminSettings: React.FC = () => {
  const [section, setSection] = useState<'dept' | 'pos' | 'benefits' | 'payroll' | 'tax'>('dept');
  const [taxRows, setTaxRows] = useState<any[]>([]);

  useEffect(() => {
    if (section === 'tax') {
      supabase.from('rh_tax_brackets').select('*').order('bracket_from').then(({ data }) => setTaxRows(data || []));
    }
  }, [section]);

  const btn = (id: typeof section, label: string, icon: any) => (
    <button
      key={id}
      type="button"
      onClick={() => setSection(id)}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase ${section === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
    >
      {React.createElement(icon, { size: 13 })} {label}
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold uppercase text-gray-700">
        <Settings size={16} /> Configurações da empresa
      </div>
      <div className="flex flex-wrap gap-2">
        {btn('dept', 'Departamentos', Building2)}
        {btn('pos', 'Cargos', Briefcase)}
        {btn('benefits', 'Benefícios', Gift)}
        {btn('payroll', 'Folha geral', Wallet)}
        {btn('tax', 'INSS / IRRF', Settings)}
      </div>

      {section === 'dept' && (
        <RhCrudList title="Departamentos" table="rh_departments" icon={Building2}
          fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'code', label: 'Código' }, { key: 'cost_center', label: 'Centro de custo' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
          columns={[{ key: 'name', label: 'Departamento' }, { key: 'code', label: 'Código' }]}
        />
      )}
      {section === 'pos' && (
        <RhCrudList title="Cargos" table="rh_positions" icon={Briefcase}
          fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'cbo_code', label: 'CBO' }, { key: 'base_salary', label: 'Salário base', type: 'number' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
          columns={[{ key: 'name', label: 'Cargo' }, { key: 'cbo_code', label: 'CBO' }]}
        />
      )}
      {section === 'benefits' && (
        <RhCrudList title="Catálogo de benefícios" table="rh_benefits" icon={Gift}
          fields={[{ key: 'name', label: 'Nome', required: true }, { key: 'benefit_type', label: 'Tipo', required: true }, { key: 'default_value', label: 'Valor padrão', type: 'number' }, { key: 'description', label: 'Descrição', type: 'textarea' }]}
          columns={[{ key: 'name', label: 'Benefício' }, { key: 'benefit_type', label: 'Tipo' }]}
        />
      )}
      {section === 'payroll' && <RhPayrollTable />}
      {section === 'tax' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 uppercase text-xs"><th className="py-2">Tipo</th><th>De</th><th>Até</th><th>Alíquota</th><th>Dedução</th></tr></thead>
            <tbody>
              {taxRows.map((r) => (
                <tr key={r.id} className="border-t"><td className="py-2">{r.tax_type}</td><td>{r.bracket_from}</td><td>{r.bracket_to || '—'}</td><td>{r.rate_pct}%</td><td>{r.deduction}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Atualize em rh_tax_brackets no Supabase quando houver mudança legal.</p>
        </div>
      )}
    </div>
  );
};

export default RhAdminSettings;
