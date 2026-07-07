import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../lib/NotificationContext';
import RhDataTable from './shared/RhDataTable';
import { RH_INPUT_CLASS, RH_LABEL_CLASS } from '../../lib/rh/constants';
import { logRhAudit, softDelete } from '../../lib/rh/audit';
import { canEditRh } from '../../lib/rh/permissions';
import type { RhCrudField } from './RhCrudList';

interface Props {
  employeeId: string;
  title: string;
  table: string;
  fields: RhCrudField[];
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  searchKeys?: string[];
  orderBy?: { column: string; ascending?: boolean };
}

/** CRUD embutido na pasta do funcionário — sempre filtrado por employee_id. */
const RhEmployeeScopedCrud: React.FC<Props> = ({
  employeeId,
  title,
  table,
  fields,
  columns,
  searchKeys,
  orderBy,
}) => {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const editable = canEditRh();

  const scopedFields = fields.filter((f) => f.key !== 'employee_id');

  const load = async () => {
    const col = orderBy?.column || 'created_at';
    const asc = orderBy?.ascending ?? false;
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order(col, { ascending: asc });
    setRows(data || []);
  };

  useEffect(() => { if (employeeId) load(); }, [employeeId, table]);

  const openNew = () => {
    setForm({ employee_id: employeeId });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (row: any) => {
    setForm(row);
    setEditingId(row.id);
    setShowForm(true);
  };

  const save = async () => {
    for (const f of scopedFields) {
      if (f.required && !form[f.key]) {
        showNotification('error', `${f.label} é obrigatório`);
        return;
      }
    }
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}');
      const payload = { ...form, employee_id: employeeId, updated_by: user.name };
      if (editingId) {
        await supabase.from(table).update(payload).eq('id', editingId);
        await logRhAudit(table, editingId, 'update', form);
      } else {
        const { data, error } = await supabase.from(table).insert([payload]).select().single();
        if (error) throw error;
        await logRhAudit(table, data.id, 'create', data);
      }
      showNotification('success', 'Salvo com sucesso!');
      setShowForm(false);
      load();
    } catch (e: any) {
      showNotification('error', e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Confirmar exclusão?')) return;
    try {
      await softDelete(table, id);
      showNotification('success', 'Registro removido');
      load();
    } catch (e: any) {
      showNotification('error', e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase text-gray-700">{title}</h3>
        {editable && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 px-3 py-2 bg-black text-white rounded-lg text-[10px] font-bold uppercase">
            <Plus size={14} /> Adicionar
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl border p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scopedFields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                <label className={RH_LABEL_CLASS}>{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'select' ? (
                  <select className={RH_INPUT_CLASS} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">Selecione</option>
                    {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea className={RH_INPUT_CLASS} rows={3} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : (
                  <input
                    type={f.type || 'text'}
                    className={RH_INPUT_CLASS}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded-lg text-[10px] font-bold uppercase">Cancelar</button>
            <button type="button" onClick={save} className="inline-flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded-lg text-[10px] font-bold uppercase">
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      )}

      <RhDataTable
        data={rows}
        searchKeys={searchKeys || scopedFields.map((f) => f.key)}
        columns={[
          ...columns,
          ...(editable ? [{
            key: 'actions', label: 'Ações', sortable: false as const,
            render: (r: any) => (
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(r)} className="text-xs font-bold text-blue-600">Editar</button>
                <button type="button" onClick={() => remove(r.id)} className="text-xs font-bold text-red-600"><Trash2 size={14} /></button>
              </div>
            ),
          }] : []),
        ]}
      />
    </div>
  );
};

export default RhEmployeeScopedCrud;
