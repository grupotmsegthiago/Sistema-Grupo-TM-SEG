/**
 * Leitura/gravação leve de patrimônio para handlers serverless (sem Express).
 * Não importa varredura/forense — evita ERR_MODULE_NOT_FOUND no bundle Vercel.
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord } from './equipmentRecovery';

export interface PatrimonioLiteResult {
  equipments: EquipmentRecord[];
  customTypes: { value: string; label: string }[];
  source: 'patrimonio_tables' | 'empty';
}

function rowToEquipment(row: Record<string, unknown>): EquipmentRecord {
  return {
    id: String(row.id),
    type: String(row.type || 'outro'),
    brand: String(row.brand || ''),
    model: String(row.model || ''),
    serial_number: String(row.serial_number || ''),
    patrimony_id: String(row.patrimony_id || ''),
    photo_urls: Array.isArray(row.photo_urls) ? (row.photo_urls as string[]) : [],
    notes: String(row.notes || ''),
    assigned_to: String(row.assigned_to || ''),
    assigned_to_name: String(row.assigned_to_name || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    history: Array.isArray(row.history) ? (row.history as EquipmentRecord['history']) : [],
    responsibility_term: row.responsibility_term as EquipmentRecord['responsibility_term'],
  };
}

async function tablesExist(sb: SupabaseClient): Promise<boolean> {
  const { error } = await sb.from('patrimonio_equipments').select('id', { head: true, count: 'exact' }).limit(1);
  if (!error) return true;
  const msg = String(error.message || '');
  if (/does not exist|Could not find the table/i.test(msg)) return false;
  // Outros erros (RLS/API key): deixa a query principal reportar
  return true;
}

export async function loadPatrimonioLite(sb: SupabaseClient): Promise<PatrimonioLiteResult> {
  if (!(await tablesExist(sb))) {
    return { equipments: [], customTypes: [], source: 'empty' };
  }

  const [eqRes, typesRes] = await Promise.all([
    sb.from('patrimonio_equipments').select('*').is('deleted_at', null).order('patrimony_id'),
    sb.from('patrimonio_custom_types').select('value, label').order('label'),
  ]);

  if (eqRes.error) throw eqRes.error;

  const equipments = (eqRes.data || []).map((r) => rowToEquipment(r as Record<string, unknown>));
  const customTypes = (typesRes.data || []).map((t) => ({
    value: String(t.value),
    label: String(t.label),
  }));

  return {
    equipments,
    customTypes,
    source: equipments.length > 0 ? 'patrimonio_tables' : 'empty',
  };
}

export async function savePatrimonioLite(
  sb: SupabaseClient,
  equipments: EquipmentRecord[],
  customTypes: { value: string; label: string }[],
  source = 'app',
): Promise<void> {
  if (!(await tablesExist(sb))) {
    throw new Error('Tabelas patrimonio_* não existem. Rode scripts/patrimonio-dedicated-tables.sql no Supabase.');
  }

  const now = new Date().toISOString();
  const { data: existing } = await sb.from('patrimonio_equipments').select('id, patrimony_id').is('deleted_at', null);
  const existingIds = new Set((existing || []).map((e) => String(e.id)));
  const incomingIds = new Set(equipments.map((e) => e.id));

  for (const eq of equipments) {
    const row = {
      id: eq.id || randomUUID(),
      patrimony_id: eq.patrimony_id,
      type: eq.type,
      brand: eq.brand,
      model: eq.model,
      serial_number: eq.serial_number,
      photo_urls: eq.photo_urls || [],
      notes: eq.notes || '',
      assigned_to: eq.assigned_to || '',
      assigned_to_name: eq.assigned_to_name || '',
      history: eq.history || [],
      responsibility_term: eq.responsibility_term || null,
      updated_at: now,
    };
    const { error } = await sb.from('patrimonio_equipments').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  }

  const toSoftDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toSoftDelete.length) {
    await sb.from('patrimonio_equipments').update({ deleted_at: now, updated_at: now }).in('id', toSoftDelete);
  }

  if (customTypes.length) {
    for (const t of customTypes) {
      await sb.from('patrimonio_custom_types').upsert({ value: t.value, label: t.label }, { onConflict: 'value' });
    }
  }

  console.log(`[patrimonio-lite] ${equipments.length} item(ns) salvos (${source})`);
}
