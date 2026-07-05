import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let warnedMissingServiceRole = false;
let warnedAnonKeyAsService = false;
let warnedAnonFallback = false;

function decodeJwtRole(key: string): string | null {
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

/** URL do projeto Supabase (servidor). */
export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

/** Chave anon (leituras com RLS). */
export function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

/**
 * Chave service_role para operações admin no servidor.
 * Prioridade: SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SERVICE_KEY (legado Replit).
 * Não usa anon — se faltar, retorna '' e registra aviso.
 */
export function getSupabaseServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  if (!key) {
    if (!warnedMissingServiceRole) {
      warnedMissingServiceRole = true;
      console.warn(
        '[Supabase] SUPABASE_SERVICE_ROLE_KEY não definida. ' +
          'Copie a chave "service_role" em Supabase → Settings → API e adicione ao .env.'
      );
    }
    return '';
  }

  if (decodeJwtRole(key) === 'anon' && !warnedAnonKeyAsService) {
    warnedAnonKeyAsService = true;
    console.error(
      '[Supabase] SUPABASE_SERVICE_KEY contém a chave ANON, não service_role. ' +
        'Substitua pelo valor "service_role" no .env (Settings → API no Supabase).'
    );
  }

  return key;
}

/** service_role se existir; senão anon (modo degradado, com aviso). */
export function getSupabaseServerKey(): string {
  const service = getSupabaseServiceRoleKey();
  if (service) return service;

  const anon = getSupabaseAnonKey();
  if (anon && !warnedAnonFallback) {
    warnedAnonFallback = true;
    console.warn('[Supabase] Servidor operando com chave ANON — algumas rotas podem falhar por RLS.');
  }
  return anon;
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseServerKey();
  if (!url || !key) return null;
  return createClient(url, key);
}
