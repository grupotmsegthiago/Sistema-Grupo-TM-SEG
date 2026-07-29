import React, { useEffect, useState } from 'react';
import { Target, Plus, Save } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import GcStatCard from './shared/GcStatCard';
import { formatBrl, formatPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';
import { canAccessGcFull, getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';

const GcGoals: React.FC = () => {
  const { kpis, reps, settings, refresh, hideStrategic } = useGcData();
  const user = getGcUser();
  const full = canAccessGcFull(user);
  const [repId, setRepId] = useState('');
  const [revenueGoal, setRevenueGoal] = useState(String(settings.default_monthly_goal));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setRevenueGoal(String(settings.default_monthly_goal));
  }, [settings.default_monthly_goal]);

  const saveGoal = async () => {
    setSaving(true);
    setMsg('');
    const now = new Date();
    const payload = {
      rep_id: repId || null,
      period_type: 'monthly',
      period_year: now.getFullYear(),
      period_month: now.getMonth() + 1,
      revenue_goal: Number(revenueGoal) || 0,
      created_by: user.name || null,
      updated_by: user.name || null,
    };
    const { data, error } = await supabase.from('gc_goals').insert([payload]).select('id').single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Tabela gc_goals ainda não existe. Execute a migration do Gestor Comercial.'
        : error.message);
    } else {
      await logGcAudit({
        entity: 'gc_goals',
        entityId: data?.id,
        actionType: 'CREATE',
        newValue: payload,
        details: `Meta mensal ${payload.revenue_goal}`,
      });
      // Se houver rep selecionado, atualiza meta no cadastro
      if (repId) {
        await supabase.from('gc_reps').update({
          monthly_goal: payload.revenue_goal,
          updated_by: user.name || null,
          updated_at: new Date().toISOString(),
        }).eq('id', repId);
      }
      setMsg('Meta salva com sucesso.');
      await refresh();
    }
    setSaving(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <GcPageHeader
        title="Metas"
        subtitle="Metas mensais/trimestrais/anuais parametrizáveis — nunca fixas no código"
        icon={Target}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <GcStatCard title="Meta atual" value={formatBrl(kpis?.metaAtual || 0)} icon={Target} tone="accent" />
        <GcStatCard title="Realizado" value={formatBrl(kpis?.valorVendido || 0)} icon={Target} tone="good" />
        <GcStatCard title="% da meta" value={formatPct(kpis?.metaPct || 0)} icon={Target} />
      </div>

      {full ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="font-black uppercase text-sm text-slate-900">Definir meta mensal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="font-bold text-slate-500 text-xs uppercase">Comercial</span>
              <select
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
                value={repId}
                onChange={(e) => setRepId(e.target.value)}
              >
                <option value="">Geral / padrão</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-bold text-slate-500 text-xs uppercase">Meta receita (R$)</span>
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
                value={revenueGoal}
                onChange={(e) => setRevenueGoal(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveGoal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Salvando…' : 'Salvar meta'}
          </button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
          {!reps.length && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <Plus size={12} /> Cadastre comerciais em “Cadastro Comercial” para metas individuais.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 text-sm text-slate-600">
          {hideStrategic
            ? 'Você visualiza apenas suas metas e o atingimento da sua carteira.'
            : 'Sem permissão para editar metas.'}
        </div>
      )}
    </div>
  );
};

export default GcGoals;
