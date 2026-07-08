import { supabase } from '../supabase';
import type { CltEmployeeInfo, TimeClockUserContext } from './types';

export function isCltUser(user: TimeClockUserContext | null | undefined): boolean {
  if (!user) return false;
  if (user.isClt === true) return true;
  return (user.contractType || '').toUpperCase() === 'CLT';
}

export async function fetchCltEmployeeForUser(
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

  if (byUser && String(byUser.contract_type || '').toUpperCase() === 'CLT') {
    return byUser as CltEmployeeInfo;
  }

  if (user.email) {
    const { data: byEmail } = await supabase
      .from('rh_employees')
      .select(baseSelect)
      .ilike('email', user.email.trim())
      .eq('status', 'Ativo')
      .is('deleted_at', null)
      .maybeSingle();

    if (byEmail && String(byEmail.contract_type || '').toUpperCase() === 'CLT') {
      return byEmail as CltEmployeeInfo;
    }
  }

  return null;
}

export async function enrichUserWithCltData(
  user: TimeClockUserContext
): Promise<TimeClockUserContext> {
  const employee = await fetchCltEmployeeForUser(user);
  if (!employee) {
    return { ...user, isClt: false };
  }

  return {
    ...user,
    employeeId: employee.id,
    contractType: employee.contract_type,
    isClt: true,
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
