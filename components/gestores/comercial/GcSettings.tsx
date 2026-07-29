import React, { useEffect, useState } from 'react';
import { Settings2, Save } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { GC_DEFAULT_SETTINGS, loadGcSettings, saveGcSetting } from '../../../lib/gestores/comercial/settings';
import type { GcSettingsMap } from '../../../lib/gestores/comercial/types';
import { getGcUser } from '../../../lib/gestores/comercial/access';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';

const GcSettings: React.FC = () => {
  const user = getGcUser();
  const [cfg, setCfg] = useState<GcSettingsMap>(GC_DEFAULT_SETTINGS);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadGcSettings().then(setCfg);
  }, []);

  const saveAll = async () => {
    setSaving(true);
    setMsg('');
    const entries: Array<[keyof GcSettingsMap, unknown]> = [
      ['tax_rate_pct', cfg.tax_rate_pct],
      ['min_margin_pct', cfg.min_margin_pct],
      ['days_without_contact', cfg.days_without_contact],
      ['days_followup_overdue', cfg.days_followup_overdue],
      ['days_supervisor_alert', cfg.days_supervisor_alert],
      ['days_diretoria_alert', cfg.days_diretoria_alert],
      ['days_without_revenue', cfg.days_without_revenue],
      ['default_monthly_goal', cfg.default_monthly_goal],
      ['pipeline_probabilities', cfg.pipeline_probabilities],
      ['alert_emails_diretoria', cfg.alert_emails_diretoria],
    ];
    for (const [key, value] of entries) {
      const res = await saveGcSetting(key, value, user.name || undefined);
      if (!res.ok) {
        setMsg(res.error || 'Erro ao salvar');
        setSaving(false);
        return;
      }
    }
    await logGcAudit({
      entity: 'gestor_settings',
      entityId: 'comercial',
      actionType: 'UPDATE',
      newValue: cfg,
      details: 'Atualização configurações Gestor Comercial',
    });
    setMsg('Configurações salvas.');
    setSaving(false);
  };

  const num = (key: keyof GcSettingsMap, label: string) => (
    <label className="text-sm block">
      <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
      <input
        type="number"
        className="mt-1 w-full border rounded-xl px-3 py-2"
        value={Number(cfg[key]) as number}
        onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <GcPageHeader
        title="Configurações Comerciais"
        subtitle="Imposto, margem mínima, alertas, metas e pipeline — nunca hardcode"
        icon={Settings2}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {num('tax_rate_pct', 'Imposto % (DRE cliente)')}
        {num('min_margin_pct', 'Margem mínima %')}
        {num('default_monthly_goal', 'Meta mensal padrão (R$)')}
        {num('days_without_contact', 'Dias sem contato')}
        {num('days_followup_overdue', 'Dias p/ cobrança follow-up')}
        {num('days_supervisor_alert', 'Dias p/ alertar supervisor')}
        {num('days_diretoria_alert', 'Dias p/ alertar Diretoria')}
        {num('days_without_revenue', 'Dias sem faturar (risco)')}
        <label className="text-sm md:col-span-2">
          <span className="text-[10px] font-bold uppercase text-slate-400">E-mails Diretoria (JSON array)</span>
          <input
            className="mt-1 w-full border rounded-xl px-3 py-2 font-mono text-xs"
            value={JSON.stringify(cfg.alert_emails_diretoria)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) setCfg({ ...cfg, alert_emails_diretoria: parsed.map(String) });
              } catch {
                // ignora digitação parcial
              }
            }}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[10px] font-bold uppercase text-slate-400">Probabilidades do pipeline (JSON)</span>
          <textarea
            className="mt-1 w-full border rounded-xl px-3 py-2 font-mono text-xs min-h-[100px]"
            value={JSON.stringify(cfg.pipeline_probabilities, null, 2)}
            onChange={(e) => {
              try {
                setCfg({ ...cfg, pipeline_probabilities: JSON.parse(e.target.value) });
              } catch {
                // digitação parcial
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveAll()}
          className="md:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm disabled:opacity-60"
        >
          <Save size={16} /> {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {msg && <p className="md:col-span-2 text-sm">{msg}</p>}
        <p className="md:col-span-2 text-xs text-slate-500">
          Cadastro de comerciais, planos e premiações: use o atalho abaixo ou a tela dedicada.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('tmseg:navigate', { detail: 'gc-reps' }))}
          className="md:col-span-2 text-sm font-bold text-amber-800 underline text-left"
        >
          Abrir Cadastro Comercial
        </button>
      </div>
    </div>
  );
};

export default GcSettings;
