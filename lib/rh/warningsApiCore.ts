import type { ResolvedPrincipal } from '../auth/resolvePrincipal.js';

export type RhWarning = {
  id: string;
  employee_id: string;
  warning_date: string;
  warning_type: string;
  reason: string;
  responsible?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

export type SaveRhWarningInput = {
  employeeId: string;
  warningDate: string;
  warningType: string;
  reason: string;
  responsible?: string | null;
};

export type RhWarningsClient = {
  from: (table: string) => any;
};

function toRow(input: SaveRhWarningInput) {
  const row: Record<string, string | null> = {
    employee_id: input.employeeId,
    warning_date: input.warningDate,
    warning_type: input.warningType,
    reason: input.reason,
  };
  if (input.responsible !== undefined) {
    row.responsible = input.responsible;
  }
  return row;
}

async function writeAuditBestEffort(
  client: RhWarningsClient,
  actor: ResolvedPrincipal,
  entityId: string,
  action: 'create' | 'update' | 'soft_delete',
  oldData?: unknown,
): Promise<void> {
  try {
    const { error } = await client.from('rh_audit_logs').insert([{
      entity: 'rh_warnings',
      entity_id: entityId,
      action,
      user_name: actor.name || 'API',
      user_id: actor.id,
      old_data: oldData || null,
      new_data: null,
    }]);
    if (error) throw error;
  } catch (error) {
    console.warn('[RH Audit] warnings:', error);
  }
}

/** SSOT backend exclusivo das operações existentes em advertências. */
export function createRhWarningsOps(client: RhWarningsClient) {
  return {
    async list(employeeId: string): Promise<RhWarning[]> {
      const { data, error } = await client
        .from('rh_warnings')
        .select('*')
        .eq('employee_id', employeeId)
        .is('deleted_at', null)
        .order('warning_date', { ascending: false });
      if (error) throw error;
      return (data || []) as RhWarning[];
    },

    async create(
      input: SaveRhWarningInput,
      actor: ResolvedPrincipal,
    ): Promise<RhWarning> {
      const { data, error } = await client
        .from('rh_warnings')
        .insert([toRow(input)])
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, data.id, 'create', data);
      return data as RhWarning;
    },

    async update(
      id: string,
      input: SaveRhWarningInput,
      actor: ResolvedPrincipal,
    ): Promise<RhWarning> {
      const { data, error } = await client
        .from('rh_warnings')
        .update(toRow(input))
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, id, 'update', input);
      return data as RhWarning;
    },

    async remove(id: string, actor: ResolvedPrincipal): Promise<void> {
      const { error } = await client
        .from('rh_warnings')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      await writeAuditBestEffort(client, actor, id, 'soft_delete');
    },
  };
}
