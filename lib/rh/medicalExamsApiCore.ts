import type { ResolvedPrincipal } from '../auth/resolvePrincipal.js';

export type RhMedicalExam = {
  id: string;
  employee_id: string;
  exam_type: string;
  exam_date: string;
  expiry_date?: string | null;
  clinic_name?: string | null;
  result?: string | null;
  document_url?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

export type SaveRhMedicalExamInput = {
  employeeId: string;
  examType: string;
  examDate: string;
  expiryDate?: string | null;
  clinicName?: string | null;
  result?: string | null;
  documentUrl?: string | null;
};

export type RhMedicalExamsClient = {
  from: (table: string) => any;
};

function toRow(input: SaveRhMedicalExamInput) {
  const row: Record<string, string | null> = {
    employee_id: input.employeeId,
    exam_type: input.examType,
    exam_date: input.examDate,
  };
  const optionalFields = [
    ['expiry_date', input.expiryDate],
    ['clinic_name', input.clinicName],
    ['result', input.result],
    ['document_url', input.documentUrl],
  ] as const;
  optionalFields.forEach(([key, value]) => {
    if (value !== undefined) row[key] = value;
  });
  return row;
}

async function writeAuditBestEffort(
  client: RhMedicalExamsClient,
  actor: ResolvedPrincipal,
  entityId: string,
  action: 'create' | 'update' | 'soft_delete',
  oldData?: unknown,
): Promise<void> {
  try {
    const { error } = await client.from('rh_audit_logs').insert([{
      entity: 'rh_medical_exams',
      entity_id: entityId,
      action,
      user_name: actor.name || 'API',
      user_id: actor.id,
      old_data: oldData || null,
      new_data: null,
    }]);
    if (error) throw error;
  } catch (error) {
    // O fluxo legado não bloqueava exames quando a auditoria falhava.
    console.warn('[RH Audit] medical exams:', error);
  }
}

/** SSOT backend exclusivo das operações existentes em exames médicos. */
export function createRhMedicalExamsOps(client: RhMedicalExamsClient) {
  return {
    async list(employeeId: string): Promise<RhMedicalExam[]> {
      const { data, error } = await client
        .from('rh_medical_exams')
        .select('*')
        .eq('employee_id', employeeId)
        .is('deleted_at', null)
        .order('exam_date', { ascending: false });
      if (error) throw error;
      return (data || []) as RhMedicalExam[];
    },

    async create(
      input: SaveRhMedicalExamInput,
      actor: ResolvedPrincipal,
    ): Promise<RhMedicalExam> {
      const { data, error } = await client
        .from('rh_medical_exams')
        .insert([toRow(input)])
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, data.id, 'create', data);
      return data as RhMedicalExam;
    },

    async update(
      id: string,
      input: SaveRhMedicalExamInput,
      actor: ResolvedPrincipal,
    ): Promise<RhMedicalExam> {
      const { data, error } = await client
        .from('rh_medical_exams')
        .update(toRow(input))
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, id, 'update', input);
      return data as RhMedicalExam;
    },

    async remove(id: string, actor: ResolvedPrincipal): Promise<void> {
      const { error } = await client
        .from('rh_medical_exams')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, id, 'soft_delete');
    },
  };
}
