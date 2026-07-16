import { supabase } from '../supabase';
import type { CltEmployeeInfo, TimeClockUserContext } from './types';
import { employeeRequiresTimeclock, isTimeclockExemptUser } from './eligibility';
import { ensureNightShiftOperatorRecord } from './nightShiftOperators';
import { normalizeShiftType } from './shiftRules';
import { namesLikelyMatch } from './nameMatch';

/** Status que permitem bater ponto (período de experiência também conta). */
export const TIMECLOCK_ELIGIBLE_STATUSES = ['Ativo', 'Experiência'] as const;

export type TimeclockEligibleStatus = (typeof TIMECLOCK_ELIGIBLE_STATUSES)[number];

export function isEmployeeEligibleForTimeClock(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim();
  return (TIMECLOCK_ELIGIBLE_STATUSES as readonly string[]).includes(normalized);
}

export function isCltContractType(contractType: string | null | undefined): boolean {
  return String(contractType || '').trim().toUpperCase() === 'CLT';
}

export function isCltUser(user: TimeClockUserContext | null | undefined): boolean {
  if (!user) return false;
  if (user.isClt === true) return true;
  return isCltContractType(user.contractType);
}

function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

const EMPLOYEE_SELECT =
  'id, user_id, full_name, contract_type, digital_signature_url, matricula, status, email, shift_type, requires_timeclock, face_photo_url, face_registered_at, deleted_at';

/** Vincula automaticamente user_id quando o e-mail do login coincide com o do RH. */
async function ensureEmployeeUserLink(
  employee: CltEmployeeInfo & { email?: string | null },
  user: Pick<TimeClockUserContext, 'id' | 'email'>
): Promise<void> {
  const updates: Record<string, string> = {};

  if (!employee.user_id && user.id) {
    updates.user_id = user.id;
  }

  const empEmail = normalizeEmail(employee.email);
  const userEmail = normalizeEmail(user.email);
  if (!empEmail && userEmail) {
    updates.email = user.email!.trim();
  }

  if (Object.keys(updates).length === 0) return;

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('rh_employees')
    .update(updates)
    .eq('id', employee.id)
    .is('deleted_at', null);

  if (error) {
    console.warn('[cltEmployee] Falha ao vincular user_id automaticamente:', error.message);
  }
}

/** Retorna o funcionário CLT do usuário (compat com chamadas antigas). */
export async function fetchCltEmployeeForUser(
  user: Pick<TimeClockUserContext, 'id' | 'email' | 'name'>
): Promise<CltEmployeeInfo | null> {
  const employee = await fetchEmployeeForUser(user);
  if (!employee) return null;
  if (!isCltContractType(employee.contract_type)) return null;
  return employee;
}

/** Busca o funcionário do usuário (qualquer contrato) elegível para ponto. */
export async function fetchEmployeeForUser(
  user: Pick<TimeClockUserContext, 'id' | 'email' | 'name'>
): Promise<(CltEmployeeInfo & { email?: string | null }) | null> {
  if (!user?.id) return null;

  const statusFilter = TIMECLOCK_ELIGIBLE_STATUSES as unknown as string[];

  const { data: byUser } = await supabase
    .from('rh_employees')
    .select(EMPLOYEE_SELECT)
    .eq('user_id', user.id)
    .in('status', statusFilter)
    .is('deleted_at', null)
    .maybeSingle();

  if (byUser) {
    await ensureEmployeeUserLink(byUser as CltEmployeeInfo & { email?: string | null }, user);
    return byUser as CltEmployeeInfo;
  }

  if (user.email) {
    const email = user.email.trim();
    const { data: byEmail } = await supabase
      .from('rh_employees')
      .select(EMPLOYEE_SELECT)
      .ilike('email', email)
      .in('status', statusFilter)
      .is('deleted_at', null)
      .maybeSingle();

    if (byEmail) {
      await ensureEmployeeUserLink(byEmail as CltEmployeeInfo & { email?: string | null }, user);
      return { ...byEmail, user_id: byEmail.user_id || user.id } as CltEmployeeInfo;
    }
  }

  // Fallback: nome do login (ex.: "Daniel Pinto" → "DANIEL LUIZ LIMA PINTO").
  if (user.name) {
    const name = user.name.trim();
    const firstToken = name.split(/\s+/)[0];
    const { data: candidates } = await supabase
      .from('rh_employees')
      .select(EMPLOYEE_SELECT)
      .ilike('full_name', `%${firstToken}%`)
      .in('status', statusFilter)
      .is('deleted_at', null)
      .limit(20);

    const byName = (candidates || []).find((row) =>
      namesLikelyMatch(String(row.full_name || ''), name),
    );

    if (byName) {
      await ensureEmployeeUserLink(byName as CltEmployeeInfo & { email?: string | null }, user);
      return { ...byName, user_id: byName.user_id || user.id } as CltEmployeeInfo;
    }
  }

  return null;
}

export async function enrichUserWithCltData(
  user: TimeClockUserContext
): Promise<TimeClockUserContext> {
  if (!user?.id) {
    return { ...user, isClt: false };
  }

  const employee = await fetchEmployeeForUser(user);
  if (!employee) {
    return {
      ...user,
      isClt: user.isClt ?? false,
      requiresTimeclock: user.requiresTimeclock,
      contractType: user.contractType,
      employeeId: user.employeeId,
    };
  }

  let shiftType = normalizeShiftType(employee.shift_type);
  try {
    shiftType = await ensureNightShiftOperatorRecord(supabase, {
      id: employee.id,
      full_name: employee.full_name,
      shift_type: employee.shift_type,
    });
  } catch (e) {
    console.warn('[cltEmployee] ensureNightShiftOperatorRecord:', e);
  }

  const contractType = String(employee.contract_type || '').trim().toUpperCase();
  const isClt = isCltContractType(contractType) && isEmployeeEligibleForTimeClock(employee.status);
  let requiresTimeclock = employeeRequiresTimeclock(employee);

  // Isenção explícita (ex.: Daniel auditor) prevalece sobre flag no RH.
  if (isTimeclockExemptUser(user)) {
    requiresTimeclock = false;
  }

  return {
    ...user,
    employeeId: employee.id,
    contractType,
    isClt,
    requiresTimeclock,
    shiftType,
    digitalSignatureUrl: employee.digital_signature_url || null,
    facePhotoUrl: employee.face_photo_url || null,
    faceRegisteredAt: employee.face_registered_at || null,
  };
}

export async function saveEmployeeDigitalSignature(
  employeeId: string,
  signatureDataUrl: string
): Promise<string> {
  const sigBlob = await (await fetch(signatureDataUrl)).blob();
  const path = `timeclock-signatures/${employeeId}/signature.png`;
  const { error: upErr } = await supabase.storage.from('mission-evidence').upload(path, sigBlob, {
    upsert: true,
    contentType: 'image/png',
  });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage.from('mission-evidence').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: dbErr } = await supabase
    .from('rh_employees')
    .update({ digital_signature_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', employeeId);

  if (dbErr) throw dbErr;
  return publicUrl;
}
