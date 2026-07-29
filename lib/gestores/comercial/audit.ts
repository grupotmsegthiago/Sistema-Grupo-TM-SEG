import { supabase } from '../../supabase';
import { logAction } from '../../logger';
import { getGcUser } from './access';

export async function logGcAudit(opts: {
  entity: string;
  entityId?: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'OTHER';
  oldValue?: unknown;
  newValue?: unknown;
  details?: string;
  ipAddress?: string;
}): Promise<void> {
  const user = getGcUser();
  const details = opts.details || `${opts.actionType} ${opts.entity}`;

  try {
    await supabase.from('gestor_audit_logs').insert([{
      gestor_key: 'comercial',
      entity: opts.entity,
      entity_id: opts.entityId || null,
      action_type: opts.actionType,
      user_id: user.id || null,
      user_name: user.name || 'Sistema',
      ip_address: opts.ipAddress || null,
      old_value: opts.oldValue ?? null,
      new_value: opts.newValue ?? null,
      details,
    }]);
  } catch {
    // tabela pode não existir ainda
  }

  await logAction(opts.actionType, `gc:${opts.entity}`, opts.entityId || '', details);
}
