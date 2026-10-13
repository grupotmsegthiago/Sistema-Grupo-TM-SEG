/**
 * Cliente do Supabase TORRES (projeto separado).
 * A chave fica só no servidor. Aceita a secret atual (sb_secret_) e a service_role antiga (eyJ)
 * do projeto erjhxwbutjyylxdthuuz. Sem chave válida, o quadro usa o ingest já gravado na TM SEG.
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

export type MotivoChaveTorres =
  | 'ok'
  | 'ausente'
  | 'publishable'
  | 'projeto_tmseg'
  | 'nao_service_role'
  | 'formato';

const TMSEG_PROJECT_REF = 'ajhmmjuewdsukecaimik';

/** Secret atual do painel (sb_secret_...). Publishable não serve no servidor. */
export function isTorresSecretKey(key: string): boolean {
  const cleaned = cleanEnv(key);
  return cleaned.startsWith('sb_secret_') && cleaned.length >= 30 && !/\s/.test(cleaned);
}

export function isTorresServiceRoleKey(key: string): boolean {
  const cleaned = cleanEnv(key);
  if (!cleaned) return false;
  if (isTorresSecretKey(cleaned)) return true;
  if (cleaned.startsWith('sb_')) return false;
  const ref = decodeJwtProjectRef(cleaned);
  const role = decodeJwtRole(cleaned);
  return ref === TORRES_SUPABASE_PROJECT_REF && role === 'service_role';
}

export function motivoChaveTorres(key: string): MotivoChaveTorres {
  const cleaned = cleanEnv(key);
  if (!cleaned) return 'ausente';
  if (isTorresServiceRoleKey(cleaned)) return 'ok';
  if (cleaned.startsWith('sb_publishable_') || cleaned.startsWith('sb_')) return 'publishable';
  const ref = decodeJwtProjectRef(cleaned);
  const role = decodeJwtRole(cleaned);
  if (ref === TMSEG_PROJECT_REF) return 'projeto_tmseg';
  if (ref === TORRES_SUPABASE_PROJECT_REF && role && role !== 'service_role') return 'nao_service_role';
  return 'formato';
}

const NOMES_CHAVE_TORRES = [
  'TORRES_SUPABASE_SERVICE_ROLE_KEY',
  'TORRES_SUPABASE_SERVICE_KEY',
  'TORRES_SUPABASE_KEY',
] as const;

export function mensagemChaveTorresRecusada(
  env: Record<string, string | undefined> = process.env,
): string {
  let motivo: MotivoChaveTorres = 'ausente';
  for (const nome of NOMES_CHAVE_TORRES) {
    const valor = env[nome];
    if (!cleanEnv(valor)) continue;
    motivo = motivoChaveTorres(valor || '');
    if (motivo === 'ok') return '';
  }
  if (motivo === 'ausente') {
    return 'A chave da TORRES não está no servidor que respondeu. O nome esperado é TORRES_SUPABASE_SERVICE_ROLE_KEY.';
  }
  if (motivo === 'publishable') {
    return 'A chave da TORRES está no formato publishable. No servidor use a secret (sb_secret_) ou a service_role antiga (eyJ) do projeto da TORRES.';
  }
  if (motivo === 'projeto_tmseg') return 'A chave salva é do projeto da TM SEG. A TORRES usa a chave do projeto dela.';
  if (motivo === 'nao_service_role') return 'A chave salva não é service_role da TORRES.';
  return 'A chave da TORRES não foi aceita. Use a secret atual (sb_secret_) ou a service_role antiga (eyJ) do projeto da TORRES.';
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
