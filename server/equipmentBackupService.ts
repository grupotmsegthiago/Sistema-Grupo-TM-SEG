import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord } from '../lib/equipmentRecovery';
import { runForensicEquipmentRecovery, parseEquipmentFromBackupJson } from './equipmentForensicRecovery';

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
  const [forensic, settingsScan, userEqPreview, tableRes] = await Promise.all([
    runForensicEquipmentRecovery(sb),
    scanSystemSettingsForEquipment(sb),
    sb
      .from('system_logs')
      .select('id, entity_id, created_at, details')
      .eq('entity', 'UserEquipment')
      .order('created_at', { ascending: false }),
    sb.from('patrimonio_equipments').select('id', { head: true, count: 'exact' }).is('deleted_at', null),
  ]);

  const tableCount = tableRes.count ?? 0;

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
  if (tableCount > 0) {
    hints.unshift(`Tabela dedicada patrimonio_equipments: ${tableCount} item(ns) ativo(s).`);
  }
  if (settingsScan.hits.length > 0) {
    hints.unshift(
      `Legado em system_settings (${settingsScan.hits.length} chave(s)) — migre para patrimonio_equipments.`,
    );
  }
  if (userEquipmentRows.some((r) => r.equipment_count > 0)) {
    const total = userEquipmentRows.reduce((s, r) => s + r.equipment_count, 0);
    hints.unshift(`UserEquipment (system_logs legado): ${total} item(ns) em ${userEquipmentRows.length} registro(s).`);
  }

  return {
    ok: true,
    totalFound: mergedMap.size,
    equipments: Array.from(mergedMap.values()),
    customTypes: forensic.customTypes,
    sources: {
      ...forensic.sources,
      patrimonioTableCount: tableCount,
      systemSettingsKeys: settingsScan.hits.length,
      systemSettingsEquipment: settingsScan.equipments.length,
    },
    systemSettingsHits: settingsScan.hits,
    userEquipmentRows,
    hints,
  };
}
