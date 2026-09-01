import React, { useState } from 'react';
import {
  User, DollarSign, FileText, Star, Trophy, Gift, Plane, AlertTriangle,
  Stethoscope, Receipt, TrendingUp,
} from 'lucide-react';
import RhPageHeader from './shared/RhPageHeader';
import RhEmployeeForm from './RhEmployeeForm';
import RhEmployeeScopedCrud from './RhEmployeeScopedCrud';
import RhEmployeeDocuments from './RhEmployeeDocuments';
import RhMedicalExams from './RhMedicalExams';
import RhWarnings from './RhWarnings';
import { maskCurrency } from '../../lib/rh/masks';
import {
  RH_BONUS_TYPES, RH_COMMISSION_TYPES, RH_LEAVE_TYPES,
  RH_PAYMENT_STATUS,
} from '../../lib/rh/constants';

export type RhEmployeeTab =
  | 'cadastro'
  | 'salario'
  | 'documentos'
  | 'comissoes'
  | 'premiacoes'
  | 'bonificacoes'
  | 'holerites'
  | 'ferias'
  | 'afastamentos'
  | 'advertencias'
  | 'exames';

interface Props {
  id?: string | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
}

const TABS: { id: RhEmployeeTab; label: string; icon: any; needsId?: boolean }[] = [
  { id: 'cadastro', label: 'Cadastro', icon: User },
  { id: 'salario', label: 'Salário', icon: DollarSign, needsId: true },
  { id: 'documentos', label: 'Documentos', icon: FileText, needsId: true },
  { id: 'comissoes', label: 'Comissões', icon: Star, needsId: true },
  { id: 'premiacoes', label: 'Premiações', icon: Trophy, needsId: true },
  { id: 'bonificacoes', label: 'Bonificações', icon: Gift, needsId: true },
  { id: 'holerites', label: 'Holerites', icon: Receipt, needsId: true },
  { id: 'ferias', label: 'Férias', icon: Plane, needsId: true },
  { id: 'afastamentos', label: 'Faltas / Afastamentos', icon: Stethoscope, needsId: true },
  { id: 'advertencias', label: 'Advertências', icon: AlertTriangle, needsId: true },
  { id: 'exames', label: 'Exames', icon: TrendingUp, needsId: true },
];

