#!/usr/bin/env node
/**
 * Vincula funcionários CLT (rh_employees) aos logins (system_users).
 * Corrige schema (user_id TEXT) quando DATABASE_URL está disponível.
 *
 * Uso:
 *   node scripts/link-clt-system-users.mjs
 *   node scripts/link-clt-system-users.mjs --api https://sistema.grupotmseg.com.br
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
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

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function normalizeName(n) {
  return String(n || '').trim().toLowerCase();
}

function nameMatches(empName, userName) {
  const e = normalizeName(empName);
  const u = normalizeName(userName);
  if (!e || !u) return false;
  if (e === u) return true;
  if (e.includes(u) || u.includes(e)) return true;
  const first = e.split(/\s+/)[0];
  if (first && u.includes(first)) return true;
  return false;
}

function createSb() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (serviceKey && decodeRef(serviceKey) === TMSEG_REF) {
    console.log('[link-clt] Usando SUPABASE_SERVICE_ROLE_KEY');
    return createClient(url, serviceKey);
  }
  console.log('[link-clt] Usando chave anon (RLS deve permitir update em rh_employees)');
  return createClient(url, DEFAULT_ANON);
}

function getPgPool() {
  const connectionString = String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.SUPABASE_DB_URL ||
      '',
  ).trim();
  if (!connectionString) return null;
  return new pg.Pool({ connectionString, max: 2, ssl: { rejectUnauthorized: false } });
}

async function applySchemaFixViaPg() {
  const pool = getPgPool();
  if (!pool) return false;
  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_08_timeclock_fix_user_id.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('[link-clt] Aplicando schema fix via DATABASE_URL...');
  await pool.query(sql);
  await pool.end();
  console.log('[link-clt] Schema OK (user_id TEXT + time_clock)');
  return true;
}

async function callRemoteInit(apiBase) {
  const base = String(apiBase || '').replace(/\/$/, '');
  console.log(`[link-clt] Chamando POST ${base}/api/rh-timeclock-init ...`);
  const res = await fetch(`${base}/api/rh-timeclock-init`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  console.log('[link-clt] Init remoto OK:', JSON.stringify(body, null, 2));
  return body;
}

async function main() {
  const apiArg = process.argv.find((a) => a.startsWith('--api='))?.split('=')[1]
    || (process.argv.includes('--api') ? process.argv[process.argv.indexOf('--api') + 1] : null);

  if (apiArg) {
    await callRemoteInit(apiArg);
    process.exit(0);
  }

  await applySchemaFixViaPg().catch((e) => {
    console.warn('[link-clt] Schema via pg não aplicado:', e.message);
  });

  const sb = createSb();

  const { data: employees, error: empErr } = await sb
    .from('rh_employees')
    .select('id, matricula, full_name, contract_type, status, email, user_id')
    .is('deleted_at', null)
    .ilike('contract_type', 'clt')
    .in('status', ['Ativo', 'Experiência']);

  if (empErr) {
    console.error('Erro ao listar rh_employees:', empErr.message);
    process.exit(1);
  }

  const { data: users, error: usrErr } = await sb
    .from('system_users')
    .select('id, name, email, status')
    .eq('status', 'Ativo');

  if (usrErr) {
    console.error('Erro ao listar system_users:', usrErr.message);
    process.exit(1);
  }

  const unlinked = (employees || []).filter((e) => !e.user_id);
  console.log(`\nCLT elegíveis: ${employees?.length || 0} | Sem vínculo: ${unlinked.length} | Logins ativos: ${users?.length || 0}\n`);

  let linked = 0;
  const results = [];

  for (const emp of unlinked) {
    let match =
      users?.find(
        (u) =>
          normalizeEmail(emp.email) &&
          normalizeEmail(u.email) &&
          normalizeEmail(emp.email) === normalizeEmail(u.email)
      ) || null;

    if (!match) {
      match = users?.find((u) => nameMatches(emp.full_name, u.name)) || null;
    }

    if (!match) {
      results.push({ matricula: emp.matricula, name: emp.full_name, status: 'SEM_MATCH' });
      continue;
    }

    const { error: upErr } = await sb
      .from('rh_employees')
      .update({
        user_id: String(match.id),
        email: emp.email?.trim() || match.email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', emp.id);

    if (upErr) {
      results.push({
        matricula: emp.matricula,
        name: emp.full_name,
        status: 'ERRO',
        detail: upErr.message,
      });
      continue;
    }

    linked += 1;
    results.push({
      matricula: emp.matricula,
      name: emp.full_name,
      status: 'VINCULADO',
      login: match.name,
      email: match.email,
    });
  }

  console.log('── Resultado do vínculo ──');
  for (const r of results) {
    console.log(
      `${r.status.padEnd(12)} ${r.matricula || '?'} | ${r.name}` +
        (r.login ? ` → ${r.login} (${r.email})` : '') +
        (r.detail ? ` [${r.detail}]` : '')
    );
  }
  console.log(`\nTotal vinculados nesta execução: ${linked}`);

  const { data: final, error: finalErr } = await sb
    .from('rh_employees')
    .select('matricula, full_name, contract_type, status, email, user_id')
    .is('deleted_at', null)
    .ilike('contract_type', 'clt')
    .order('full_name');

  if (finalErr) {
    console.error('\nErro na conferência final:', finalErr.message);
    process.exit(1);
  }

  console.log('\n── Conferência CLT (pós-vínculo) ──');
  for (const e of final || []) {
    const flag = e.user_id ? '✓' : '✗';
    console.log(`${flag} ${e.matricula} | ${e.full_name} | ${e.status} | user_id=${e.user_id || '—'}`);
  }

  const beatriz = (final || []).filter((e) =>
    normalizeName(e.full_name).includes('beatriz')
  );
  if (beatriz.length) {
    console.log('\n── Beatriz (validação) ──');
    for (const b of beatriz) {
      const ok = !!b.user_id;
      console.log(
        ok
          ? `OK: ${b.full_name} vinculada (user_id=${b.user_id})`
          : `PENDENTE: ${b.full_name} ainda sem user_id — vincule manualmente no RH`
      );
    }
  }

  const { error: tcErr } = await sb.from('time_clock').select('id').limit(1);
  console.log(
    '\n── Tabela time_clock ──',
    tcErr ? `ERRO: ${tcErr.message} (rode migrations/2026_07_08_timeclock_clt.sql)` : 'OK (acessível)'
  );

  const stillUnlinked = (final || []).filter((e) => !e.user_id).length;
  process.exit(stillUnlinked > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
