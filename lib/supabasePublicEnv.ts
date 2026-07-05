import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  TMSEG_SUPABASE_PROJECT_REF,
} from './supabaseDefaults';

export function cleanEnv(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

export function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url);
}

export function extractSupabaseProjectRef(url: string): string | null {
  const match = cleanEnv(url).match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function decodeJwtProjectRef(key: string): string | null {
  try {
    const part = cleanEnv(key).split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { ref?: string };
    return payload.ref?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function isTmSegSupabaseUrl(url: string): boolean {
  return extractSupabaseProjectRef(url) === TMSEG_SUPABASE_PROJECT_REF;
}

export function isTmSegSupabaseAnonKey(key: string, expectedUrl?: string): boolean {
  const cleaned = cleanEnv(key);
  if (!cleaned) return false;
  const keyRef = decodeJwtProjectRef(cleaned);
  if (keyRef && keyRef !== TMSEG_SUPABASE_PROJECT_REF) return false;
  if (expectedUrl) {
    const urlRef = extractSupabaseProjectRef(expectedUrl);
    if (urlRef && keyRef && urlRef !== keyRef) return false;
  }
  return true;
}

/** Resolve URL/anon do projeto TM SEG — ignora env de outro projeto (ex.: integracao Vercel errada). */
export function resolveSupabasePublicEnv(
  env: Record<string, string | undefined>,
): { url: string; anonKey: string } {
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  ];

  let url = DEFAULT_SUPABASE_URL;
  for (const candidate of urlCandidates) {
    const value = cleanEnv(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) {
      url = value;
      break;
    }
  }

  const keyCandidates = [
    env.VITE_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ];

  let anonKey = DEFAULT_SUPABASE_ANON_KEY;
  for (const candidate of keyCandidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) {
      anonKey = value;
      break;
    }
  }

  return { url, anonKey };
}
