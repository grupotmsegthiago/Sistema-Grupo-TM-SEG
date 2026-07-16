import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TIMECLOCK_FIX_USER_ID_SQL } from './timeclockFixSql.js';

const DEFAULT_URL = 'https://ajhmmjuewdsukecaimik.supabase.co';
const TMSEG_REF = 'ajhmmjuewdsukecaimik';
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

export type CltLinkRow = {
  matricula: string | null;
  full_name: string;
  status: string;
  user_id: string | null;
  login_name: string | null;
  login_email: string | null;
};

export type EnsureTimeClockResult = {
  method: 'pg' | 'exec_sql' | 'unavailable';
  schemaApplied: boolean;
  linkedByEmail: number;
  linkedByName: number;
  cltRows: CltLinkRow[];
  beatrizLinked: boolean;
};

let pool: pg.Pool | null = null;

function decodeRef(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.ref || null;
  } catch {
    return null;
  }
}

function getPool(): pg.Pool | null {
  const connectionString = String(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.SUPABASE_DB_URL ||
      '',
  ).trim();
  if (!connectionString) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 2 });
  }
  return pool;
}

function adminSupabase(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL);
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (serviceKey && decodeRef(serviceKey) === TMSEG_REF) {
    return createClient(url, serviceKey);
  }
  return createClient(url, DEFAULT_ANON);
}

function readSql(filename: string): string {
  if (filename === '2026_07_08_timeclock_fix_user_id.sql') {
    return TIMECLOCK_FIX_USER_ID_SQL;
  }
  const candidates = [
    path.join(process.cwd(), 'migrations', filename),
    path.join(process.cwd(), '..', 'migrations', filename),
    path.join('/var/task', 'migrations', filename),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch {
      /* tenta próximo caminho */
    }
  }
  throw new Error(`Migration não encontrada: ${filename}`);
}

const LINK_BY_EMAIL_SQL = `
UPDATE rh_employees e
SET
  user_id = u.id::TEXT,
  email = COALESCE(NULLIF(TRIM(e.email), ''), u.email),
  updated_at = now()
FROM system_users u
WHERE e.deleted_at IS NULL
  AND e.user_id IS NULL
  AND UPPER(TRIM(COALESCE(e.contract_type, ''))) = 'CLT'
  AND e.status IN ('Ativo', 'Experiência')
  AND u.status = 'Ativo'
  AND LOWER(TRIM(COALESCE(e.email, ''))) = LOWER(TRIM(u.email))
  AND TRIM(COALESCE(u.email, '')) <> '';
`;

const LINK_BY_NAME_SQL = `
UPDATE rh_employees e
SET
  user_id = u.id::TEXT,
  email = COALESCE(NULLIF(TRIM(e.email), ''), u.email),
  updated_at = now()
FROM system_users u
WHERE e.deleted_at IS NULL
  AND e.user_id IS NULL
  AND UPPER(TRIM(COALESCE(e.contract_type, ''))) = 'CLT'
  AND e.status IN ('Ativo', 'Experiência')
  AND u.status = 'Ativo'
  AND (
    LOWER(TRIM(e.full_name)) = LOWER(TRIM(u.name))
    OR LOWER(e.full_name) LIKE '%' || LOWER(TRIM(u.name)) || '%'
    OR LOWER(TRIM(u.name)) LIKE '%' || LOWER(SPLIT_PART(e.full_name, ' ', 1)) || '%'
  );
`;

const NIGHT_SHIFT_OPERATORS_SQL = `
UPDATE rh_employees
SET
  shift_type = 'noturno',
  requires_timeclock = true,
  updated_at = now()
WHERE deleted_at IS NULL
  AND COALESCE(status, 'Ativo') IN ('Ativo', 'Experiência')
  AND full_name NOT ILIKE '%michelle%'
  AND (
    full_name ILIKE '%moacir%'
    OR full_name ILIKE '%cristiane aurora%'
    OR full_name ILIKE '%aurora da silva%'
    OR full_name ~* '^cris[\\s\\.]'
    OR full_name ~* '\\scris[\\s\\.]'
  );
`;

