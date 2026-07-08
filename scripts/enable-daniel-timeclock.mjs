#!/usr/bin/env node
/**
 * Habilita Daniel (RH002, PJ) para bater ponto:
 * - Aplica colunas shift_type / requires_timeclock (se faltarem)
 * - Marca requires_timeclock = true
 * - Vincula user_id ao login (daniel@grupotmseg.com.br ou nome compatível)
 *
 * Uso: node scripts/enable-daniel-timeclock.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_URL = `https://${TMSEG_REF}.supabase.co`;
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

function decodeRef(key) {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

function namesLikelyMatch(employeeName, userName) {
  const e = String(employeeName || '').trim().toLowerCase();
  const u = String(userName || '').trim().toLowerCase();
  if (!e || !u) return false;
  if (e === u || e.includes(u) || u.includes(e)) return true;
  const eTokens = e.split(/\s+/).filter(Boolean);
  const uTokens = u.split(/\s+/).filter((t) => t.length > 1);
  if (uTokens.length === 0) {
    const first = u.split(/\s+/)[0];
    return !!first && eTokens.includes(first);
  }
  return uTokens.every((t) => eTokens.includes(t));
}

function createSb() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const key = serviceKey && decodeRef(serviceKey) === TMSEG_REF ? serviceKey : DEFAULT_ANON;
  return createClient(url, key);
}

async function applyShiftsMigration(sb) {
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_08_timeclock_shifts_faces.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[daniel-ponto] Aplicando migration shift/face/requires_timeclock...');
  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) throw error;
  console.log('[daniel-ponto] Migration OK');
}

async function main() {
  const sb = createSb();
  await applyShiftsMigration(sb).catch((e) => {
    console.warn('[daniel-ponto] Migration (pode já estar aplicada):', e.message);
  });

  const { data: employee, error: empErr } = await sb
    .from('rh_employees')
    .select('id, matricula, full_name, email, user_id, contract_type, status, requires_timeclock')
    .is('deleted_at', null)
    .or('matricula.eq.RH002,full_name.ilike.%DANIEL%PINTO%')
    .maybeSingle();

  if (empErr || !employee) {
    console.error('[daniel-ponto] Funcionário RH002 não encontrado:', empErr?.message);
    process.exit(1);
  }

  const { data: users } = await sb
    .from('system_users')
    .select('id, name, email, status')
    .eq('status', 'Ativo');

  let login =
    users?.find((u) => String(u.email || '').toLowerCase() === 'daniel@grupotmseg.com.br') ||
    users?.find((u) => namesLikelyMatch(employee.full_name, u.name)) ||
    null;

  const updates = {
    requires_timeclock: true,
    shift_type: 'diurno',
    updated_at: new Date().toISOString(),
  };

  if (login?.id) {
    updates.user_id = String(login.id);
    if (!employee.email && login.email) updates.email = login.email;
  }

  const { error: upErr } = await sb.from('rh_employees').update(updates).eq('id', employee.id);
  if (upErr) {
    console.error('[daniel-ponto] Falha ao atualizar rh_employees:', upErr.message);
    process.exit(1);
  }

  console.log('[daniel-ponto] OK');
  console.log(JSON.stringify({
    employee: employee.full_name,
    matricula: employee.matricula,
    requires_timeclock: true,
    user_id: updates.user_id || employee.user_id || null,
    login: login ? { name: login.name, email: login.email } : 'vincule manualmente no RH',
  }, null, 2));

  process.exit(login?.id ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
