import fs from 'fs';
import path from 'path';
import pg from 'pg';

export type CltLinkRow = {
  matricula: string | null;
  full_name: string;
  status: string;
  user_id: string | null;
  login_name: string | null;
  login_email: string | null;
};

export type EnsureTimeClockResult = {
  method: 'pg' | 'unavailable';
  schemaApplied: boolean;
  linkedByEmail: number;
  linkedByName: number;
  cltRows: CltLinkRow[];
  beatrizLinked: boolean;
};

let pool: pg.Pool | null = null;

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

function readSql(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'migrations', filename), 'utf8');
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

const CONFERENCE_SQL = `
SELECT
  e.matricula,
  e.full_name,
  e.status,
  e.user_id,
  u.name AS login_name,
  u.email AS login_email
FROM rh_employees e
LEFT JOIN system_users u ON u.id::TEXT = e.user_id
WHERE UPPER(COALESCE(e.contract_type, '')) = 'CLT'
  AND e.deleted_at IS NULL
ORDER BY e.full_name;
`;

/** Aplica DDL (user_id TEXT + time_clock) e vincula CLTs aos logins. */
export async function ensureTimeClockAndLinkCltUsers(): Promise<EnsureTimeClockResult> {
  const p = getPool();
  if (!p) {
    return {
      method: 'unavailable',
      schemaApplied: false,
      linkedByEmail: 0,
      linkedByName: 0,
      cltRows: [],
      beatrizLinked: false,
    };
  }

  const schemaSql = readSql('2026_07_08_timeclock_fix_user_id.sql');
  await p.query(schemaSql);

  const emailRes = await p.query(LINK_BY_EMAIL_SQL);
  const nameRes = await p.query(LINK_BY_NAME_SQL);
  const { rows } = await p.query<CltLinkRow>(CONFERENCE_SQL);

  const beatrizLinked = rows.some(
    (r) =>
      !!r.user_id &&
      String(r.full_name || '')
        .toLowerCase()
        .includes('beatriz'),
  );

  return {
    method: 'pg',
    schemaApplied: true,
    linkedByEmail: emailRes.rowCount ?? 0,
    linkedByName: nameRes.rowCount ?? 0,
    cltRows: rows,
    beatrizLinked,
  };
}
