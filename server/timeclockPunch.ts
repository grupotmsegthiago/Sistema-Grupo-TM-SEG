import type { Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import {
  extractUserIdFromToken,
  resolveUserRoleFromToken,
} from '../lib/rh/apiEmployeesAuth';
import { isDiretoriaRole, employeeRequiresTimeclock } from '../lib/timeclock/eligibility';
import { canPunchEntryNow } from '../lib/timeclock/shiftRules';
import { fetchActiveShiftEntries } from '../lib/timeclock/shiftEntries';
import { getNextTimeClockStage } from '../lib/timeclock/stages';
import { namesLikelyMatch } from '../lib/timeclock/nameMatch';
import type { TimeClockEntry, TimeClockStage } from '../lib/timeclock/types';
import { getBrazilDayBounds } from '../lib/dateUtils';

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error('Supabase admin indisponível');
  return client;
}

const EMPLOYEE_PUNCH_SELECT =
  'id, user_id, full_name, contract_type, status, shift_type, requires_timeclock, face_photo_url, email';

async function loadEmployeeForUser(userId: string) {
  const client = sb();
  const { data: byUser } = await client
    .from('rh_employees')
    .select(EMPLOYEE_PUNCH_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (byUser) return byUser;

  const { data: userRow } = await client
    .from('system_users')
    .select('id, name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow) return null;

  const statusFilter = ['Ativo', 'Experiência'];

  if (userRow.email) {
    const { data: byEmail } = await client
      .from('rh_employees')
      .select(EMPLOYEE_PUNCH_SELECT)
      .ilike('email', userRow.email.trim())
      .in('status', statusFilter)
      .is('deleted_at', null)
      .maybeSingle();
    if (byEmail) {
      if (!byEmail.user_id) {
        await client
          .from('rh_employees')
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq('id', byEmail.id);
      }
      return { ...byEmail, user_id: byEmail.user_id || userId };
    }
  }

  if (userRow.name) {
    const firstToken = String(userRow.name).trim().split(/\s+/)[0];
    const { data: candidates } = await client
      .from('rh_employees')
      .select(EMPLOYEE_PUNCH_SELECT)
      .ilike('full_name', `%${firstToken}%`)
      .in('status', statusFilter)
      .is('deleted_at', null)
      .limit(20);

    const match = (candidates || []).find((row) =>
      namesLikelyMatch(String(row.full_name || ''), userRow.name),
    );
    if (match) {
      if (!match.user_id) {
        await client
          .from('rh_employees')
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq('id', match.id);
      }
      return { ...match, user_id: match.user_id || userId };
    }
  }

  return null;
}

function requiresPunch(employee: any): boolean {
  return employeeRequiresTimeclock(employee);
}

async function fetchDayPunchHistory(userId: string, isoDate: string): Promise<TimeClockEntry[]> {
  const { start, end } = getBrazilDayBounds(isoDate);
  const { data } = await sb()
    .from('time_clock')
    .select('type, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true });
  return (data || []) as TimeClockEntry[];
}

async function fetchActivePunchHistory(userId: string, shiftType?: string | null): Promise<TimeClockEntry[]> {
  return fetchActiveShiftEntries(userId, fetchDayPunchHistory, shiftType);
}

export async function handleTimeclockPunch(req: Request, res: Response): Promise<void> {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = extractUserIdFromToken(token);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  const role = await resolveUserRoleFromToken(token);
  if (isDiretoriaRole(role)) {
    res.status(403).json({ ok: false, error: 'Perfil diretoria não registra ponto.' });
    return;
  }

  const body = req.body || {};
  const stage = body.stage as TimeClockStage;
  const photoBase64 = String(body.photoBase64 || '');
  const signatureUrl = String(body.signatureUrl || '');
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!stage || !photoBase64) {
    res.status(400).json({ ok: false, error: 'Dados de ponto incompletos.' });
    return;
  }

  const employee = await loadEmployeeForUser(userId);
  if (!requiresPunch(employee)) {
    res.status(403).json({ ok: false, error: 'Seu perfil não exige registro de ponto.' });
    return;
  }

  const history = await fetchActivePunchHistory(userId, employee?.shift_type);
  const expected = getNextTimeClockStage(history || []);
  if (expected === 'DONE') {
    res.status(400).json({ ok: false, error: 'Jornada de hoje já foi concluída.' });
    return;
  }
  if (expected !== stage) {
    res.status(400).json({ ok: false, error: `Próxima batida esperada: ${expected}.` });
    return;
  }

  if (stage === 'IN') {
    const window = canPunchEntryNow(employee?.shift_type);
    if (!window.allowed) {
      res.status(403).json({ ok: false, error: window.message || 'Horário de entrada bloqueado.' });
      return;
    }
  }

  const path = `timeclock/${userId}/${Date.now()}.jpg`;
  const buffer = Buffer.from(photoBase64, 'base64');
  const { error: upErr } = await sb().storage.from('mission-evidence').upload(path, buffer, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  const photoUrl = upErr
    ? `data:image/jpeg;base64,${photoBase64}`
    : sb().storage.from('mission-evidence').getPublicUrl(path).data.publicUrl;

  const { data: userRow } = await sb().from('system_users').select('name').eq('id', userId).maybeSingle();

  const payload = {
    user_id: userId,
    employee_id: employee?.id || null,
    user_name: userRow?.name || employee?.full_name || 'Usuário',
    type: stage,
    timestamp: new Date().toISOString(),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    photo_url: photoUrl,
    signature_url: signatureUrl || null,
    ai_verification: true,
    metadata: {
      stage,
      source: 'api-punch',
      shift_type: employee?.shift_type || 'diurno',
    },
  };

  const { data, error } = await sb().from('time_clock').insert([payload]).select('*').single();
  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  res.json({ ok: true, entry: data });
}
