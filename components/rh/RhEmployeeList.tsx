import React, { useEffect, useState } from 'react';
import { Plus, Users, Eye, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';
import RhPageHeader from './shared/RhPageHeader';
import RhDataTable from './shared/RhDataTable';
import type { RhEmployee } from '../../types/rh';
import { canEditRh } from '../../lib/rh/permissions';

interface Props {
  onAdd: () => void;
  onEdit: (id: string) => void;
  onProfile: (id: string) => void;
}

const RhEmployeeList: React.FC<Props> = ({ onAdd, onEdit, onProfile }) => {
  const [rows, setRows] = useState<RhEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const editable = canEditRh();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rh_employees')
      .select('*, rh_positions(name), rh_departments(name)')
      .is('deleted_at', null)
      .order('full_name');
    setRows((data as RhEmployee[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useRealtimeRefresh('rh_employees', load);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Ativo: 'bg-green-100 text-green-700',
      'Férias': 'bg-blue-100 text-blue-700',
      Afastado: 'bg-amber-100 text-amber-700',
      Desligado: 'bg-gray-200 text-gray-600',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  return (
    <div>
      <RhPageHeader
        title="Funcionários"
        subtitle="Cadastro completo de colaboradores"
        icon={Users}
        actions={editable && (
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-xs font-bold uppercase">
            <Plus size={16} /> Novo funcionário
          </button>
        )}
      />
      {loading ? <p className="text-gray-400">Carregando...</p> : (
        <RhDataTable
          data={rows}
          searchKeys={['full_name', 'matricula', 'cpf', 'email', 'status']}
          onRowClick={(r) => onProfile(r.id)}
          columns={[
            { key: 'matricula', label: 'Matrícula' },
            { key: 'full_name', label: 'Nome' },
            { key: 'department', label: 'Departamento', render: (r) => (r as any).rh_departments?.name || '—' },
            { key: 'position', label: 'Cargo', render: (r) => (r as any).rh_positions?.name || '—' },
            { key: 'status', label: 'Situação', render: (r) => statusBadge(r.status) },
            { key: 'actions', label: 'Ações', sortable: false, render: (r) => (
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => onProfile(r.id)} className="p-1.5 rounded border hover:bg-gray-50"><Eye size={14} /></button>
                {editable && <button type="button" onClick={() => onEdit(r.id)} className="p-1.5 rounded border hover:bg-gray-50"><Pencil size={14} /></button>}
              </div>
            )},
          ]}
        />
      )}
    </div>
  );
};

export default RhEmployeeList;
