import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './supabaseDefaults';

declare global {
  interface Window {
    __TMSEG_SUPABASE__?: { url?: string; anonKey?: string };
  }
}

function clean(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url);
}

function pickUrl(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (isValidHttpUrl(value)) return value;
  }
  return DEFAULT_SUPABASE_URL;
}

function pickAnonKey(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value) return value;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

/** Resolve URL/anon do Supabase no browser (build Vercel, .env local ou defaults). */
export function resolveSupabasePublicConfig(): { url: string; anonKey: string } {
  const injected = typeof window !== 'undefined' ? window.__TMSEG_SUPABASE__ : undefined;
  const env = import.meta.env as Record<string, string | undefined>;

  const url = pickUrl(
    injected?.url,
    env.VITE_SUPABASE_URL,
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  const anonKey = pickAnonKey(
    injected?.anonKey,
    env.VITE_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return { url, anonKey };
}
