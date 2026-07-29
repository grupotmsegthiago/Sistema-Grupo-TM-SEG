import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL, TMSEG_SUPABASE_PROJECT_REF } from './supabaseDefaults.js';
import {
  cleanEnv,
  decodeJwtProjectRef,
  extractSupabaseProjectRef,
  isTmSegSupabaseAnonKey,
  isTmSegSupabaseUrl,
  isValidHttpUrl,
  resolveSupabasePublicEnv,
} from './supabasePublicEnv.js';

let warnedMissingServiceRole = false;
let warnedAnonKeyAsService = false;
let warnedAnonFallback = false;
let warnedForeignProject = false;

function warnForeignProjectOnce(): void {
  if (warnedForeignProject) return;
  warnedForeignProject = true;
  console.warn(
    '[Supabase] Variaveis de outro projeto ignoradas — usando projeto TM SEG (ajhmmjuewdsukecaimik). ' +
      'Remova na Vercel envs de integracao Supabase incorretas ou alinhe SUPABASE_URL/VITE_SUPABASE_URL.',
  );
}

function pickServerUrl(): string {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.TMSEG_SUPABASE_URL,
  ];
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) return value;
    if (isValidHttpUrl(value)) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_URL;
}

function pickServerAnonKey(url: string): string {
  const candidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.TMSEG_SUPABASE_ANON_KEY,
  ];
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) return value;
    if (value) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

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

/**
 * Valida se a JWT é service_role do projeto esperado.
 * Importante: o ref do JWT deve ser comparado com o ref da URL
 * (`extractSupabaseProjectRef`), NUNCA com `decodeJwtProjectRef(url)` —
 * URL não é JWT e retorna null, descartando a chave correta.
 *
 * Aceita só JWT LEGACY (`eyJ...` com role=service_role).
 * Chaves novas `sb_secret_...` / `sb_publishable_...` são rejeitadas —
 * o PostgREST deste projeto responde "Invalid API key" com esse formato.
 */
export function isTmSegServiceRoleKey(
  key: string,
  expectedRef: string = TMSEG_SUPABASE_PROJECT_REF,
): { ok: boolean; reason?: 'empty' | 'foreign_project' | 'anon_role' | 'not_jwt' } {
  const cleaned = cleanEnv(key);
  if (!cleaned) return { ok: false, reason: 'empty' };
  // Formato novo do painel Supabase — não usar em SUPABASE_SERVICE_ROLE_KEY neste sistema
  if (cleaned.startsWith('sb_')) return { ok: false, reason: 'not_jwt' };
  const ref = decodeJwtProjectRef(cleaned);
  const role = decodeJwtRole(cleaned);
  if (!ref || !role) return { ok: false, reason: 'not_jwt' };
  if (ref !== expectedRef) return { ok: false, reason: 'foreign_project' };
  if (role !== 'service_role') return { ok: false, reason: 'anon_role' };
  return { ok: true };
}

/** URL do projeto Supabase TM SEG (servidor). */
export function getSupabaseUrl(): string {
  return pickServerUrl();
}

/** Chave anon (leituras com RLS). */
export function getSupabaseAnonKey(): string {
  return pickServerAnonKey(getSupabaseUrl());
}

/**
 * Chave service_role para operações admin no servidor.
 * Prioridade: SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SERVICE_KEY (legado Replit).
 */
export function getSupabaseServiceRoleKey(): string {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  ];

  // Aceita só service_role do projeto TM SEG. Bug anterior: comparar ref do JWT
  // com decodeJwtProjectRef(url) descartava a chave correta → fallback ANON →
  // RLS bloqueava leitura de clients.whatsapp_group_id no envio aos grupos.
  const expectedRef = extractSupabaseProjectRef(getSupabaseUrl()) || TMSEG_SUPABASE_PROJECT_REF;

  for (const candidate of candidates) {
    const key = cleanEnv(candidate);
    if (!key) continue;
    const check = isTmSegServiceRoleKey(key, expectedRef);
    if (!check.ok) {
      if (check.reason === 'foreign_project') warnForeignProjectOnce();
      if (check.reason === 'anon_role' && !warnedAnonKeyAsService) {
        warnedAnonKeyAsService = true;
        console.error(
          '[Supabase] SUPABASE_SERVICE_KEY contém a chave ANON, não service_role. ' +
            'Substitua pelo valor "service_role" LEGACY (eyJ...) no .env (Settings → API no Supabase).',
        );
      }
      if (check.reason === 'not_jwt' && !warnedAnonKeyAsService) {
        warnedAnonKeyAsService = true;
        console.error(
          '[Supabase] SUPABASE_SERVICE_ROLE_KEY não é JWT service_role LEGACY. ' +
            'Use a chave "service_role (LEGACY)" (eyJ...), não sb_secret_/sb_publishable_.',
        );
      }
      continue;
    }
    return key;
  }

  if (!warnedMissingServiceRole) {
    warnedMissingServiceRole = true;
    console.warn(
      '[Supabase] SUPABASE_SERVICE_ROLE_KEY não definida para o projeto TM SEG. ' +
        'Copie a chave "service_role" em Supabase → Settings → API e adicione na Vercel.',
    );
  }
  return '';
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

/** Cliente Supabase admin — seguro para rotas serverless Vercel (módulo em lib/). */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseServerKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Mesma resolucao do frontend — util em scripts/build. */
export function resolveServerSupabaseFromProcessEnv(): { url: string; anonKey: string } {
  return resolveSupabasePublicEnv(process.env as Record<string, string | undefined>);
}
