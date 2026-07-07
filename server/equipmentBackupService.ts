import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord } from '../lib/equipmentRecovery';
import { runForensicEquipmentRecovery, parseEquipmentFromBackupJson } from './equipmentForensicRecovery';

const AUTO_BACKUP_KEY = 'equipment_auto_backups';
const MAX_SNAPSHOTS = 28; // 7 dias × 4 backups/dia (6 em 6 horas)
const STORAGE_BUCKET = 'mission-evidence';
const STORAGE_PREFIX = 'system-backups/equipment';

export interface EquipmentAutoBackupSnapshot {
  at: string;
  count: number;
  storage_path?: string;
  equipments: EquipmentRecord[];
  customTypes: { value: string; label: string }[];
}

export interface SystemSettingsScanHit {
  key: string;
  equipmentCount: number;
  preview: string;
}

function extractEquipmentsFromSettingsValue(value: unknown): EquipmentRecord[] {
  if (!value) return [];
  const lists: EquipmentRecord[][] = [];

  const tryParse = (v: unknown) => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return v;
  };

  const parsed = tryParse(value);
  if (!parsed) return [];

  const fromBackup = parseEquipmentFromBackupJson(parsed);
  if (fromBackup.equipments.length) lists.push(fromBackup.equipments);

  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.equipments)) {
    lists.push(
      obj.equipments
        .map((eq) => {
          const raw = eq as Partial<EquipmentRecord>;
          if (!raw.brand && !raw.model && !raw.patrimony_id) return null;
          return {
            id: raw.id || randomUUID(),
            type: raw.type || 'outro',
            brand: raw.brand || '',
            model: raw.model || '',
            serial_number: raw.serial_number || '',
            patrimony_id: raw.patrimony_id || '',
            photo_urls: raw.photo_urls || [],
            notes: raw.notes || '',
            assigned_to: String(raw.assigned_to || ''),
            assigned_to_name: raw.assigned_to_name || '',
            created_at: raw.created_at || new Date().toISOString(),
            history: Array.isArray(raw.history) ? raw.history : [],
            responsibility_term: raw.responsibility_term,
          } as EquipmentRecord;
        })
        .filter((eq): eq is EquipmentRecord => !!eq),
    );
  }

  return lists.flat();
}

/** Varre system_settings (legado Replit) por chaves/valores com patrimônio. */
export async function scanSystemSettingsForEquipment(sb: SupabaseClient): Promise<{
  hits: SystemSettingsScanHit[];
  equipments: EquipmentRecord[];
}> {
  const hits: SystemSettingsScanHit[] = [];
  const allEquipments: EquipmentRecord[] = [];

  const { data: rows } = await sb.from('system_settings').select('key, value');

  for (const row of rows || []) {
    const key = String(row.key || '');
    const valueStr = JSON.stringify(row.value ?? '');
    const keyMatch = /equip|patrim|registry/i.test(key);
    const valueMatch = /patrimony_id|"equipments"|PAT-\d/i.test(valueStr);
    if (!keyMatch && !valueMatch) continue;

    const extracted = extractEquipmentsFromSettingsValue(row.value);
    hits.push({
      key,
      equipmentCount: extracted.length,
      preview: valueStr.slice(0, 180),
    });
    allEquipments.push(...extracted);
  }

  return { hits, equipments: allEquipments };
}

