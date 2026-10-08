import { supabase } from '../supabase';
import { erroColunaUpdatedByAusente, semUpdatedBy } from './updatedByColumn';

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

function nomeUsuarioRh(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}');
    return user.name || null;
  } catch {
    return null;
  }
}

/**
 * Grava insert ou update. Várias tabelas do RH não têm updated_by
 * (rh_awards, rh_bonuses, férias, etc.). Se o banco recusar a coluna,
 * repete sem ela para a premiação e as outras abas salvarem.
 */
export async function gravarRh(table: string, payload: Record<string, unknown>, id?: string | null) {
  const withUser = { ...payload, updated_by: nomeUsuarioRh() };
  if (id) {
    let { error } = await supabase.from(table).update(withUser).eq('id', id);
    if (erroColunaUpdatedByAusente(error)) {
      ({ error } = await supabase.from(table).update(semUpdatedBy(withUser)).eq('id', id));
    }
    if (error) throw error;
    return null;
  }
  let inserted = await supabase.from(table).insert([withUser]).select().single();
  if (erroColunaUpdatedByAusente(inserted.error)) {
    inserted = await supabase.from(table).insert([semUpdatedBy(withUser)]).select().single();
  }
  if (inserted.error) throw inserted.error;
  if (!inserted.data) throw new Error('Não foi possível gravar o registro.');
  return inserted.data;
}

export async function softDelete(table: string, id: string) {
  const deletedAt = new Date().toISOString();
  const withUser = { deleted_at: deletedAt, updated_by: nomeUsuarioRh() };
  let { error } = await supabase.from(table).update(withUser).eq('id', id);
  if (erroColunaUpdatedByAusente(error)) {
    ({ error } = await supabase.from(table).update({ deleted_at: deletedAt }).eq('id', id));
  }
  if (error) throw error;
  await logRhAudit(table, id, 'soft_delete');
}
