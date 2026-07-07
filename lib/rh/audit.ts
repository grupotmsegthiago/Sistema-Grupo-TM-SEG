import { supabase } from '../supabase';

export async function logRhAudit(entity: string, entityId: string | null, action: string, oldData?: unknown, newData?: unknown) {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    await supabase.from('rh_audit_logs').insert([{
      entity,
      entity_id: entityId,
      action,
      user_name: user.name || 'Sistema',
      user_id: user.id || null,
      old_data: oldData || null,
      new_data: newData || null,
    }]);
  } catch (e) {
    console.warn('[RH Audit]', e);
  }
}

export async function softDelete(table: string, id: string) {
  const user = JSON.parse(localStorage.getItem('userData') || '{}');
  const { error } = await supabase.from(table).update({
    deleted_at: new Date().toISOString(),
    updated_by: user.name,
  }).eq('id', id);
  if (error) throw error;
  await logRhAudit(table, id, 'soft_delete');
}
