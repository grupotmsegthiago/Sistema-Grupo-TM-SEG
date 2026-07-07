import React, { useEffect, useState } from 'react';
import { Plus, Users, AlertCircle, Upload, Loader2 } from 'lucide-react';
import { useRealtimeRefresh } from '../../lib/RealtimeProvider';
import { fetchRhEmployees } from '../../lib/rh/fetchRhEmployees';
import { authFetch } from '../../lib/authFetch';
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
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
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

  const importPlanilha = async () => {
    if (!editable || importing) return;
    setImporting(true);
    setImportMsg(null);
    setLoadError(null);
    try {
      const res = await authFetch('/api/rh/seed-employees', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Falha HTTP ${res.status}`);
      }
      const total = (json.created || 0) + (json.updated || 0);
      setImportMsg(`Importação concluída: ${total} funcionário(s) da planilha TM SEGURANÇA.`);
      if (json.errors?.length) {
        setLoadError(json.errors.join(' · '));
      }
      await load();
    } catch (e: any) {
      setLoadError(e?.message || 'Falha ao importar planilha');
    } finally {
      setImporting(false);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Ativo: 'bg-green-100 text-green-700',
      'Férias': 'bg-blue-100 text-blue-700',
      Afastado: 'bg-amber-100 text-amber-700',
      Desligado: 'bg-gray-200 text-gray-600',
      Experiência: 'bg-purple-100 text-purple-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  const showImportCta = editable && !loading && rows.length === 0;

  return (
    <div>
      <RhPageHeader
        title="Funcionários"
        subtitle="Abra a pasta do colaborador — cadastro, salários, comissões, férias e documentos em abas"
        icon={Users}
        actions={editable && (
          <div className="flex flex-wrap items-center gap-2">
            {showImportCta && (
              <button
                type="button"
                onClick={() => void importPlanilha()}
                disabled={importing}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-xs font-bold uppercase disabled:opacity-60"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Importar planilha TM SEG (12)
              </button>
            )}
            <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-xs font-bold uppercase">
              <Plus size={16} /> Novo funcionário
            </button>
          </div>
        )}
      />
      {importMsg && (
        <div className="mb-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm font-medium">
          {importMsg}
        </div>
      )}
      {(loadError || showImportCta) && !importMsg && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Nenhum funcionário no banco</p>
            <p className="mt-1 text-xs">
              {loadError || 'Os 12 colaboradores da planilha TM SEGURANÇA ainda não foram importados para o Supabase.'}
            </p>
            {showImportCta && (
              <button
                type="button"
                onClick={() => void importPlanilha()}
                disabled={importing}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-amber-700 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-60"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Importar agora
              </button>
            )}
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
