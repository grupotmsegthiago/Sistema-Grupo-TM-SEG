import { getDhlIntakeSupabase } from '../dhl-intake/dhlIntakeSupabase.js';

const ALERT_RECIPIENTS_DEFAULTS = {
  operationalFallback: 'operacional@grupotmseg.com.br',
};

export async function getSupabaseAdmin() {
  return getDhlIntakeSupabase();
}

export async function findClientEmail(sb: any, clientName: string): Promise<{ email: string; data: any }> {
  const { data: byName } = await sb.from('clients').select('operational_email, email, trading_name, name, status').eq('name', clientName);
  let clientData = byName?.find((c: any) => c.status === 'Ativo') || byName?.[0] || null;
  if (!clientData) {
    const { data: byTrading } = await sb.from('clients').select('operational_email, email, trading_name, name, status').eq('trading_name', clientName);
    clientData = byTrading?.find((c: any) => c.status === 'Ativo') || byTrading?.[0] || null;
  }
  if (!clientData) {
    const { data: byIlike } = await sb.from('clients').select('operational_email, email, trading_name, name, status').ilike('trading_name', clientName);
    clientData = byIlike?.find((c: any) => c.status === 'Ativo') || byIlike?.[0] || null;
  }
  const email = clientData?.operational_email?.trim() || clientData?.email?.trim() || '';
  return { email, data: clientData };
}

export async function findProviderEmail(sb: any, providerName: string): Promise<{ email: string; data: any }> {
  const cols = 'dhl_solicitation_email, os_email, email, trading_name, name, status';
  const { data: byName } = await sb.from('providers').select(cols).eq('name', providerName);
  let provData = byName?.find((p: any) => p.status === 'Ativo') || byName?.[0] || null;
  if (!provData) {
    const { data: byTrading } = await sb.from('providers').select(cols).eq('trading_name', providerName);
    provData = byTrading?.find((p: any) => p.status === 'Ativo') || byTrading?.[0] || null;
  }
  if (!provData) {
    const { data: byIlike } = await sb.from('providers').select(cols).ilike('trading_name', providerName);
    provData = byIlike?.find((p: any) => p.status === 'Ativo') || byIlike?.[0] || null;
  }
  const email = provData?.dhl_solicitation_email?.trim() || provData?.os_email?.trim() || provData?.email?.trim() || '';
  return { email, data: provData };
}

export async function loadOperationalFallback(sb: any): Promise<string> {
  try {
    const { data } = await sb.from('system_settings').select('value').eq('key', 'alert_recipients').maybeSingle();
    if (data?.value) {
      const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (raw?.operationalFallback?.trim()) return raw.operationalFallback.trim();
    }
  } catch { /* fallback */ }
  return ALERT_RECIPIENTS_DEFAULTS.operationalFallback;
}

export function parseJsonBody(body: unknown): Record<string, any> {
  if (typeof body !== 'string') return (body as Record<string, any>) || {};
  if (!body.trim()) return {};
  return JSON.parse(body);
}

export function authToken(req: any): string {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers?.['x-auth-token'] || '');
}
