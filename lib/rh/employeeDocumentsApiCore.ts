import type { ResolvedPrincipal } from '../auth/resolvePrincipal.js';

export type RhEmployeeDocument = {
  id: string;
  employee_id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  mime_type?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  uploaded_by?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

export type CreateRhEmployeeDocumentInput = {
  employeeId: string;
  docType: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  notes?: string | null;
};

export type RhEmployeeDocumentsClient = {
  from: (table: string) => any;
};

async function writeAuditBestEffort(
  client: RhEmployeeDocumentsClient,
  actor: ResolvedPrincipal,
  entityId: string,
  action: 'upload' | 'soft_delete',
  oldData?: unknown,
): Promise<void> {
  try {
    const { error } = await client.from('rh_audit_logs').insert([{
      entity: 'rh_employee_documents',
      entity_id: entityId,
      action,
      user_name: actor.name || 'API',
      user_id: actor.id,
      old_data: oldData || null,
      new_data: null,
    }]);
    if (error) throw error;
  } catch (error) {
    // O fluxo legado não bloqueava documento quando a auditoria falhava.
    console.warn('[RH Audit] employee documents:', error);
  }
}

/** SSOT backend das operações existentes no piloto de documentos cadastrais. */
export function createRhEmployeeDocumentsOps(client: RhEmployeeDocumentsClient) {
  return {
    async list(employeeId: string): Promise<RhEmployeeDocument[]> {
      const { data, error } = await client
        .from('rh_employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RhEmployeeDocument[];
    },

    async create(
      input: CreateRhEmployeeDocumentInput,
      actor: ResolvedPrincipal,
    ): Promise<RhEmployeeDocument> {
      const row = {
        employee_id: input.employeeId,
        doc_type: input.docType,
        file_name: input.fileName,
        file_url: input.fileUrl,
        mime_type: input.mimeType || '',
        notes: input.notes?.trim() || null,
        uploaded_by: actor.name || 'API',
      };
      const { data, error } = await client
        .from('rh_employee_documents')
        .insert([row])
        .select('*')
        .single();
      if (error) throw error;

      await writeAuditBestEffort(
        client,
        actor,
        input.employeeId,
        'upload',
        { docType: input.docType, file: input.fileName },
      );
      return data as RhEmployeeDocument;
    },

    async remove(id: string, actor: ResolvedPrincipal): Promise<void> {
      // O schema live do piloto registra a exclusão lógica somente em deleted_at.
      const { error } = await client
        .from('rh_employee_documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await writeAuditBestEffort(client, actor, id, 'soft_delete');
    },
  };
}