const RhEmployeeWorkspace: React.FC<Props> = ({ id, onBack, onSaved }) => {
  const [employeeId, setEmployeeId] = useState<string | null>(id || null);
  const [tab, setTab] = useState<RhEmployeeTab>('cadastro');
  const [employeeName, setEmployeeName] = useState('');

  const handleSaved = (newId: string) => {
    setEmployeeId(newId);
    onSaved?.(newId);
  };

  const activeId = employeeId || id;

  return (
    <div>
      <RhPageHeader
        title={activeId ? (employeeName || 'Funcionário') : 'Novo funcionário'}
        subtitle={activeId ? 'Pasta do colaborador — todos os registros em um só lugar' : 'Preencha o cadastro para liberar as demais abas'}
        onBack={onBack}
      />

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200 pb-1 overflow-x-auto">
        {TABS.map((t) => {
          const disabled = t.needsId && !activeId;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => setTab(t.id)}
              title={disabled ? 'Salve o cadastro primeiro' : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[10px] font-bold uppercase whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-black text-white' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 shadow-sm min-h-[320px]">
        {(tab === 'cadastro' || tab === 'salario') && (
          <RhEmployeeForm
            id={activeId}
            embedded
            initialTab={tab === 'salario' ? 'salario' : 'pessoal'}
            onNameLoaded={setEmployeeName}
            onBack={onBack}
            onSaved={handleSaved}
          />
        )}

        {activeId && tab === 'documentos' && <RhEmployeeDocuments employeeId={activeId} />}

        {activeId && tab === 'comissoes' && (
          <div className="space-y-8">
            <RhEmployeeScopedCrud
              employeeId={activeId}
              title="Regras de comissão"
              table="rh_commission_rules"
              fields={[
                { key: 'name', label: 'Nome da regra', required: true },
                { key: 'rule_type', label: 'Tipo', type: 'select', options: RH_COMMISSION_TYPES.map((t) => ({ value: t, label: t })) },
                { key: 'calc_type', label: 'Cálculo', type: 'select', options: [{ value: 'fixed', label: 'Valor fixo' }, { value: 'percent', label: 'Percentual' }] },
                { key: 'fixed_value', label: 'Valor fixo (R$)', type: 'number' },
                { key: 'percent_value', label: 'Percentual (%)', type: 'number' },
                { key: 'min_threshold', label: 'Valor mínimo base', type: 'number' },
                { key: 'client_filter', label: 'Filtro cliente' },
                { key: 'service_filter', label: 'Filtro serviço' },
              ]}
              columns={[
                { key: 'name', label: 'Regra' },
                { key: 'rule_type', label: 'Tipo' },
                { key: 'calc_type', label: 'Cálculo' },
                { key: 'percent_value', label: '%' },
              ]}
            />
            <RhEmployeeScopedCrud
              employeeId={activeId}
              title="Comissões geradas (OS)"
              table="rh_commissions"
              fields={[
                { key: 'mission_id', label: 'OS' },
                { key: 'reference_month', label: 'Mês (YYYY-MM)' },
                { key: 'description', label: 'Descrição' },
                { key: 'base_amount', label: 'Base (R$)', type: 'number' },
                { key: 'commission_amount', label: 'Comissão (R$)', type: 'number', required: true },
                { key: 'status', label: 'Status', type: 'select', options: RH_PAYMENT_STATUS.map((s) => ({ value: s, label: s })) },
              ]}
              columns={[
                { key: 'mission_id', label: 'OS' },
                { key: 'reference_month', label: 'Mês' },
                { key: 'commission_amount', label: 'Valor', render: (r) => maskCurrency(r.commission_amount) },
                { key: 'status', label: 'Status' },
              ]}
            />
          </div>
        )}

        {activeId && tab === 'premiacoes' && (
          <RhEmployeeScopedCrud
            employeeId={activeId}
            title="Premiações"
            table="rh_awards"
            fields={[
              { key: 'name', label: 'Nome', required: true },
              { key: 'amount', label: 'Valor', type: 'number', required: true },
              { key: 'award_date', label: 'Data', type: 'date' },
              { key: 'reason', label: 'Motivo' },
              { key: 'responsible', label: 'Responsável' },
              { key: 'status', label: 'Status', type: 'select', options: RH_PAYMENT_STATUS.map((s) => ({ value: s, label: s })) },
            ]}
            columns={[
              { key: 'name', label: 'Premiação' },
              { key: 'amount', label: 'Valor', render: (r) => maskCurrency(r.amount) },
              { key: 'award_date', label: 'Data' },
              { key: 'status', label: 'Status' },
            ]}
          />
        )}

        {activeId && tab === 'bonificacoes' && (
          <RhEmployeeScopedCrud
            employeeId={activeId}
            title="Bonificações"
            table="rh_bonuses"
            fields={[
              { key: 'bonus_type', label: 'Tipo', type: 'select', options: RH_BONUS_TYPES.map((t) => ({ value: t, label: t })), required: true },
              { key: 'amount', label: 'Valor', type: 'number', required: true },
              { key: 'reference_month', label: 'Mês ref.' },
              { key: 'description', label: 'Descrição', type: 'textarea' },
              { key: 'status', label: 'Status', type: 'select', options: RH_PAYMENT_STATUS.map((s) => ({ value: s, label: s })) },
            ]}
            columns={[
              { key: 'bonus_type', label: 'Tipo' },
              { key: 'amount', label: 'Valor', render: (r) => maskCurrency(r.amount) },
              { key: 'reference_month', label: 'Mês' },
              { key: 'status', label: 'Status' },
            ]}
          />
        )}

        {activeId && tab === 'holerites' && (
          <RhEmployeeScopedCrud
            employeeId={activeId}
            title="Holerites"
            table="rh_payslips"
            fields={[
              { key: 'reference_month', label: 'Mês (YYYY-MM)', required: true },
              { key: 'file_url', label: 'URL do PDF / holerite' },
            ]}
            columns={[
              { key: 'reference_month', label: 'Referência' },
              { key: 'file_url', label: 'Arquivo', render: (r) => r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs font-bold">Abrir</a> : '—' },
            ]}
          />
        )}

        {activeId && tab === 'ferias' && (
          <RhEmployeeScopedCrud
            employeeId={activeId}
            title="Férias"
            table="rh_vacations"
            orderBy={{ column: 'start_date', ascending: false }}
            fields={[
              { key: 'start_date', label: 'Início', type: 'date' },
              { key: 'end_date', label: 'Fim', type: 'date' },
              { key: 'return_date', label: 'Retorno', type: 'date' },
              { key: 'days_sold', label: 'Dias vendidos', type: 'number' },
              { key: 'status', label: 'Status' },
            ]}
            columns={[
              { key: 'start_date', label: 'Início' },
              { key: 'end_date', label: 'Fim' },
              { key: 'status', label: 'Status' },
            ]}
          />
        )}

        {activeId && tab === 'afastamentos' && (
          <RhEmployeeScopedCrud
            employeeId={activeId}
            title="Faltas e afastamentos"
            table="rh_leaves"
            orderBy={{ column: 'start_date', ascending: false }}
            fields={[
              { key: 'leave_type', label: 'Motivo', type: 'select', options: RH_LEAVE_TYPES.map((t) => ({ value: t, label: t })), required: true },
              { key: 'start_date', label: 'Início', type: 'date', required: true },
              { key: 'end_date', label: 'Fim', type: 'date' },
              { key: 'reason', label: 'Descrição', type: 'textarea' },
            ]}
            columns={[
              { key: 'leave_type', label: 'Tipo' },
              { key: 'start_date', label: 'Início' },
              { key: 'end_date', label: 'Fim' },
            ]}
          />
        )}

        {activeId && tab === 'advertencias' && (
          <RhWarnings employeeId={activeId} />
        )}

        {activeId && tab === 'exames' && (
          <RhMedicalExams employeeId={activeId} />
        )}
      </div>
    </div>
  );
};

export default RhEmployeeWorkspace;
