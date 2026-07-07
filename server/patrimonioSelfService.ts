import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentRecord, EquipmentResponsibilityTerm } from '../lib/equipmentRecovery';
import type { PatrimonioDeclaredItemDraft, PatrimonioComplianceStatus } from '../lib/patrimonioSelfServiceTypes';
import { savePatrimonioToTables, loadPatrimonioFromTables } from './patrimonioStore';

const BYPASS_ROLES = new Set(['diretoria', 'administrador', 'ceo']);
const BYPASS_PERMS = new Set(['*', 'equipment-manager', 'patrimonio-bypass']);

export interface ComplianceUser {
  id: string;
  name?: string | null;
  role?: string;
  permissions?: string[];
  user_type?: string;
}

export function isPatrimonioComplianceRequired(user: ComplianceUser): boolean {
  if (user.user_type && user.user_type !== 'internal') return false;
  const role = (user.role || '').toLowerCase();
  if (BYPASS_ROLES.has(role)) return false;
  const perms = user.permissions || [];
  if (perms.some((p) => BYPASS_PERMS.has(p))) return false;
  return true;
}

async function complianceTableExists(sb: SupabaseClient): Promise<boolean> {
  const { error } = await sb.from('patrimonio_employee_compliance').select('user_id', { head: true }).limit(1);
  return !error || !String(error.message).includes('does not exist');
}

export async function getEmployeeCompliance(sb: SupabaseClient, user: ComplianceUser) {
  const required = isPatrimonioComplianceRequired(user);
  if (!required) {
    return { required: false, status: 'completed' as PatrimonioComplianceStatus, items_count: 0, equipments: [] };
  }

  let status: PatrimonioComplianceStatus = 'pending';
  let declared_at: string | undefined;
  let contract_signed_at: string | undefined;

  if (await complianceTableExists(sb)) {
    const { data } = await sb.from('patrimonio_employee_compliance').select('*').eq('user_id', user.id).maybeSingle();
    if (data) {
      status = (data.status as PatrimonioComplianceStatus) || 'pending';
      declared_at = data.declared_at || undefined;
      contract_signed_at = data.contract_signed_at || undefined;
    }
  }

  const { equipments } = await loadPatrimonioFromTables(sb);
  const mine = equipments.filter((e) => String(e.assigned_to) === String(user.id));

  if (status !== 'completed' && mine.length > 0 && mine.every((e) => e.responsibility_term)) {
    status = 'completed';
    contract_signed_at = mine[0].responsibility_term?.signed_at;
  }

  return {
    required: true,
    status,
    declared_at,
    contract_signed_at,
    items_count: mine.length,
    equipments: mine,
  };
}

function nextPatrimonyId(existing: EquipmentRecord[]): string {
  let max = 0;
  for (const eq of existing) {
    const m = eq.patrimony_id.match(/PAT-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PAT-${String(max + 1).padStart(4, '0')}`;
}

function draftToEquipment(
  draft: PatrimonioDeclaredItemDraft,
  user: ComplianceUser,
  patrimony_id: string,
): EquipmentRecord {
  const label = draft.chip_line ? `Linha: ${draft.chip_line}` : '';
  return {
    id: randomUUID(),
    type: draft.type,
    brand: draft.brand || '',
    model: draft.model || (draft.type === 'chip' ? 'Chip/Linha' : ''),
    serial_number: draft.serial_number || draft.chip_line || '',
    patrimony_id,
    photo_urls: draft.photo_urls || [],
    notes: [draft.notes, label].filter(Boolean).join(' · '),
    assigned_to: user.id,
    assigned_to_name: user.name || '',
    created_at: new Date().toISOString(),
    history: [{
      user_id: user.id,
      user_name: user.name || 'Colaborador',
      date: new Date().toISOString(),
      action: 'Autodeclaração home office',
    }],
  };
}

export async function saveEmployeeDeclaration(
  sb: SupabaseClient,
  user: ComplianceUser,
  items: PatrimonioDeclaredItemDraft[],
) {
  const { equipments: all } = await loadPatrimonioFromTables(sb);
  const others = all.filter((e) => String(e.assigned_to) !== String(user.id));
  const newItems: EquipmentRecord[] = [];
  let seq = nextPatrimonyId(all);
  for (const draft of items) {
    newItems.push(draftToEquipment(draft, user, seq));
    const n = parseInt(seq.replace(/\D/g, ''), 10);
    seq = `PAT-${String(n + 1).padStart(4, '0')}`;
  }
  const merged = [...others, ...newItems];
  await savePatrimonioToTables(sb, merged, [], 'self_service_declare');

  const now = new Date().toISOString();
  if (await complianceTableExists(sb)) {
    await sb.from('patrimonio_employee_compliance').upsert({
      user_id: user.id,
      status: 'declared',
      declared_at: now,
      declared_items: items,
      items_count: newItems.length,
      updated_at: now,
    });
  }

  return { equipments: newItems, status: 'declared' as PatrimonioComplianceStatus };
}

export async function signEmployeePatrimonioContract(
  sb: SupabaseClient,
  user: ComplianceUser,
  term: EquipmentResponsibilityTerm,
  equipmentIds: string[],
) {
  const { equipments: all } = await loadPatrimonioFromTables(sb);
  const updated = all.map((eq) => {
    if (String(eq.assigned_to) !== String(user.id)) return eq;
    if (equipmentIds.length && !equipmentIds.includes(eq.id)) return eq;
    return { ...eq, responsibility_term: term };
  });
  await savePatrimonioToTables(sb, updated, [], 'self_service_contract');

  const now = new Date().toISOString();
  if (await complianceTableExists(sb)) {
    await sb.from('patrimonio_employee_compliance').upsert({
      user_id: user.id,
      status: 'completed',
      contract_signed_at: now,
      contract: term,
      updated_at: now,
    });
  }

  return { status: 'completed' as PatrimonioComplianceStatus, contract_signed_at: now };
}

export async function completeEmptyPatrimonioDeclaration(sb: SupabaseClient, user: ComplianceUser, term: EquipmentResponsibilityTerm) {
  const { equipments: all } = await loadPatrimonioFromTables(sb);
  const others = all.filter((e) => String(e.assigned_to) !== String(user.id));
  await savePatrimonioToTables(sb, others, [], 'self_service_empty');

  const now = new Date().toISOString();
  if (await complianceTableExists(sb)) {
    await sb.from('patrimonio_employee_compliance').upsert({
      user_id: user.id,
      status: 'completed',
      declared_at: now,
      contract_signed_at: now,
      items_count: 0,
      contract: term,
      declared_items: [],
      updated_at: now,
    });
  }
  return { status: 'completed' as PatrimonioComplianceStatus };
}
