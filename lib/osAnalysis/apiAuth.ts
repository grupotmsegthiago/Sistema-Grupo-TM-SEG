/**
 * Auth leve para /api/os-analysis (handler serverless — evita Express).
 * Diretoria / Thiagos (canRequestOsAnalysis).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canRequestOsAnalysis } from '../osAnalysisAccess.js';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  TMSEG_SUPABASE_PROJECT_REF,
} from '../supabaseDefaults.js';

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

function pickServiceRoleKey(): string {
  for (const candidate of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const key = cleanEnv(candidate);
    if (key && !key.includes('anon')) return key;
  }
  return '';
}

export function adminSupabase(): SupabaseClient | null {
  const key = pickServiceRoleKey();
  if (!key) return null;
  const envUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const url = envUrl.includes(TMSEG_SUPABASE_PROJECT_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  return createClient(url || DEFAULT_SUPABASE_URL, key);
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
    const { data } = await sb
      .from('system_users')
      .select('id, name, email, status, permissions, profiles:profile_id ( name, permissions )')
      .eq('id', userId)
      .maybeSingle();
    if (data && data.status === 'Ativo') {
      const profile = readProfile(data as { profiles?: ProfileRow | ProfileRow[] | null });
      return {
        id: String(data.id),
        name: String(data.name || 'Sistema'),
        role: normalizeRole(profile?.name || ''),
        email: data.email ? String(data.email) : null,
      };
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
