import { supabase } from '../../supabase';
import type { GcSettingsMap } from './types';

export const GC_DEFAULT_SETTINGS: GcSettingsMap = {
  tax_rate_pct: 15,
  min_margin_pct: 20,
  days_without_contact: 15,
  days_followup_overdue: 1,
  days_supervisor_alert: 3,
  days_diretoria_alert: 7,
  days_without_revenue: 30,
  pipeline_probabilities: {
    lead: 10,
    contato: 20,
    qualificacao: 30,
    reuniao: 40,
    proposta: 70,
    negociacao: 85,
    contrato: 95,
    cliente_ativo: 100,
  },
  default_monthly_goal: 700_000,
  alert_emails_diretoria: ['thiago@grupotmseg.com.br'],
};

function parseSettingValue(key: keyof GcSettingsMap, raw: unknown): unknown {
  if (raw == null) return GC_DEFAULT_SETTINGS[key];
  const v = typeof raw === 'object' && raw !== null && 'value' in (raw as object)
    ? (raw as { value: unknown }).value
    : raw;

  if (key === 'pipeline_probabilities') {
    if (typeof v === 'string') {
      try { return { ...GC_DEFAULT_SETTINGS.pipeline_probabilities, ...JSON.parse(v) }; } catch { return GC_DEFAULT_SETTINGS.pipeline_probabilities; }
    }
    return { ...GC_DEFAULT_SETTINGS.pipeline_probabilities, ...(v as object) };
  }
  if (key === 'alert_emails_diretoria') {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return GC_DEFAULT_SETTINGS.alert_emails_diretoria; }
    }
    return Array.isArray(v) ? v : GC_DEFAULT_SETTINGS.alert_emails_diretoria;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : GC_DEFAULT_SETTINGS[key];
}

export async function loadGcSettings(): Promise<GcSettingsMap> {
  const result = { ...GC_DEFAULT_SETTINGS };
  try {
    const { data, error } = await supabase
      .from('gestor_settings')
      .select('setting_key, setting_value')
      .eq('gestor_key', 'comercial');
    if (error || !data) return result;
    for (const row of data) {
      const key = row.setting_key as keyof GcSettingsMap;
      if (!(key in GC_DEFAULT_SETTINGS)) continue;
      (result as any)[key] = parseSettingValue(key, row.setting_value);
    }
  } catch {
    // tabela pode ainda não existir — usa defaults
  }
  return result;
}

export async function saveGcSetting(
  key: keyof GcSettingsMap,
  value: unknown,
  updatedBy?: string,
): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    gestor_key: 'comercial',
    setting_key: key,
    setting_value: value as any,
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('gestor_settings')
    .upsert(payload, { onConflict: 'gestor_key,setting_key' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
