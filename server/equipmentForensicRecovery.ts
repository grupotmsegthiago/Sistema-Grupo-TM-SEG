import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord } from '../lib/equipmentRecovery';

export interface ForensicRecoveryReport {
  ok: boolean;
  equipments: EquipmentRecord[];
  customTypes: { value: string; label: string }[];
  sources: {
    registryRows: number;
    userEquipmentRows: number;
    detailsScanRows: number;
    storagePhotoGroups: number;
    backupRows: number;
  };
  hints: string[];
}

function normalizeFromRaw(raw: Partial<EquipmentRecord>, fallback?: { id: string; name: string }): EquipmentRecord | null {
  if (!raw || (!raw.brand && !raw.model && !raw.patrimony_id && !(raw.photo_urls?.length))) return null;
  return {
    id: raw.id || randomUUID(),
    type: raw.type || 'outro',
    brand: raw.brand || '',
    model: raw.model || '',
    serial_number: raw.serial_number || '',
    patrimony_id: raw.patrimony_id || '',
    photo_urls: raw.photo_urls || [],
    notes: raw.notes || '',
    assigned_to: String(raw.assigned_to || fallback?.id || ''),
    assigned_to_name: raw.assigned_to_name || fallback?.name || '',
    created_at: raw.created_at || new Date().toISOString(),
    history: Array.isArray(raw.history) ? raw.history : [],
    responsibility_term: raw.responsibility_term,
  };
}

function mergeEquipments(lists: EquipmentRecord[][]): EquipmentRecord[] {
  const byKey = new Map<string, EquipmentRecord>();
  const keyOf = (eq: EquipmentRecord) => {
    if (eq.patrimony_id) return `pat:${eq.patrimony_id.toLowerCase()}`;
    if (eq.serial_number) return `sn:${eq.serial_number.toLowerCase()}`;
    return `id:${eq.id}`;
  };

  for (const list of lists) {
    for (const eq of list) {
      const key = keyOf(eq);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, eq);
        continue;
      }
      byKey.set(key, {
        ...prev,
        ...eq,
        patrimony_id: eq.patrimony_id || prev.patrimony_id,
        brand: eq.brand || prev.brand,
        model: eq.model || prev.model,
        serial_number: eq.serial_number || prev.serial_number,
        photo_urls: [...new Set([...(prev.photo_urls || []), ...(eq.photo_urls || [])])],
        history: [...(prev.history || []), ...(eq.history || [])],
        responsibility_term: eq.responsibility_term || prev.responsibility_term,
        assigned_to: eq.assigned_to || prev.assigned_to,
        assigned_to_name: eq.assigned_to_name || prev.assigned_to_name,
      });
    }
  }

  let nextPat = 1;
  for (const eq of byKey.values()) {
    if (!eq.patrimony_id) {
      eq.patrimony_id = `PAT-${String(nextPat).padStart(4, '0')}`;
      nextPat += 1;
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (a.patrimony_id || '').localeCompare(b.patrimony_id || '', 'pt-BR', { numeric: true }),
  );
}

function extractFromDetails(details: string, entity?: string, entityId?: string): EquipmentRecord[] {
  const found: EquipmentRecord[] = [];
  if (!details) return found;

  try {
    const parsed = JSON.parse(details);
    if (Array.isArray(parsed.equipments)) {
      for (const eq of parsed.equipments) {
        const norm = normalizeFromRaw(eq, entity === 'UserEquipment' && entityId ? { id: entityId, name: '' } : undefined);
        if (norm) found.push(norm);
      }
      return found;
    }
    if (parsed.patrimony_id || parsed.brand || parsed.model) {
      const norm = normalizeFromRaw(parsed);
      if (norm) found.push(norm);
    }
    if (Array.isArray(parsed.content?.equipment_registry)) {
      for (const row of parsed.content.equipment_registry) {
        if (!row?.details) continue;
        found.push(...extractFromDetails(row.details, row.entity, row.entity_id));
      }
    }
  } catch {
    const patMatches = details.match(/PAT-\d{3,6}/gi) || [];
    for (const pat of [...new Set(patMatches)]) {
      found.push(
        normalizeFromRaw({
          id: randomUUID(),
          patrimony_id: pat.toUpperCase(),
          brand: 'Recuperado de log',
          model: 'Revisar cadastro',
          type: 'outro',
          photo_urls: [],
          notes: 'Registro parcial extraído de system_logs (JSON corrompido ou truncado).',
          assigned_to: '',
          assigned_to_name: '',
          created_at: new Date().toISOString(),
          history: [],
        })!,
      );
    }
  }

  return found;
}

async function listStorageEquipmentPhotos(sb: SupabaseClient): Promise<EquipmentRecord[]> {
  const results: EquipmentRecord[] = [];
  const buckets = ['mission-evidence'];
  const prefixes = ['equipment', 'equipment-terms'];

  for (const bucket of buckets) {
    for (const prefix of prefixes) {
      try {
        const { data: files } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
        if (!files?.length) continue;

        const byId = new Map<string, string[]>();
        for (const file of files) {
          if (!file.name || file.name === '.emptyFolderPlaceholder') continue;
          const match = file.name.match(/^([0-9a-f-]{36})-/i);
          const id = match?.[1] || file.name.split('-')[0];
          if (!id) continue;
          const { data: urlData } = sb.storage.from(bucket).getPublicUrl(`${prefix}/${file.name}`);
          const list = byId.get(id) || [];
          list.push(urlData.publicUrl);
          byId.set(id, list);
        }

        for (const [id, urls] of byId) {
          results.push({
            id,
            type: 'outro',
            brand: 'Recuperado (foto no storage)',
            model: 'Completar cadastro',
            serial_number: '',
            patrimony_id: '',
            photo_urls: urls,
            notes: `Fotos encontradas em ${bucket}/${prefix}/ — metadados originais podem ter sido apagados.`,
            assigned_to: '',
            assigned_to_name: '',
            created_at: new Date().toISOString(),
            history: [{ user_id: '', user_name: 'Sistema', date: new Date().toISOString(), action: 'Recuperado do storage' }],
          });
        }
      } catch {
        /* bucket/prefix pode não existir */
      }
    }
  }

  return results;
}

