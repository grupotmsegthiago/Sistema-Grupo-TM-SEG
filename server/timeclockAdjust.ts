import type { Request, Response } from 'express';
import { createSupabaseAdminClient } from './supabaseConfig';
import {
  assertEmployeesApiAccess,
  extractUserIdFromToken,
  resolveUserRoleFromToken,
} from '../lib/rh/apiEmployeesAuth';
import { buildBrazilTimestampFromHm, getBrazilDayBounds } from '../lib/dateUtils';
import { TIME_CLOCK_STAGE_LABELS, TIME_CLOCK_STAGE_ORDER } from '../lib/timeclock/stages';
import type { TimeClockStage } from '../lib/timeclock/types';

function sb() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error('Supabase admin indisponível');
  return client;
}

function parseHmMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function validateStageOrder(times: Partial<Record<TimeClockStage, string | null>>): void {
  let prev = -1;
  for (const stage of TIME_CLOCK_STAGE_ORDER) {
    const raw = times[stage];
    if (raw == null || !String(raw).trim()) continue;
    const mins = parseHmMinutes(String(raw));
    if (mins === null) {
      throw new Error(`Horário inválido em ${TIME_CLOCK_STAGE_LABELS[stage]} — use HH:MM`);
    }
    if (mins <= prev) {
      throw new Error('Horários devem seguir a ordem: entrada → saída almoço → retorno almoço → fim do expediente.');
    }
    prev = mins;
  }
}

async function loadEmployeeByUserId(userId: string) {
  const { data } = await sb()
    .from('rh_employees')
    .select('id, user_id, full_name, contract_type, status')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

export async function handleTimeclockAdjust(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const denied = await assertEmployeesApiAccess(token);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
      return;
    }

    const callerId = extractUserIdFromToken(token);
    const body = req.body || {};
    const userId = String(body.userId || body.user_id || '').trim();
    const date = String(body.date || '').trim();
    const times = (body.times || {}) as Partial<Record<TimeClockStage, string | null>>;
    const note = String(body.note || '').trim();

    if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ ok: false, error: 'Informe colaborador (userId) e data (YYYY-MM-DD).' });
      return;
    }

    validateStageOrder(times);

    const employee = await loadEmployeeByUserId(userId);
    if (!employee) {
      res.status(404).json({ ok: false, error: 'Colaborador CLT não encontrado ou sem login vinculado.' });
      return;
    }

    const { data: userRow } = await sb().from('system_users').select('name').eq('id', userId).maybeSingle();
    const callerRole = await resolveUserRoleFromToken(token);
    const { data: callerRow } = callerId
      ? await sb().from('system_users').select('name').eq('id', callerId).maybeSingle()
      : { data: null };

    const { start, end } = getBrazilDayBounds(date);
    const { data: existing, error: loadErr } = await sb()
      .from('time_clock')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .lte('timestamp', end);

    if (loadErr) {
      res.status(500).json({ ok: false, error: loadErr.message });
      return;
    }

    const changes: Array<{ stage: TimeClockStage; action: 'insert' | 'update' | 'delete'; id?: string }> = [];

    for (const stage of TIME_CLOCK_STAGE_ORDER) {
      const rawTime = times[stage];
      const hasTime = rawTime != null && String(rawTime).trim() !== '';
      const existingEntry = (existing || []).find((e) => e.type === stage);

      if (!hasTime) {
        if (existingEntry?.id) {
          const { error: delErr } = await sb().from('time_clock').delete().eq('id', existingEntry.id);
          if (delErr) throw delErr;
          changes.push({ stage, action: 'delete', id: existingEntry.id });
        }
        continue;
      }

      const timestamp = buildBrazilTimestampFromHm(date, String(rawTime).trim());
      const metadata = {
        ...(typeof existingEntry?.metadata === 'object' && existingEntry?.metadata ? existingEntry.metadata : {}),
        adjusted: true,
        adjusted_at: new Date().toISOString(),
        adjusted_by: callerId,
        adjusted_by_name: callerRow?.name || callerRole || 'RH',
        adjust_note: note || null,
        source: 'rh-adjust',
      };

      if (existingEntry?.id) {
        const { error: updErr } = await sb()
          .from('time_clock')
          .update({ timestamp, metadata })
          .eq('id', existingEntry.id);
        if (updErr) throw updErr;
        changes.push({ stage, action: 'update', id: existingEntry.id });
      } else {
        const { error: insErr } = await sb().from('time_clock').insert([
          {
            user_id: userId,
            employee_id: employee.id,
            user_name: userRow?.name || employee.full_name || 'Colaborador',
            type: stage,
            timestamp,
            latitude: null,
            longitude: null,
            photo_url: null,
            signature_url: null,
            ai_verification: false,
            metadata,
          },
        ]);
        if (insErr) throw insErr;
        changes.push({ stage, action: 'insert' });
      }
    }

    try {
      await sb().from('rh_audit_logs').insert([
        {
          entity: 'time_clock',
          entity_id: employee.id,
          action: 'adjust',
          user_name: callerRow?.name || 'RH',
          user_id: callerId,
          new_data: { userId, date, times, note, changes },
        },
      ]);
    } catch (auditErr) {
      console.warn('[timeclockAdjust] audit log falhou:', auditErr);
    }

    const { data: refreshed } = await sb()
      .from('time_clock')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: true });

    res.json({ ok: true, entries: refreshed || [], changes });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Falha ao ajustar ponto';
    console.error('[timeclockAdjust]', message);
    res.status(400).json({ ok: false, error: message });
  }
}
