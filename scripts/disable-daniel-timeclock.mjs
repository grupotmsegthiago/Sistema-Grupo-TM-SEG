#!/usr/bin/env node
/**
 * Remove obrigatoriedade de ponto do Daniel (RH002) — auditor/coordenador isento.
 * Uso: node scripts/disable-daniel-timeclock.mjs
 */
import { createClient } from '@supabase/supabase-js';

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

function createSb() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const key = serviceKey && decodeRef(serviceKey) === TMSEG_REF ? serviceKey : DEFAULT_ANON;
  return createClient(url, key);
}

async function main() {
  const sb = createSb();

  const { data: employee, error: empErr } = await sb
    .from('rh_employees')
    .select('id, matricula, full_name, requires_timeclock, user_id')
    .is('deleted_at', null)
    .or('matricula.eq.RH002,full_name.ilike.%DANIEL%PINTO%')
    .maybeSingle();

  if (empErr || !employee) {
    console.error('[daniel-ponto] RH002 não encontrado:', empErr?.message);
    process.exit(1);
  }

  const { error: upErr } = await sb
    .from('rh_employees')
    .update({ requires_timeclock: false, updated_at: new Date().toISOString() })
    .eq('id', employee.id);

  if (upErr) {
    console.error('[daniel-ponto] Falha ao atualizar:', upErr.message);
    process.exit(1);
  }

  console.log('[daniel-ponto] Isento de ponto:', employee.full_name, '(requires_timeclock=false)');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