export async function runForensicEquipmentRecovery(sb: SupabaseClient): Promise<ForensicRecoveryReport> {
  const hints: string[] = [];
  const lists: EquipmentRecord[][] = [];
  let customTypes: { value: string; label: string }[] = [];

  const [registryRes, userEqRes, detailsRes, backupRes, usersRes] = await Promise.all([
    sb.from('system_logs').select('id, entity_id, details, created_at').eq('entity', 'EquipmentRegistry').order('created_at', { ascending: false }).limit(200),
    sb.from('system_logs').select('id, entity_id, details, created_at').eq('entity', 'UserEquipment').order('created_at', { ascending: false }).limit(500),
    sb.from('system_logs').select('id, entity, entity_id, details, created_at').or('details.ilike.%patrimony_id%,details.ilike.%"equipments"%,details.ilike.%PAT-%').order('created_at', { ascending: false }).limit(300),
    sb.from('backup_history').select('id, file_name, created_at, record_count').order('created_at', { ascending: false }).limit(20),
    sb.from('system_users').select('id, name'),
  ]);

  const userMap = new Map<string, string>();
  (usersRes.data || []).forEach((u: { id: string; name: string }) => userMap.set(String(u.id), u.name));

  for (const row of registryRes.data || []) {
    if (!row.details) continue;
    try {
      const parsed = JSON.parse(row.details);
      if (Array.isArray(parsed.customTypes) && customTypes.length === 0) customTypes = parsed.customTypes;
    } catch { /* */ }
    lists.push(extractFromDetails(row.details));
  }

  for (const row of userEqRes.data || []) {
    if (!row.details) continue;
    const name = userMap.get(String(row.entity_id)) || '';
    const extracted = extractFromDetails(row.details, 'UserEquipment', String(row.entity_id));
    for (const eq of extracted) {
      if (!eq.assigned_to_name && name) eq.assigned_to_name = name;
    }
    lists.push(extracted);
  }

  const detailsRows = detailsRes.data || [];
  const seenDetailIds = new Set<number>();
  for (const row of registryRes.data || []) seenDetailIds.add(row.id);
  for (const row of userEqRes.data || []) seenDetailIds.add(row.id);

  for (const row of detailsRows) {
    if (seenDetailIds.has(row.id) || !row.details) continue;
    lists.push(extractFromDetails(row.details, row.entity, row.entity_id));
  }

  const storageItems = await listStorageEquipmentPhotos(sb);
  if (storageItems.length) {
    lists.push(storageItems);
    hints.push(`${storageItems.length} equipamento(s) parcial(is) reconstruído(s) a partir de fotos no storage.`);
  }

  const merged = mergeEquipments(lists);

  if (merged.length === 0) {
    hints.push('Nenhum vestígio de patrimônio encontrado em system_logs nem no storage.');
    if ((backupRes.data || []).length > 0) {
      hints.push(`Existem ${backupRes.data!.length} registro(s) em backup_history — se você baixou o JSON completo antes, use "Importar backup".`);
    } else {
      hints.push('Última opção: restaurar snapshot do Supabase (Dashboard → Database → Backups) se o plano tiver PITR.');
    }
  }

  return {
    ok: true,
    equipments: merged,
    customTypes,
    sources: {
      registryRows: registryRes.data?.length || 0,
      userEquipmentRows: userEqRes.data?.length || 0,
      detailsScanRows: detailsRows.length,
      storagePhotoGroups: storageItems.length,
      backupRows: backupRes.data?.length || 0,
    },
    hints,
  };
}

export function parseEquipmentFromBackupJson(raw: unknown): { equipments: EquipmentRecord[]; customTypes: { value: string; label: string }[] } {
  const lists: EquipmentRecord[][] = [];
  let customTypes: { value: string; label: string }[] = [];

  if (!raw) return { equipments: [], customTypes };

  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { equipments: [], customTypes };
    }
  } else if (typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else {
    return { equipments: [], customTypes };
  }

  // Export do SQL Editor: { backup_json: "{ ... }" } ou coluna única
  if (typeof obj.backup_json === 'string') {
    return parseEquipmentFromBackupJson(JSON.parse(obj.backup_json));
  }
  if (typeof obj.backup_json === 'object' && obj.backup_json) {
    return parseEquipmentFromBackupJson(obj.backup_json);
  }

  const content = (obj.content || obj.database || obj) as Record<string, unknown>;

  const registry = content.equipment_registry;
  if (Array.isArray(registry)) {
    for (const row of registry) {
      const r = row as { details?: string; entity?: string; entity_id?: string };
      if (r.details) lists.push(extractFromDetails(r.details, r.entity, r.entity_id));
    }
  }

  if (Array.isArray(content.system_logs)) {
    for (const row of content.system_logs) {
      const r = row as { details?: string; entity?: string; entity_id?: string };
      if (r.entity === 'EquipmentRegistry' || r.entity === 'UserEquipment') {
        if (r.details) lists.push(extractFromDetails(r.details, r.entity, r.entity_id));
      }
    }
  }

  return { equipments: mergeEquipments(lists), customTypes };
}
