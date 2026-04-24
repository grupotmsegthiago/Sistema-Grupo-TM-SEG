import { createClient } from '@supabase/supabase-js';

export type NfProvider = 'ASAAS' | 'PLUGNOTAS';

export const VALID_PROVIDERS: NfProvider[] = ['ASAAS', 'PLUGNOTAS'];

const PREF_ENTITY = 'NfProviderPreference';
const PREF_ENTITY_ID = 'master';

let cache: { ts: number; map: Record<string, NfProvider> } | null = null;
const CACHE_TTL_MS = 60_000;

function getSupabase() {
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!sbUrl || !sbKey) return null;
  return createClient(sbUrl, sbKey);
}

function normalize(s?: string | null): string {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizeCompanyKey(company?: string | null): string {
  const u = normalize(company);
  if (!u) return 'TM GESTAO';
  if (u.includes('SECURITY')) return 'TM SECURITY';
  if (u.includes('SEGURANCA') || u.includes('SEGURANÇA')) return 'TM SEGURANCA';
  if (u.includes('GESTAO') || u.includes('GESTÃO') || u.includes('GESTAO LTDA')) return 'TM GESTAO';
  return u;
}

export async function getProviderPreferences(): Promise<Record<string, NfProvider>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.map;
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const { data } = await sb.from('system_logs')
      .select('details')
      .eq('entity', PREF_ENTITY)
      .eq('entity_id', PREF_ENTITY_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (data as any)?.details;
    let parsed: any = raw;
    if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { parsed = {}; } }
    const map: Record<string, NfProvider> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const provider = String(v).toUpperCase() as NfProvider;
        if (VALID_PROVIDERS.includes(provider)) map[normalizeCompanyKey(k)] = provider;
      }
    }
    cache = { ts: Date.now(), map };
    return map;
  } catch (e: any) {
    console.log('[NfProviderRouter] erro ao ler preferências:', e?.message || e);
    return {};
  }
}

export async function setProviderPreferences(prefs: Record<string, NfProvider>, actor?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase indisponível');
  const clean: Record<string, NfProvider> = {};
  for (const [k, v] of Object.entries(prefs)) {
    const provider = String(v).toUpperCase() as NfProvider;
    if (VALID_PROVIDERS.includes(provider)) clean[normalizeCompanyKey(k)] = provider;
  }
  await sb.from('system_logs').delete().eq('entity', PREF_ENTITY).eq('entity_id', PREF_ENTITY_ID);
  await sb.from('system_logs').insert({
    entity: PREF_ENTITY,
    entity_id: PREF_ENTITY_ID,
    action: 'UPDATE',
    actor: actor || 'system',
    details: clean,
  });
  cache = { ts: Date.now(), map: clean };
}

export async function resolveProvider(opts: { invoiceProvider?: string | null; company?: string | null }): Promise<NfProvider> {
  const inv = (opts.invoiceProvider || '').toUpperCase();
  if (inv === 'PLUGNOTAS' || inv === 'ASAAS') return inv;
  const prefs = await getProviderPreferences();
  const key = normalizeCompanyKey(opts.company);
  const pref = prefs[key];
  if (pref === 'PLUGNOTAS') {
    const { isPlugNotasConfigured } = await import('./plugnotasService');
    if (isPlugNotasConfigured()) return 'PLUGNOTAS';
    return 'ASAAS';
  }
  return 'ASAAS';
}

export function clearProviderPreferencesCache() {
  cache = null;
}
