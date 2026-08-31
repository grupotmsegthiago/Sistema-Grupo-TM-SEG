import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useNotification } from '../../lib/NotificationContext';
import { RH_EXAM_TYPES, RH_INPUT_CLASS, RH_LABEL_CLASS } from '../../lib/rh/constants';
import {
  GENERIC_MEDICAL_EXAM_ERROR,
  medicalExamsClient,
} from '../../lib/rh/medicalExamsClient';
import type {
  RhMedicalExam,
  SaveRhMedicalExamInput,
} from '../../lib/rh/medicalExamsApiCore';
import { canEditRh } from '../../lib/rh/permissions';
import RhDataTable from './shared/RhDataTable';

interface Props {
  employeeId: string;
  services?: RhMedicalExamsServices;
  notify?: (title: string, message: string) => void;
}

export interface RhMedicalExamsServices {
  list: (employeeId: string) => Promise<RhMedicalExam[]>;
  create: (input: SaveRhMedicalExamInput) => Promise<RhMedicalExam>;
  update: (id: string, input: SaveRhMedicalExamInput) => Promise<RhMedicalExam>;
  remove: (id: string) => Promise<void>;
}

type MedicalExamForm = {
  examType: string;
  examDate: string;
  expiryDate: string;
  clinicName: string;
  result: string;
  documentUrl?: string | null;
};

const EMPTY_FORM: MedicalExamForm = {
  examType: '',
  examDate: '',
  expiryDate: '',
  clinicName: '',
  result: '',
};

export const defaultRhMedicalExamsServices: RhMedicalExamsServices = {
  ...medicalExamsClient,
};

const RhMedicalExams: React.FC<Props> = ({
  employeeId,
  services = defaultRhMedicalExamsServices,
  notify,
}) => {
  const { showNotification: contextNotification } = useNotification();
  const showNotification = notify || contextNotification;
  const [rows, setRows] = useState<RhMedicalExam[]>([]);
  const [form, setForm] = useState<MedicalExamForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const editable = canEditRh();

  const load = async () => {
    try {
      setRows(await services.list(employeeId));
    } catch {
      // Equivalência visual legada: erro de leitura continua como lista vazia.
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

  const openEdit = (row: RhMedicalExam) => {
    setForm({
      examType: row.exam_type || '',
      examDate: row.exam_date || '',
      expiryDate: row.expiry_date || '',
      clinicName: row.clinic_name || '',
      result: row.result || '',
      documentUrl: row.document_url,
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const input = (): SaveRhMedicalExamInput => ({
    employeeId,
    examType: form.examType.trim(),
    examDate: form.examDate,
    expiryDate: form.expiryDate || null,
    clinicName: form.clinicName || null,
    result: form.result || null,
    ...(form.documentUrl !== undefined ? { documentUrl: form.documentUrl } : {}),
  });

  const save = async () => {
    if (!form.examType.trim()) {
      showNotification('error', 'Tipo é obrigatório');
      return;
    }
    if (!form.examDate) {
      showNotification('error', 'Data exame é obrigatório');
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
      showNotification('error', GENERIC_MEDICAL_EXAM_ERROR);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Confirmar exclusão?')) return;
    try {
      await services.remove(id);
      showNotification('success', 'Registro removido');
      await load();
    } catch {
      showNotification('error', GENERIC_MEDICAL_EXAM_ERROR);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase text-gray-700">Exames médicos</h3>
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
              <label className={RH_LABEL_CLASS}>Tipo *</label>
              <select
                name="examType"
                className={RH_INPUT_CLASS}
                value={form.examType}
                onChange={(event) => setForm({ ...form, examType: event.target.value })}
              >
                <option value="">Selecione</option>
                {RH_EXAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Data exame *</label>
              <input
                name="examDate"
                type="date"
                className={RH_INPUT_CLASS}
                value={form.examDate}
                onChange={(event) => setForm({ ...form, examDate: event.target.value })}
              />
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Validade</label>
              <input
                name="expiryDate"
                type="date"
                className={RH_INPUT_CLASS}
                value={form.expiryDate}
                onChange={(event) => setForm({ ...form, expiryDate: event.target.value })}
              />
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Clínica</label>
              <input
                name="clinicName"
                className={RH_INPUT_CLASS}
                value={form.clinicName}
                onChange={(event) => setForm({ ...form, clinicName: event.target.value })}
              />
            </div>
            <div>
              <label className={RH_LABEL_CLASS}>Resultado</label>
              <input
                name="result"
                className={RH_INPUT_CLASS}
                value={form.result}
                onChange={(event) => setForm({ ...form, result: event.target.value })}
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
        searchKeys={['exam_type', 'exam_date', 'expiry_date', 'clinic_name', 'result']}
        columns={[
          { key: 'exam_type', label: 'Tipo' },
          { key: 'exam_date', label: 'Data' },
          { key: 'expiry_date', label: 'Validade' },
          ...(editable ? [{
            key: 'actions',
            label: 'Ações',
            sortable: false as const,
            render: (row: RhMedicalExam) => (
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

export default RhMedicalExams;
