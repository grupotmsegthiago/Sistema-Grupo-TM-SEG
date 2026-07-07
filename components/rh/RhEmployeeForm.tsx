import React, { useEffect, useState, useMemo } from 'react';
import { Save, Loader2, User, Building2, FileText, Landmark, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../lib/NotificationContext';
import RhPageHeader from './shared/RhPageHeader';
import { RH_INPUT_CLASS, RH_SELECT_CLASS, RH_LABEL_CLASS, RH_CONTRACT_TYPES, RH_EMPLOYEE_STATUS } from '../../lib/rh/constants';
import { maskCpf, maskPhone, maskCep, maskCurrency, parseCurrencyInput } from '../../lib/rh/masks';
import { calcSalary } from '../../lib/rh/payroll';
import { logRhAudit } from '../../lib/rh/audit';
import type { RhEmployee, RhSalaryConfig, RhTaxBracket } from '../../types/rh';

type Tab = 'pessoal' | 'empresa' | 'salario' | 'banco' | 'documentos';

interface Props {
  id?: string | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
}

const emptyEmployee: Partial<RhEmployee> = {
  status: 'Ativo',
  contract_type: 'CLT',
  nationality: 'Brasileira',
};

const emptySalary: RhSalaryConfig = {
  employee_id: '',
  base_salary: 0,
  fgts_pct: 8,
  overtime_rate_pct: 50,
};

const RhEmployeeForm: React.FC<Props> = ({ id, onBack, onSaved }) => {
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<Tab>('pessoal');
  const [form, setForm] = useState<Partial<RhEmployee>>(emptyEmployee);
  const [salary, setSalary] = useState<RhSalaryConfig>(emptySalary);
  const [bank, setBank] = useState<any>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [taxBrackets, setTaxBrackets] = useState<{ inss: RhTaxBracket[]; irrf: RhTaxBracket[] }>({ inss: [], irrf: [] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => { loadRefs(); if (id) loadEmployee(id); }, [id]);

  const payroll = useMemo(() => {
    if (!salary.base_salary) return null;
    return calcSalary({ ...salary, employee_id: id || '' }, taxBrackets);
  }, [salary, taxBrackets, id]);

  const loadRefs = async () => {
    const [{ data: deps }, { data: pos }, { data: us }, { data: taxes }] = await Promise.all([
      supabase.from('rh_departments').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('rh_positions').select('id, name, department_id').is('deleted_at', null).order('name'),
      supabase.from('system_users').select('id, name, email').eq('user_type', 'internal').order('name'),
      supabase.from('rh_tax_brackets').select('*').eq('active', true),
    ]);
    setDepartments(deps || []);
    setPositions(pos || []);
    setUsers(us || []);
    const rows = (taxes || []) as RhTaxBracket[];
    setTaxBrackets({ inss: rows.filter((t) => t.tax_type === 'INSS'), irrf: rows.filter((t) => t.tax_type === 'IRRF') });
  };

  const loadEmployee = async (empId: string) => {
    setLoading(true);
    const { data } = await supabase.from('rh_employees').select('*').eq('id', empId).single();
    if (data) setForm(data);
    const { data: sal } = await supabase.from('rh_salary_configs').select('*').eq('employee_id', empId).is('deleted_at', null).order('effective_from', { ascending: false }).limit(1).maybeSingle();
    if (sal) setSalary(sal);
    const { data: bnk } = await supabase.from('rh_employee_bank_accounts').select('*').eq('employee_id', empId).is('deleted_at', null).limit(1).maybeSingle();
    if (bnk) setBank(bnk);
    setLoading(false);
  };

  const set = (k: keyof RhEmployee, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setSal = (k: keyof RhSalaryConfig, v: any) => setSalary((s) => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!form.full_name?.trim()) {
      showNotification('error', 'Nome completo é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}');
      const payload = { ...form, updated_by: user.name };
      let employeeId = id;

      if (id) {
        const { error } = await supabase.from('rh_employees').update(payload).eq('id', id);
        if (error) throw error;
        await logRhAudit('rh_employees', id, 'update', form);
      } else {
        if (!payload.matricula) payload.matricula = `RH${Date.now().toString().slice(-6)}`;
        payload.created_by = user.name;
        const { data, error } = await supabase.from('rh_employees').insert([payload]).select().single();
        if (error) throw error;
        employeeId = data.id;
        await logRhAudit('rh_employees', employeeId!, 'create', data);
      }

      if (employeeId && salary.base_salary > 0) {
        const salPayload = { ...salary, employee_id: employeeId, updated_by: user.name };
        if (salary.id) await supabase.from('rh_salary_configs').update(salPayload).eq('id', salary.id);
        else await supabase.from('rh_salary_configs').insert([salPayload]);
      }

      if (employeeId && (bank.bank_name || bank.pix_key)) {
        const bankPayload = { ...bank, employee_id: employeeId, is_primary: true };
        if (bank.id) await supabase.from('rh_employee_bank_accounts').update(bankPayload).eq('id', bank.id);
        else await supabase.from('rh_employee_bank_accounts').insert([bankPayload]);
      }

      showNotification('success', 'Funcionário salvo com sucesso!');
      onSaved?.(employeeId!);
      onBack();
    } catch (e: any) {
      showNotification('error', e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'pessoal', label: 'Dados Pessoais', icon: User },
    { id: 'empresa', label: 'Dados da Empresa', icon: Building2 },
    { id: 'salario', label: 'Salário', icon: DollarSign },
    { id: 'banco', label: 'Dados Bancários', icon: Landmark },
    { id: 'documentos', label: 'Documentos', icon: FileText },
  ];

  if (loading) return <div className="p-8 text-center text-gray-400">Carregando...</div>;

  return (
    <div>
      <RhPageHeader title={id ? 'Editar Funcionário' : 'Novo Funcionário'} onBack={onBack} />

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === t.id ? 'bg-black text-white' : 'bg-white border text-gray-600'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        {tab === 'pessoal' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><label className={RH_LABEL_CLASS}>Nome completo *</label><input className={RH_INPUT_CLASS} value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>CPF</label><input className={RH_INPUT_CLASS} value={form.cpf || ''} onChange={(e) => set('cpf', maskCpf(e.target.value))} /></div>
            <div><label className={RH_LABEL_CLASS}>RG</label><input className={RH_INPUT_CLASS} value={form.rg || ''} onChange={(e) => set('rg', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>CNH</label><input className={RH_INPUT_CLASS} value={form.cnh || ''} onChange={(e) => set('cnh', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Categoria CNH</label><input className={RH_INPUT_CLASS} value={form.cnh_category || ''} onChange={(e) => set('cnh_category', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Validade CNH</label><input type="date" className={RH_INPUT_CLASS} value={form.cnh_expiry || ''} onChange={(e) => set('cnh_expiry', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Data nascimento</label><input type="date" className={RH_INPUT_CLASS} value={form.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Estado civil</label><input className={RH_INPUT_CLASS} value={form.marital_status || ''} onChange={(e) => set('marital_status', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Telefone</label><input className={RH_INPUT_CLASS} value={form.phone || ''} onChange={(e) => set('phone', maskPhone(e.target.value))} /></div>
            <div><label className={RH_LABEL_CLASS}>WhatsApp</label><input className={RH_INPUT_CLASS} value={form.whatsapp || ''} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} /></div>
            <div><label className={RH_LABEL_CLASS}>E-mail</label><input type="email" className={RH_INPUT_CLASS} value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>CEP</label><input className={RH_INPUT_CLASS} value={form.zip_code || ''} onChange={(e) => set('zip_code', maskCep(e.target.value))} /></div>
            <div className="md:col-span-2"><label className={RH_LABEL_CLASS}>Endereço</label><input className={RH_INPUT_CLASS} value={form.street || ''} onChange={(e) => set('street', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Número</label><input className={RH_INPUT_CLASS} value={form.address_number || ''} onChange={(e) => set('address_number', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Bairro</label><input className={RH_INPUT_CLASS} value={form.neighborhood || ''} onChange={(e) => set('neighborhood', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Cidade</label><input className={RH_INPUT_CLASS} value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Estado</label><input className={RH_INPUT_CLASS} value={form.state || ''} onChange={(e) => set('state', e.target.value)} /></div>
          </div>
        )}

        {tab === 'empresa' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={RH_LABEL_CLASS}>Matrícula</label><input className={RH_INPUT_CLASS} value={form.matricula || ''} onChange={(e) => set('matricula', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Admissão</label><input type="date" className={RH_INPUT_CLASS} value={form.admission_date || ''} onChange={(e) => set('admission_date', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Contratação</label><select className={RH_SELECT_CLASS} value={form.contract_type || 'CLT'} onChange={(e) => set('contract_type', e.target.value)}>{RH_CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className={RH_LABEL_CLASS}>Situação</label><select className={RH_SELECT_CLASS} value={form.status || 'Ativo'} onChange={(e) => set('status', e.target.value)}>{RH_EMPLOYEE_STATUS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className={RH_LABEL_CLASS}>Departamento</label><select className={RH_SELECT_CLASS} value={form.department_id || ''} onChange={(e) => set('department_id', e.target.value || null)}><option value="">Selecione</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className={RH_LABEL_CLASS}>Cargo</label><select className={RH_SELECT_CLASS} value={form.position_id || ''} onChange={(e) => set('position_id', e.target.value || null)}><option value="">Selecione</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={RH_LABEL_CLASS}>Centro de custo</label><input className={RH_INPUT_CLASS} value={form.cost_center || ''} onChange={(e) => set('cost_center', e.target.value)} /></div>
            <div><label className={RH_LABEL_CLASS}>Fim experiência</label><input type="date" className={RH_INPUT_CLASS} value={form.probation_end_date || ''} onChange={(e) => set('probation_end_date', e.target.value)} /></div>
            <div className="md:col-span-2"><label className={RH_LABEL_CLASS}>Vincular usuário do sistema</label><select className={RH_SELECT_CLASS} value={form.user_id || ''} onChange={(e) => set('user_id', e.target.value || null)}><option value="">Sem vínculo</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></div>
          </div>
        )}

        {tab === 'salario' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                ['base_salary', 'Salário Base'], ['night_shift_bonus', 'Adicional Noturno'], ['hazard_pay', 'Periculosidade'],
                ['unhealthy_pay', 'Insalubridade'], ['overtime_hours', 'Horas Extras (qtd)'], ['transport_voucher', 'Vale Transporte'],
                ['meal_voucher', 'Vale Alimentação'], ['food_voucher', 'Vale Refeição'], ['health_plan', 'Plano Saúde'],
                ['dental_plan', 'Plano Odontológico'], ['other_benefits', 'Outros Benefícios'], ['alimony', 'Pensão'],
                ['other_discounts', 'Outros Descontos'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className={RH_LABEL_CLASS}>{label}</label>
                  <input className={RH_INPUT_CLASS} value={String((salary as any)[key] ?? 0)}
                    onChange={(e) => setSal(key, ['overtime_hours'].includes(key) ? parseFloat(e.target.value) || 0 : parseCurrencyInput(e.target.value))} />
                </div>
              ))}
            </div>
            {payroll && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl">
                <div><p className="text-[10px] uppercase text-gray-400 font-bold">Bruto</p><p className="font-black">{maskCurrency(payroll.grossSalary)}</p></div>
                <div><p className="text-[10px] uppercase text-gray-400 font-bold">Benefícios</p><p className="font-black">{maskCurrency(payroll.totalBenefits)}</p></div>
                <div><p className="text-[10px] uppercase text-gray-400 font-bold">Descontos</p><p className="font-black text-red-600">{maskCurrency(payroll.totalDiscounts)}</p></div>
                <div><p className="text-[10px] uppercase text-gray-400 font-bold">Líquido</p><p className="font-black text-green-600">{maskCurrency(payroll.netSalary)}</p></div>
              </div>
            )}
          </div>
        )}

        {tab === 'banco' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={RH_LABEL_CLASS}>Banco</label><input className={RH_INPUT_CLASS} value={bank.bank_name || ''} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} /></div>
            <div><label className={RH_LABEL_CLASS}>Agência</label><input className={RH_INPUT_CLASS} value={bank.agency || ''} onChange={(e) => setBank({ ...bank, agency: e.target.value })} /></div>
            <div><label className={RH_LABEL_CLASS}>Conta</label><input className={RH_INPUT_CLASS} value={bank.account_number || ''} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} /></div>
            <div><label className={RH_LABEL_CLASS}>Tipo conta</label><input className={RH_INPUT_CLASS} value={bank.account_type || 'Corrente'} onChange={(e) => setBank({ ...bank, account_type: e.target.value })} /></div>
            <div><label className={RH_LABEL_CLASS}>PIX</label><input className={RH_INPUT_CLASS} value={bank.pix_key || ''} onChange={(e) => setBank({ ...bank, pix_key: e.target.value })} /></div>
            <div><label className={RH_LABEL_CLASS}>Favorecido</label><input className={RH_INPUT_CLASS} value={bank.beneficiary_name || ''} onChange={(e) => setBank({ ...bank, beneficiary_name: e.target.value })} /></div>
          </div>
        )}

        {tab === 'documentos' && (
          <p className="text-sm text-gray-500">Upload de documentos disponível no perfil do funcionário após o cadastro (CPF, RG, CNH, CTPS, contrato e outros).</p>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button type="button" onClick={onBack} className="px-6 py-2.5 border rounded-lg text-sm font-bold uppercase">Cancelar</button>
        <button type="button" disabled={saving} onClick={handleSave} className="inline-flex items-center gap-2 px-8 py-2.5 bg-black text-white rounded-lg text-sm font-bold uppercase disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Salvar
        </button>
      </div>
    </div>
  );
};

export default RhEmployeeForm;
