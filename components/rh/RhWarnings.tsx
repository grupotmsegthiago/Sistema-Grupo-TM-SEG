import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useNotification } from '../../lib/NotificationContext';
import { RH_INPUT_CLASS, RH_LABEL_CLASS, RH_WARNING_TYPES } from '../../lib/rh/constants';
import {
  GENERIC_WARNING_ERROR,
  warningsClient,
} from '../../lib/rh/warningsClient';
import type {
  RhWarning,
  SaveRhWarningInput,
} from '../../lib/rh/warningsApiCore';
import { canEditRh } from '../../lib/rh/permissions';
import RhDataTable from './shared/RhDataTable';

interface Props {
  employeeId: string;
  services?: RhWarningsServices;
  notify?: (title: string, message: string) => void;
}

export interface RhWarningsServices {
  list: (employeeId: string) => Promise<RhWarning[]>;
  create: (input: SaveRhWarningInput) => Promise<RhWarning>;
  update: (id: string, input: SaveRhWarningInput) => Promise<RhWarning>;
  remove: (id: string) => Promise<void>;
}

type WarningForm = {
  warningDate: string;
  warningType: string;
  reason: string;
  responsible: string;
};

const EMPTY_FORM: WarningForm = {
  warningDate: '',
  warningType: '',
  reason: '',
  responsible: '',
};

export const defaultRhWarningsServices: RhWarningsServices = {
  ...warningsClient,
};

const RhWarnings: React.FC<Props> = ({
  employeeId,
  services = defaultRhWarningsServices,
  notify,
}) => {
  const { showNotification: contextNotification } = useNotification();
  const showNotification = notify || contextNotification;
  const [rows, setRows] = useState<RhWarning[]>([]);
  const [form, setForm] = useState<WarningForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const editable = canEditRh();

  const load = async () => {
    try {
      setRows(await services.list(employeeId));
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    if (employeeId) void load();
  }, [employeeId, services]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (row: RhWarning) => {
    setForm({
      warningDate: row.warning_date || '',
      warningType: row.warning_type || '',
      reason: row.reason || '',
      responsible: row.responsible || '',
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const input = (): SaveRhWarningInput => ({
    employeeId,
    warningDate: form.warningDate || new Date().toISOString().slice(0, 10),
    warningType: form.warningType.trim(),
    reason: form.reason.trim(),
    responsible: form.responsible || null,
  });

  const save = async () => {
    if (!form.warningType.trim()) {
      showNotification('error', 'Tipo é obrigatório');
      return;
    }
    if (!form.reason.trim()) {
      showNotification('error', 'Motivo é obrigatório');
      return;
    }
    try {
      if (editingId) {
        await services.update(editingId, input());
      } else {
        await services.create(input());
      }
      showNotification('success', 'Salvo com sucesso!');
      setShowForm(false);
      await load();
    } catch {
      showNotification('error', GENERIC_WARNING_ERROR);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Confirmar exclusão?')) return;
    try {
      await services.remove(id);
      showNotification('success', 'Registro removido');
      await load();
    } catch {
      showNotification('error', GENERIC_WARNING_ERROR);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase text-gray-700">Advertências</h3>
        {editable && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 px-3 py-2 bg-black text-white rounded-lg text-[10px] font-bold uppercase">
            <Plus size={14} /> Adicionar
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-xl border p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={RH_LABEL_CLASS}>Data</label>
              <input
                name="warningDate"
                type="date"
                className={RH_INPUT_CLASS}
                value={form.warningDate}
                onChange={(event) => setForm({ ...form, warningDate: event.target.value })}
              />
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Tipo *</label>
              <select
                name="warningType"
                className={RH_INPUT_CLASS}
                value={form.warningType}
                onChange={(event) => setForm({ ...form, warningType: event.target.value })}
              >
                <option value="">Selecione</option>
                {RH_WARNING_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={RH_LABEL_CLASS}>Motivo *</label>
              <textarea
                name="reason"
                className={RH_INPUT_CLASS}
                rows={3}
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Responsável</label>
              <input
                name="responsible"
                className={RH_INPUT_CLASS}
                value={form.responsible}
                onChange={(event) => setForm({ ...form, responsible: event.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded-lg text-[10px] font-bold uppercase">Cancelar</button>
            <button type="button" onClick={() => void save()} className="inline-flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded-lg text-[10px] font-bold uppercase">
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      )}

      <RhDataTable
        data={rows}
        searchKeys={['warning_date', 'warning_type', 'reason', 'responsible']}
        columns={[
          { key: 'warning_date', label: 'Data' },
          { key: 'warning_type', label: 'Tipo' },
          { key: 'reason', label: 'Motivo' },
          ...(editable ? [{
            key: 'actions',
            label: 'Ações',
            sortable: false as const,
            render: (row: RhWarning) => (
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(row)} className="text-xs font-bold text-blue-600">Editar</button>
                <button type="button" onClick={() => void remove(row.id)} className="text-xs font-bold text-red-600"><Trash2 size={14} /></button>
              </div>
            ),
          }] : []),
        ]}
      />
    </div>
  );
};

export default RhWarnings;
