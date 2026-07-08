import type { Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import {
  extractUserIdFromToken,
  resolveUserRoleFromToken,
} from '../lib/rh/apiEmployeesAuth';
import { isDiretoriaRole } from '../lib/timeclock/eligibility';
import { canPunchEntryNow } from '../lib/timeclock/shiftRules';
import { getNextTimeClockStage } from '../lib/timeclock/stages';
import type { TimeClockStage } from '../lib/timeclock/types';

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error('Supabase admin indisponível');
  return client;
}

async function loadEmployeeForUser(userId: string) {
  const { data } = await sb()
    .from('rh_employees')
    .select('id, user_id, full_name, contract_type, status, shift_type, requires_timeclock, face_photo_url')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

function requiresPunch(employee: any): boolean {
  if (!employee) return false;
  if (employee.requires_timeclock === true) return true;
  const ct = String(employee.contract_type || '').toUpperCase();
  const st = String(employee.status || '');
  return ct === 'CLT' && ['Ativo', 'Experiência'].includes(st);
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: history } = await sb()
    .from('time_clock')
    .select('type, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', `${today}T00:00:00`)
    .lte('timestamp', `${today}T23:59:59`)
    .order('timestamp', { ascending: true });

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
