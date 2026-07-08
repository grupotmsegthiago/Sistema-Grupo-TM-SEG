import { supabase } from '../supabase';
import type { CltEmployeeInfo, TimeClockUserContext } from './types';

export function isCltUser(user: TimeClockUserContext | null | undefined): boolean {
  if (!user) return false;
  if (user.isClt === true) return true;
  return (user.contractType || '').toUpperCase() === 'CLT';
}

/** Retorna o funcionário CLT do usuário (compat com chamadas antigas). */
export async function fetchCltEmployeeForUser(
  user: Pick<TimeClockUserContext, 'id' | 'email'>
): Promise<CltEmployeeInfo | null> {
  const employee = await fetchEmployeeForUser(user);
  if (!employee) return null;
  if (String(employee.contract_type || '').toUpperCase() !== 'CLT') return null;
  return employee;
}

/** Busca o funcionário do usuário SEM filtrar por tipo de contrato. */
export async function fetchEmployeeForUser(
  user: Pick<TimeClockUserContext, 'id' | 'email'>
): Promise<CltEmployeeInfo | null> {
  const baseSelect =
    'id, user_id, full_name, contract_type, digital_signature_url, matricula, status, deleted_at';

  const { data: byUser } = await supabase
    .from('rh_employees')
    .select(baseSelect)
    .eq('user_id', user.id)
    .eq('status', 'Ativo')
    .is('deleted_at', null)
    .maybeSingle();

  if (byUser) return byUser as CltEmployeeInfo;

  if (user.email) {
    const { data: byEmail } = await supabase
      .from('rh_employees')
      .select(baseSelect)
      .ilike('email', user.email.trim())
      .eq('status', 'Ativo')
      .is('deleted_at', null)
      .maybeSingle();

    if (byEmail) return byEmail as CltEmployeeInfo;
  }

  return null;
}

export async function enrichUserWithCltData(
  user: TimeClockUserContext
): Promise<TimeClockUserContext> {
  const employee = await fetchEmployeeForUser(user);
  if (!employee) {
    return { ...user, isClt: false };
  }

  const contractType = String(employee.contract_type || '').toUpperCase();
  const isClt = contractType === 'CLT';

  return {
    ...user,
    employeeId: employee.id,
    contractType,
    isClt,
    digitalSignatureUrl: employee.digital_signature_url || null,
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
