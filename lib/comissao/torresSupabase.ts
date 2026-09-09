/**
 * Cliente de leitura do Supabase TORRES (projeto separado).
 * Sem TORRES_SUPABASE_SERVICE_ROLE_KEY o quadro usa só o ingest já gravado na TM SEG.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  cleanEnv,
  decodeJwtProjectRef,
  extractSupabaseProjectRef,
  isValidHttpUrl,
  normalizeSupabaseProjectUrl,
} from '../supabasePublicEnv.js';

export const TORRES_SUPABASE_PROJECT_REF = 'erjhxwbutjyylxdthuuz';
export const DEFAULT_TORRES_SUPABASE_URL = `https://${TORRES_SUPABASE_PROJECT_REF}.supabase.co`;

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

export function isTorresServiceRoleKey(key: string): boolean {
  const cleaned = cleanEnv(key);
  if (!cleaned || cleaned.startsWith('sb_')) return false;
  const ref = decodeJwtProjectRef(cleaned);
  const role = decodeJwtRole(cleaned);
  return ref === TORRES_SUPABASE_PROJECT_REF && role === 'service_role';
}

export function resolveTorresSupabaseUrl(): string {
  const candidates = [
    process.env.TORRES_SUPABASE_URL,
    process.env.TORRES_SUPABASE_PROJECT_URL,
  ];
  for (const candidate of candidates) {
    const value = normalizeSupabaseProjectUrl(candidate as string);
    if (isValidHttpUrl(value) && extractSupabaseProjectRef(value) === TORRES_SUPABASE_PROJECT_REF) {
      return value;
    }
  }
  return DEFAULT_TORRES_SUPABASE_URL;
}

export function resolveTorresServiceRoleKey(): string {
  const candidates = [
    process.env.TORRES_SUPABASE_SERVICE_ROLE_KEY,
    process.env.TORRES_SUPABASE_SERVICE_KEY,
    process.env.TORRES_SUPABASE_KEY,
  ];
  for (const candidate of candidates) {
    const key = cleanEnv(candidate);
    if (isTorresServiceRoleKey(key)) return key;
  }
  return '';
}

/** service_role da TORRES, se existir no ambiente. Não usa a chave da TM SEG. */
export function createTorresAdminClient(): SupabaseClient | null {
  const url = resolveTorresSupabaseUrl();
  const key = resolveTorresServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key);
}