async function runViaExecSql(sql: string): Promise<void> {
  const sb = adminSupabase();
  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) throw error;
}

async function fetchCltConference(sb: SupabaseClient): Promise<CltLinkRow[]> {
  const { data: employees, error: empErr } = await sb
    .from('rh_employees')
    .select('matricula, full_name, status, user_id')
    .is('deleted_at', null)
    .ilike('contract_type', 'clt')
    .order('full_name');

  if (empErr) throw empErr;

  const { data: users, error: usrErr } = await sb
    .from('system_users')
    .select('id, name, email');

  if (usrErr) throw usrErr;

  const userById = new Map(
    (users || []).map((u) => [String(u.id), { name: u.name as string, email: u.email as string }]),
  );

  return (employees || []).map((e) => {
    const login = e.user_id ? userById.get(String(e.user_id)) : null;
    return {
      matricula: e.matricula,
      full_name: e.full_name,
      status: e.status,
      user_id: e.user_id ? String(e.user_id) : null,
      login_name: login?.name ?? null,
      login_email: login?.email ?? null,
    };
  });
}

function buildResult(
  method: EnsureTimeClockResult['method'],
  schemaApplied: boolean,
  linkedByEmail: number,
  linkedByName: number,
  cltRows: CltLinkRow[],
): EnsureTimeClockResult {
  const beatrizLinked = cltRows.some(
    (r) =>
      !!r.user_id &&
      String(r.full_name || '')
        .toLowerCase()
        .includes('beatriz'),
  );
  return {
    method,
    schemaApplied,
    linkedByEmail,
    linkedByName,
    cltRows,
    beatrizLinked,
  };
}

/** Aplica DDL (user_id TEXT + time_clock) e vincula CLTs aos logins. */
export async function ensureTimeClockAndLinkCltUsers(): Promise<EnsureTimeClockResult> {
  const schemaSql = readSql('2026_07_08_timeclock_fix_user_id.sql');
  const sb = adminSupabase();

  const p = getPool();
  if (p) {
    try {
      await p.query(schemaSql);
      const emailRes = await p.query(LINK_BY_EMAIL_SQL);
      const nameRes = await p.query(LINK_BY_NAME_SQL);
      await p.query(NIGHT_SHIFT_OPERATORS_SQL);
      const { rows } = await p.query<CltLinkRow>(`
        SELECT e.matricula, e.full_name, e.status, e.user_id, u.name AS login_name, u.email AS login_email
        FROM rh_employees e
        LEFT JOIN system_users u ON u.id::TEXT = e.user_id
        WHERE UPPER(COALESCE(e.contract_type, '')) = 'CLT' AND e.deleted_at IS NULL
        ORDER BY e.full_name
      `);
      return buildResult('pg', true, emailRes.rowCount ?? 0, nameRes.rowCount ?? 0, rows);
    } catch (e) {
      console.warn('[ensureTimeClock] pg falhou, tentando exec_sql:', (e as Error).message);
    }
  }

  try {
    const before = await fetchCltConference(sb);
    const unlinkedBefore = before.filter((r) => !r.user_id).length;

    await runViaExecSql(schemaSql);
    await runViaExecSql(LINK_BY_EMAIL_SQL);
    await runViaExecSql(LINK_BY_NAME_SQL);
    await runViaExecSql(NIGHT_SHIFT_OPERATORS_SQL);

    const after = await fetchCltConference(sb);
    const unlinkedAfter = after.filter((r) => !r.user_id).length;
    const linked = Math.max(0, unlinkedBefore - unlinkedAfter);

    return buildResult('exec_sql', true, linked, 0, after);
  } catch (e: any) {
    console.error('[ensureTimeClock] exec_sql falhou:', e?.message);
    return buildResult('unavailable', false, 0, 0, []);
  }
}
