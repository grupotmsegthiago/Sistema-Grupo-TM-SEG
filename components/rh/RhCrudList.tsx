import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../lib/NotificationContext';
import RhPageHeader from './shared/RhPageHeader';
import RhDataTable from './shared/RhDataTable';
import { RH_INPUT_CLASS, RH_LABEL_CLASS } from '../../lib/rh/constants';
import { logRhAudit, softDelete } from '../../lib/rh/audit';
import { canEditRh } from '../../lib/rh/permissions';

export interface RhCrudField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  table: string;
  fields: RhCrudField[];
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  searchKeys?: string[];
  icon?: any;
}

const RhCrudList: React.FC<Props> = ({ title, subtitle, table, fields, columns, searchKeys, icon }) => {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const editable = canEditRh();

  const load = async () => {
    const { data } = await supabase.from(table).select('*').is('deleted_at', null).order('created_at', { ascending: false });
    setRows(data || []);
  };

  useEffect(() => { load(); }, [table]);

  const openNew = () => { setForm({}); setEditingId(null); setShowForm(true); };
  const openEdit = (row: any) => { setForm(row); setEditingId(row.id); setShowForm(true); };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key]) {
        showNotification('error', `${f.label} é obrigatório`);
        return;
      }
    }
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}');
      const payload = { ...form, updated_by: user.name };
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
    if (!confirm('Confirmar exclusão (soft delete)?')) return;
    try {
      await softDelete(table, id);
      showNotification('success', 'Registro removido');
      load();
    } catch (e: any) {
      showNotification('error', e.message);
    }
  };

  return (
    <div>
      <RhPageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={editable && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg text-xs font-bold uppercase">
            <Plus size={16} /> Adicionar
          </button>
        )}
      />

      {showForm && (
        <div className="bg-white rounded-2xl border p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((f) => (
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
                  <input type={f.type || 'text'} className={RH_INPUT_CLASS} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-xs font-bold uppercase">Cancelar</button>
            <button type="button" onClick={save} className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-bold uppercase"><Save size={14} /> Salvar</button>
          </div>
        </div>
      )}

      <RhDataTable
        data={rows}
        searchKeys={searchKeys || fields.map((f) => f.key)}
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

export default RhCrudList;
