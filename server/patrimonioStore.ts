import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord } from '../lib/equipmentRecovery';
import { loadEquipmentWithRecovery } from '../lib/equipmentRecovery';
import { runFullEquipmentScan } from './equipmentBackupService';

const STORAGE_BUCKET = 'mission-evidence';
const STORAGE_PREFIX = 'patrimonio-backups';
const MAX_BACKUP_ROWS = 28;

export interface PatrimonioLoadResult {
  equipments: EquipmentRecord[];
  customTypes: { value: string; label: string }[];
  source: 'patrimonio_tables' | 'legacy_migrated' | 'empty';
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
  return !error || !String(error.message).includes('does not exist');
}

export async function loadPatrimonioFromTables(sb: SupabaseClient): Promise<PatrimonioLoadResult> {
  if (!(await tablesExist(sb))) {
    return { equipments: [], customTypes: [], source: 'empty' };
  }

  const [eqRes, typesRes] = await Promise.all([
    sb.from('patrimonio_equipments').select('*').is('deleted_at', null).order('patrimony_id'),
    sb.from('patrimonio_custom_types').select('value, label').order('label'),
  ]);

  if (eqRes.error) throw eqRes.error;

  const equipments = (eqRes.data || []).map((r) => rowToEquipment(r));
  const customTypes = (typesRes.data || []).map((t) => ({ value: String(t.value), label: String(t.label) }));

  return {
    equipments,
    customTypes,
    source: equipments.length > 0 ? 'patrimonio_tables' : 'empty',
  };
}

/** Migra legado (system_logs / varredura) para tabelas dedicadas. */
export async function migrateLegacyPatrimonioIfNeeded(sb: SupabaseClient): Promise<PatrimonioLoadResult> {
  const current = await loadPatrimonioFromTables(sb);
  if (current.equipments.length > 0) return { ...current, source: 'patrimonio_tables' };

  const scan = await runFullEquipmentScan(sb);
  let equipments = scan.equipments;
  let customTypes = scan.customTypes;

  if (!equipments.length) {
    const legacy = await loadEquipmentWithRecovery(sb);
    equipments = legacy.equipments;
    customTypes = legacy.customTypes;
  }

  if (!equipments.length) return { equipments: [], customTypes: [], source: 'empty' };

  await savePatrimonioToTables(sb, equipments, customTypes, 'legacy_migration');
  return { equipments, customTypes, source: 'legacy_migrated' };
}

export async function savePatrimonioToTables(
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

  console.log(`[patrimonio] ${equipments.length} item(ns) salvos (${source})`);
}

export async function loadPatrimonio(sb: SupabaseClient): Promise<PatrimonioLoadResult> {
  if (!(await tablesExist(sb))) {
    const legacy = await loadEquipmentWithRecovery(sb);
    return { equipments: legacy.equipments, customTypes: legacy.customTypes, source: 'empty' };
  }
  const current = await loadPatrimonioFromTables(sb);
  if (current.equipments.length > 0) return current;
  return migrateLegacyPatrimonioIfNeeded(sb);
}

export interface PatrimonioBackupRow {
  id: string;
  created_at: string;
  source: string;
  item_count: number;
  storage_path: string | null;
  status: string;
}

export async function runPatrimonioAutoBackup(sb: SupabaseClient): Promise<{
  ok: boolean;
  count: number;
  storage_path: string;
  snapshot_at: string;
  backup_id?: string;
}> {
  const data = await loadPatrimonio(sb);
  const snapshotAt = new Date().toISOString();
  const storagePath = `${STORAGE_PREFIX}/patrimonio-${snapshotAt.replace(/[:.]/g, '-')}.json`;

  const payload = {
    timestamp: snapshotAt,
    version: '6h-auto',
    count: data.equipments.length,
    equipments: data.equipments,
    customTypes: data.customTypes,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = Buffer.from(json, 'utf8');

  let storageOk = true;
  if (await tablesExist(sb)) {
    const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
      contentType: 'application/json',
      upsert: true,
    });
    if (upErr) {
      storageOk = false;
      console.warn('[patrimonio-backup] storage:', upErr.message);
    }

    const { data: inserted, error: insErr } = await sb.from('patrimonio_backups').insert({
      source: 'cron_6h',
      item_count: data.equipments.length,
      storage_path: storageOk ? storagePath : null,
      payload: storageOk ? null : payload,
      file_size_bytes: blob.length,
      status: storageOk ? 'ok' : 'inline_payload',
      notes: storageOk ? null : 'Storage indisponível — payload inline',
    }).select('id').maybeSingle();

    if (insErr) console.warn('[patrimonio-backup] insert:', insErr.message);

    await pruneOldBackups(sb);
  }

  console.log(`[patrimonio-backup] ${data.equipments.length} item(ns) → ${storagePath}`);
  return {
    ok: true,
    count: data.equipments.length,
    storage_path: storagePath,
    snapshot_at: snapshotAt,
    backup_id: undefined,
  };
}

async function pruneOldBackups(sb: SupabaseClient): Promise<void> {
  const { data: old } = await sb
    .from('patrimonio_backups')
    .select('id')
    .order('created_at', { ascending: false })
    .range(MAX_BACKUP_ROWS, MAX_BACKUP_ROWS + 100);
  if (!old?.length) return;
  await sb.from('patrimonio_backups').delete().in('id', old.map((r) => r.id));
}

export async function listPatrimonioBackups(sb: SupabaseClient): Promise<PatrimonioBackupRow[]> {
  if (!(await tablesExist(sb))) return [];
  const { data } = await sb
    .from('patrimonio_backups')
    .select('id, created_at, source, item_count, storage_path, status')
    .order('created_at', { ascending: false })
    .limit(MAX_BACKUP_ROWS);
  return (data || []) as PatrimonioBackupRow[];
}

export async function restorePatrimonioFromBackup(
  sb: SupabaseClient,
  backupId?: string,
): Promise<{ snapshot_at: string; equipments: EquipmentRecord[]; customTypes: { value: string; label: string }[] } | null> {
  if (!(await tablesExist(sb))) return null;

  let query = sb.from('patrimonio_backups').select('*').order('created_at', { ascending: false });
  if (backupId) query = query.eq('id', backupId);
  else query = query.gt('item_count', 0);

  const { data: row } = await query.limit(1).maybeSingle();
  if (!row) return null;

  let payload = row.payload as { equipments?: EquipmentRecord[]; customTypes?: { value: string; label: string }[] } | null;

  if (!payload?.equipments?.length && row.storage_path) {
    const { data: file } = await sb.storage.from(STORAGE_BUCKET).download(row.storage_path);
    if (file) {
      const text = await file.text();
      payload = JSON.parse(text);
    }
  }

  if (!payload?.equipments?.length) return null;

  return {
    snapshot_at: row.created_at,
    equipments: payload.equipments,
    customTypes: payload.customTypes || [],
  };
}
