import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './supabaseDefaults';
import {
  cleanEnv,
  isTmSegSupabaseAnonKey,
  isTmSegSupabaseUrl,
  isValidHttpUrl,
} from './supabasePublicEnv';

declare global {
  interface Window {
    __TMSEG_SUPABASE__?: { url?: string; anonKey?: string };
  }
}

function pickUrl(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) return value;
  }
  return DEFAULT_SUPABASE_URL;
}

function pickAnonKey(url: string, ...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) return value;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

/** Resolve URL/anon do Supabase no browser (build Vercel, .env local ou defaults TM SEG). */
export function resolveSupabasePublicConfig(): { url: string; anonKey: string } {
  const injected = typeof window !== 'undefined' ? window.__TMSEG_SUPABASE__ : undefined;
  const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

  const url = pickUrl(
    injected?.url,
    env.VITE_SUPABASE_URL,
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  const anonKey = pickAnonKey(
    url,
    injected?.anonKey,
    env.VITE_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return { url, anonKey };
}