export async function runFullEquipmentScan(sb: SupabaseClient) {
  const [forensic, settingsScan, userEqPreview] = await Promise.all([
    runForensicEquipmentRecovery(sb),
    scanSystemSettingsForEquipment(sb),
    sb
      .from('system_logs')
      .select('id, entity_id, created_at, details')
      .eq('entity', 'UserEquipment')
      .order('created_at', { ascending: false }),
  ]);

  const mergedMap = new Map<string, EquipmentRecord>();
  const addAll = (list: EquipmentRecord[]) => {
    for (const eq of list) {
      const k = eq.patrimony_id || eq.id;
      mergedMap.set(k, eq);
    }
  };
  addAll(forensic.equipments);
  addAll(settingsScan.equipments);

  const userEquipmentRows = (userEqPreview.data || []).map((row) => {
    let count = 0;
    let preview = '';
    try {
      const p = JSON.parse(row.details || '{}');
      count = Array.isArray(p.equipments) ? p.equipments.length : 0;
      preview = JSON.stringify(p.equipments?.[0] || p).slice(0, 120);
    } catch {
      preview = String(row.details || '').slice(0, 120);
    }
    return {
      id: row.id,
      user_id: row.entity_id,
      created_at: row.created_at,
      equipment_count: count,
      preview,
    };
  });

  const hints = [...forensic.hints];
  if (settingsScan.hits.length > 0) {
    hints.unshift(
      `Encontrado patrimônio legado em system_settings (${settingsScan.hits.length} chave(s)) — possível origem Replit.`,
    );
  }
  if (userEquipmentRows.some((r) => r.equipment_count > 0)) {
    const total = userEquipmentRows.reduce((s, r) => s + r.equipment_count, 0);
    hints.unshift(`UserEquipment: ${total} item(ns) em ${userEquipmentRows.length} registro(s) — use Recuperar dados.`);
  }

  return {
    ok: true,
    totalFound: mergedMap.size,
    equipments: Array.from(mergedMap.values()),
    customTypes: forensic.customTypes,
    sources: {
      ...forensic.sources,
      systemSettingsKeys: settingsScan.hits.length,
      systemSettingsEquipment: settingsScan.equipments.length,
    },
    systemSettingsHits: settingsScan.hits,
    userEquipmentRows,
    hints,
  };
}

export async function runEquipmentAutoBackup(sb: SupabaseClient): Promise<{
  ok: boolean;
  count: number;
  storage_path: string;
  snapshot_at: string;
}> {
  const scan = await runFullEquipmentScan(sb);
  const snapshotAt = new Date().toISOString();
  const storagePath = `${STORAGE_PREFIX}/equipment-${snapshotAt.replace(/[:.]/g, '-')}.json`;

  const payload = {
    timestamp: snapshotAt,
    version: '6h-auto',
    count: scan.equipments.length,
    equipments: scan.equipments,
    customTypes: scan.customTypes,
    sources: scan.sources,
  };

  const blob = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
    contentType: 'application/json',
    upsert: true,
  });
  if (upErr) console.warn('[equipment-backup] storage upload:', upErr.message);

  const snapshot: EquipmentAutoBackupSnapshot = {
    at: snapshotAt,
    count: scan.equipments.length,
    storage_path: upErr ? undefined : storagePath,
    equipments: scan.equipments,
    customTypes: scan.customTypes,
  };

  const { data: existing } = await sb.from('system_settings').select('value').eq('key', AUTO_BACKUP_KEY).maybeSingle();
  const prev = (existing?.value as { snapshots?: EquipmentAutoBackupSnapshot[] })?.snapshots || [];
  const snapshots = [snapshot, ...prev].slice(0, MAX_SNAPSHOTS);

  await sb.from('system_settings').upsert({
    key: AUTO_BACKUP_KEY,
    value: { snapshots, last_at: snapshotAt, last_count: scan.equipments.length },
    updated_by: 'cron-equipment-backup',
    updated_at: snapshotAt,
  });

  try {
    await sb.from('backup_history').insert({
      created_by: 'CRON_BACKUP_6H',
      file_name: storagePath.split('/').pop(),
      file_size: `${(blob.length / 1024).toFixed(1)} KB`,
      record_count: scan.equipments.length,
      status: upErr ? 'Parcial (só settings)' : 'Sucesso',
    });
  } catch {
    /* backup_history pode não existir em alguns ambientes */
  }

  console.log(`[equipment-backup] ${scan.equipments.length} equipamento(s) — ${storagePath}`);
  return { ok: true, count: scan.equipments.length, storage_path: storagePath, snapshot_at: snapshotAt };
}

export async function listEquipmentAutoBackups(sb: SupabaseClient): Promise<EquipmentAutoBackupSnapshot[]> {
  const { data } = await sb.from('system_settings').select('value').eq('key', AUTO_BACKUP_KEY).maybeSingle();
  const snapshots = (data?.value as { snapshots?: EquipmentAutoBackupSnapshot[] })?.snapshots || [];
  return snapshots;
}

export async function getBestEquipmentBackupSnapshot(sb: SupabaseClient): Promise<EquipmentAutoBackupSnapshot | null> {
  const snapshots = await listEquipmentAutoBackups(sb);
  return snapshots.find((s) => s.count > 0) || snapshots[0] || null;
}
