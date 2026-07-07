import type { SupabaseClient } from '@supabase/supabase-js';

export interface EquipmentRecord {
  id: string;
  type: string;
  brand: string;
  model: string;
  serial_number: string;
  patrimony_id: string;
  photo_urls: string[];
  notes: string;
  assigned_to: string;
  assigned_to_name: string;
  created_at: string;
  history: { user_id: string; user_name: string; date: string; action: string }[];
  responsibility_term?: EquipmentResponsibilityTerm;
}

export interface EquipmentResponsibilityTerm {
  signed_at: string;
  collaborator_name: string;
  role: string;
  company: string;
  material_description: string;
  receipt_date: string;
  location_city: string;
  face_photo_url: string;
  signature_url: string;
  signed_by_user_id?: string;
  signed_by_user_name?: string;
}

interface RegistryPayload {
  equipments?: EquipmentRecord[];
  customTypes?: { value: string; label: string }[];
}

function normalizeEquipment(raw: Partial<EquipmentRecord>, fallbackUser?: { id: string; name: string }): EquipmentRecord | null {
  if (!raw || (!raw.brand && !raw.model && !raw.patrimony_id)) return null;
  const id = raw.id || crypto.randomUUID();
  return {
    id,
    type: raw.type || 'outro',
    brand: raw.brand || '',
    model: raw.model || '',
    serial_number: raw.serial_number || '',
    patrimony_id: raw.patrimony_id || '',
    photo_urls: raw.photo_urls || [],
    notes: raw.notes || '',
    assigned_to: String(raw.assigned_to || fallbackUser?.id || ''),
    assigned_to_name: raw.assigned_to_name || fallbackUser?.name || '',
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
        photo_urls: [...new Set([...(prev.photo_urls || []), ...(eq.photo_urls || [])])],
        history: [...(prev.history || []), ...(eq.history || [])],
        responsibility_term: eq.responsibility_term || prev.responsibility_term,
        assigned_to: eq.assigned_to || prev.assigned_to,
        assigned_to_name: eq.assigned_to_name || prev.assigned_to_name,
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (a.patrimony_id || '').localeCompare(b.patrimony_id || '', 'pt-BR', { numeric: true }),
  );
}

export interface EquipmentRecoveryResult {
  equipments: EquipmentRecord[];
  customTypes: { value: string; label: string }[];
  masterRowId: number | null;
  recoveredFrom: { registryRows: number; userEquipmentRows: number; mergedCount: number };
}

/**
 * Carrega patrimônio do registro master mais recente e mescla snapshots legados / UserEquipment.
 */
export async function loadEquipmentWithRecovery(
  supabase: SupabaseClient,
): Promise<EquipmentRecoveryResult> {
  const [registryRes, userEqRes, usersRes] = await Promise.all([
    supabase
      .from('system_logs')
      .select('id, details, created_at')
      .eq('entity', 'EquipmentRegistry')
      .eq('entity_id', 'master')
      .order('created_at', { ascending: false }),
    supabase
      .from('system_logs')
      .select('id, entity_id, details, created_at')
      .eq('entity', 'UserEquipment')
      .order('created_at', { ascending: false }),
    supabase.from('system_users').select('id, name').eq('user_type', 'internal'),
  ]);

  const userMap = new Map<string, string>();
  (usersRes.data || []).forEach((u: { id: string; name: string }) => userMap.set(String(u.id), u.name));

  const registryLists: EquipmentRecord[][] = [];
  let customTypes: { value: string; label: string }[] = [];
  let masterRowId: number | null = null;

  for (const row of registryRes.data || []) {
    if (!row.details) continue;
    try {
      const parsed: RegistryPayload = JSON.parse(row.details);
      if (Array.isArray(parsed.customTypes) && customTypes.length === 0) {
        customTypes = parsed.customTypes;
      }
      if (Array.isArray(parsed.equipments) && parsed.equipments.length > 0) {
        registryLists.push(
          parsed.equipments
            .map((eq) => normalizeEquipment(eq))
            .filter((eq): eq is EquipmentRecord => !!eq),
        );
        if (masterRowId == null) masterRowId = row.id;
      } else if (masterRowId == null) {
        masterRowId = row.id;
      }
    } catch {
      /* ignora JSON inválido */
    }
  }

  const legacyLists: EquipmentRecord[][] = [];
  for (const row of userEqRes.data || []) {
    if (!row.details) continue;
    try {
      const parsed = JSON.parse(row.details);
      if (!Array.isArray(parsed.equipments)) continue;
      const userId = String(row.entity_id);
      const userName = userMap.get(userId) || '';
      legacyLists.push(
        parsed.equipments
          .map((eq: Partial<EquipmentRecord>) => normalizeEquipment(eq, { id: userId, name: userName }))
          .filter((eq: EquipmentRecord | null): eq is EquipmentRecord => !!eq),
      );
    } catch {
      /* ignora */
    }
  }

  const merged = mergeEquipments([...registryLists, ...legacyLists]);

  return {
    equipments: merged,
    customTypes,
    masterRowId,
    recoveredFrom: {
      registryRows: registryRes.data?.length || 0,
      userEquipmentRows: userEqRes.data?.length || 0,
      mergedCount: merged.length,
    },
  };
}

export function buildMaterialDescription(eq: EquipmentRecord, getTypeLabel: (t: string) => string): string {
  const parts = [
    getTypeLabel(eq.type),
    eq.brand,
    eq.model,
    eq.serial_number ? `S/N: ${eq.serial_number}` : '',
    eq.patrimony_id ? `Patrimônio: ${eq.patrimony_id}` : '',
  ].filter(Boolean);
  return parts.join(' — ');
}
