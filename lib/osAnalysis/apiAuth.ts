/**
 * Auth leve para /api/os-analysis (handler serverless — evita Express).
 * Diretoria / Thiagos (canRequestOsAnalysis).
 *
 * IMPORTANTE: usa o mesmo cliente admin do restante do sistema
 * (`createSupabaseAdminClient` / `getSupabaseServiceRoleKey`).
 * O picker antigo aceitava qualquer string (sb_secret, JWT de outro projeto)
 * e gerava "Invalid API key", enquanto RH/Billing/DHL ignoravam a chave
 * inválida e caiam na anon hardcoded — por isso só o Pedir Análise quebrava.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canRequestOsAnalysis } from '../osAnalysisAccess.js';
import {
  createSupabaseAdminClient,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isTmSegServiceRoleKey,
} from '../supabaseAdmin.js';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  TMSEG_SUPABASE_PROJECT_REF,
} from '../supabaseDefaults.js';
import { decodeJwtProjectRef } from '../supabasePublicEnv.js';

type ReqHeaders = Record<string, string | string[] | undefined>;

export type OsAnalysisPrincipal = {
  id: string;
  name: string;
  role: string;
  email: string | null;
};

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

function cleanEnv(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function headerValue(req: { headers?: ReqHeaders } | undefined, name: string): string {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export function extractAuthToken(req: { headers?: ReqHeaders }): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  const fromHeader = String(raw || '').replace(/^Bearer\s+/i, '').trim();
  if (fromHeader) return fromHeader;
  return headerValue(req, 'x-auth-token');
}

function normalizeRole(role: string): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRawServiceRoleCandidate(): string {
  for (const candidate of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const key = cleanEnv(candidate);
    if (key) return key;
  }
  return '';
}

function decodeJwtRoleSafe(key: string): string | null {
  try {
    const part = key.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/** Meta segura da chave (sem expor o segredo) — para op=diag. */
export function describeOsAnalysisSupabaseConfig(): {
  url: string;
  projectRef: string;
  hasServiceRole: boolean;
  rawKeyConfigured: boolean;
  rawKeyLength: number;
  rawKeyPrefix: string;
  jwtRole: string | null;
  jwtRef: string | null;
  validation: ReturnType<typeof isTmSegServiceRoleKey>;
  hintPt: string;
} {
  const url = getSupabaseUrl() || DEFAULT_SUPABASE_URL;
  const raw = pickRawServiceRoleCandidate();
  const validation = isTmSegServiceRoleKey(raw || '', TMSEG_SUPABASE_PROJECT_REF);
  const hasServiceRole = Boolean(getSupabaseServiceRoleKey());
  let hintPt =
    'OK — service_role LEGACY do projeto TM SEG configurada.';
  if (!raw) {
    hintPt =
      'Falta SUPABASE_SERVICE_ROLE_KEY na Vercel. Cole a service_role LEGACY (eyJ...) do projeto ajhmmjuewdsukecaimik e faça Redeploy.';
  } else if (validation.reason === 'not_jwt') {
    hintPt =
      'A chave não é JWT LEGACY. No Supabase use "service_role (LEGACY)" (eyJ...), não sb_secret_ / sb_publishable_. Depois Redeploy.';
  } else if (validation.reason === 'foreign_project') {
    hintPt =
      `A chave é de outro projeto (ref=${decodeJwtProjectRef(raw) || '?'}). Use a do Grupo TMSEG (ajhmmjuewdsukecaimik). Depois Redeploy.`;
  } else if (validation.reason === 'anon_role') {
    hintPt =
      'Foi colada a chave anon (ou sem role service_role). Copie a service_role LEGACY. Depois Redeploy.';
  } else if (!hasServiceRole) {
    hintPt =
      'Chave presente mas rejeitada. Confira service_role LEGACY do projeto ajhmmjuewdsukecaimik + Redeploy.';
  }

  return {
    url,
    projectRef: TMSEG_SUPABASE_PROJECT_REF,
    hasServiceRole,
    rawKeyConfigured: Boolean(raw),
    rawKeyLength: raw.length,
    rawKeyPrefix: raw ? `${raw.slice(0, 6)}…` : '',
    jwtRole: raw ? decodeJwtRoleSafe(raw) : null,
    jwtRef: raw ? decodeJwtProjectRef(raw) : null,
    validation,
    hintPt,
  };
}

/**
 * Cliente admin alinhado ao restante do sistema (valida JWT + fallback anon).
 * Nunca passa chave inválida ao Supabase (evita "Invalid API key").
 */
export function adminSupabase(): SupabaseClient | null {
  return createSupabaseAdminClient();
}

/** Exige service_role válida do TM SEG — obrigatória para gravar pedidos de análise. */
export function requireOsAnalysisAdmin(): SupabaseClient {
  const key = getSupabaseServiceRoleKey();
  if (!key) {
    const diag = describeOsAnalysisSupabaseConfig();
    throw new Error(diag.hintPt);
  }
  return createClient(getSupabaseUrl() || DEFAULT_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ProfileRow = { name?: string; permissions?: string[] };

function readProfile(data: { profiles?: ProfileRow | ProfileRow[] | null }): ProfileRow | null {
  const raw = data.profiles;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

/** Resolve usuário autenticado; null se token inválido. */
export async function resolveOsAnalysisPrincipal(
  token: string,
  req?: { headers?: ReqHeaders },
): Promise<OsAnalysisPrincipal | null> {
  if (!token) return null;
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const sb = adminSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('system_users')
        .select('id, name, email, status, permissions, profiles:profile_id ( name, permissions )')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data && data.status === 'Ativo') {
        const profile = readProfile(data as { profiles?: ProfileRow | ProfileRow[] | null });
        return {
          id: String(data.id),
          name: String(data.name || 'Sistema'),
          role: normalizeRole(profile?.name || ''),
          email: data.email ? String(data.email) : null,
        };
      }
    } catch {
      // fallback headers abaixo
    }
  }

  const headerUserId = headerValue(req, 'x-tmseg-user-id');
  if (!headerUserId || headerUserId !== userId) return null;
  return {
    id: userId,
    name: headerValue(req, 'x-tmseg-user-name') || 'Sistema',
    role: normalizeRole(headerValue(req, 'x-tmseg-role')),
    email: headerValue(req, 'x-tmseg-email') || null,
  };
}

export function principalCanRequestAnalysis(principal: OsAnalysisPrincipal): boolean {
  return canRequestOsAnalysis({
    name: principal.name,
    role: principal.role,
  });
}

/** Exposto para testes / fallback anon (somente leitura se RLS permitir). */
export function anonSupabaseFallback(): SupabaseClient {
  return createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
}
