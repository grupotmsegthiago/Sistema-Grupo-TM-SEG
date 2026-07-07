import React, { useEffect, useState } from 'react';
import { Plus, Users, AlertCircle } from 'lucide-react';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';
import { fetchRhEmployees } from '../../lib/rh/fetchRhEmployees';
import RhPageHeader from './shared/RhPageHeader';
import RhDataTable from './shared/RhDataTable';
import type { RhEmployee } from '../../types/rh';
import { canEditRh } from '../../lib/rh/permissions';

interface Props {
  onAdd: () => void;
  onOpen: (id: string) => void;
}

const RhEmployeeList: React.FC<Props> = ({ onAdd, onOpen }) => {
  const [rows, setRows] = useState<RhEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const editable = canEditRh();

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const { rows: data, error } = await fetchRhEmployees();
    setRows(data);
    if (error && data.length === 0) setLoadError(error);
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
        subtitle="Abra a pasta do colaborador — cadastro, salários, comissões, férias e documentos em abas"
        icon={Users}
        actions={editable && (
          <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-xs font-bold uppercase">
            <Plus size={16} /> Novo funcionário
          </button>
        )}
      />
      {loadError && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Nenhum funcionário visível</p>
            <p className="mt-1 text-xs">{loadError}</p>
          </div>
        </div>
      )}
      {loading ? <p className="text-gray-400">Carregando...</p> : (
        <RhDataTable
          data={rows}
          searchKeys={['full_name', 'matricula', 'cpf', 'email', 'status']}
          onRowClick={(r) => onOpen(r.id)}
          columns={[
            { key: 'matricula', label: 'Matrícula' },
            { key: 'full_name', label: 'Nome' },
            { key: 'department', label: 'Departamento', render: (r) => (r as any).rh_departments?.name || '—' },
            { key: 'position', label: 'Cargo', render: (r) => (r as any).rh_positions?.name || '—' },
            { key: 'status', label: 'Situação', render: (r) => statusBadge(r.status) },
          ]}
        />
      )}
    </div>
  );
};

export default RhEmployeeList;
