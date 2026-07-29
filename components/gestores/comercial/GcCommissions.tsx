import React, { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Trash2 } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import GcStatCard from './shared/GcStatCard';
import { formatBrl, formatPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';
import { canAccessGcFull, getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';
import { calculateTieredCommission } from '../../../lib/gestores/comercial/commission';

const GcCommissions: React.FC = () => {
  const { kpis, plans, refresh } = useGcData();
  const user = getGcUser();
  const full = canAccessGcFull(user);
  const [name, setName] = useState('');
  const [basePercent, setBasePercent] = useState('3');
  const [tiers, setTiers] = useState([
    { min_amount: 0, max_amount: 100000, percent: 2, bonus_amount: 0, label: 'Até 100k' },
    { min_amount: 100000.01, max_amount: 300000, percent: 3, bonus_amount: 0, label: 'Até 300k' },
    { min_amount: 300000.01, max_amount: null as number | null, percent: 4, bonus_amount: 500, label: 'Acima de 300k' },
  ]);
  const [msg, setMsg] = useState('');

  const preview = useMemo(
    () => calculateTieredCommission(kpis?.valorVendido || 0, {
      base_percent: Number(basePercent) || 0,
      tiers: tiers as any,
    }),
    [kpis?.valorVendido, basePercent, tiers],
  );

  const savePlan = async () => {
    setMsg('');
    if (!name.trim()) {
      setMsg('Informe o nome do plano.');
      return;
    }
    const { data, error } = await supabase
      .from('gc_commission_plans')
      .insert([{
        name: name.trim(),
        base_percent: Number(basePercent) || 0,
        active: true,
        created_by: user.name || null,
      }])
      .select('id')
      .single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Execute a migration 2026_07_29_gestor_comercial.sql no Supabase.'
        : error.message);
      return;
    }
    const planId = data.id;
    await supabase.from('gc_commission_tiers').insert(
      tiers.map((t, i) => ({
        plan_id: planId,
        min_amount: t.min_amount,
        max_amount: t.max_amount,
        percent: t.percent,
        bonus_amount: t.bonus_amount,
        label: t.label,
        sort_order: i,
      })),
    );
    await logGcAudit({
      entity: 'gc_commission_plans',
      entityId: planId,
      actionType: 'CREATE',
      newValue: { name, basePercent, tiers },
    });
    setMsg('Plano de comissão salvo.');
    setName('');
    await refresh();
  };

  useEffect(() => {
    // noop — plans vêm do hook
  }, [plans]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title="Comissões"
        subtitle="Faixas parametrizáveis por comercial — cálculo automático sobre o faturamento real"
        icon={Percent}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <GcStatCard title="Estimada" value={formatBrl(kpis?.comissaoEstimada || 0)} icon={Percent} tone="accent" />
        <GcStatCard title="Confirmada" value={formatBrl(kpis?.comissaoConfirmada || 0)} icon={Percent} tone="good" />
        <GcStatCard title="Previsão" value={formatBrl(kpis?.previsaoComissao || 0)} icon={Percent} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="font-black text-sm uppercase mb-3">Planos cadastrados</h2>
        {!plans.length && <p className="text-sm text-slate-500">Nenhum plano ainda.</p>}
        <div className="space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="border border-slate-100 rounded-xl p-3">
              <p className="font-bold">{p.name} · base {formatPct(p.base_percent)}</p>
              <ul className="mt-2 text-xs text-slate-600 space-y-1">
                {(p.tiers || []).map((t, i) => (
                  <li key={i}>
                    {t.label || `Faixa ${i + 1}`}: {formatBrl(t.min_amount)}
                    {t.max_amount != null ? ` → ${formatBrl(t.max_amount)}` : ' +'} · {formatPct(t.percent)}
                    {t.bonus_amount ? ` + bônus ${formatBrl(t.bonus_amount)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {full && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="font-black text-sm uppercase">Novo plano de comissão</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="border rounded-xl px-3 py-2" placeholder="Nome do plano" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="border rounded-xl px-3 py-2" type="number" placeholder="% base" value={basePercent} onChange={(e) => setBasePercent(e.target.value)} />
          </div>
          {tiers.map((t, idx) => (
            <div key={idx} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <input className="border rounded-xl px-2 py-2 text-sm" placeholder="Label" value={t.label} onChange={(e) => {
                const next = [...tiers]; next[idx] = { ...t, label: e.target.value }; setTiers(next);
              }} />
              <input className="border rounded-xl px-2 py-2 text-sm" type="number" placeholder="Mín" value={t.min_amount} onChange={(e) => {
                const next = [...tiers]; next[idx] = { ...t, min_amount: Number(e.target.value) }; setTiers(next);
              }} />
              <input className="border rounded-xl px-2 py-2 text-sm" type="number" placeholder="Máx (vazio=∞)" value={t.max_amount ?? ''} onChange={(e) => {
                const next = [...tiers]; next[idx] = { ...t, max_amount: e.target.value === '' ? null : Number(e.target.value) }; setTiers(next);
              }} />
              <input className="border rounded-xl px-2 py-2 text-sm" type="number" placeholder="%" value={t.percent} onChange={(e) => {
                const next = [...tiers]; next[idx] = { ...t, percent: Number(e.target.value) }; setTiers(next);
              }} />
              <button type="button" className="p-2 text-rose-600" onClick={() => setTiers(tiers.filter((_, i) => i !== idx))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-sm font-bold text-slate-700" onClick={() => setTiers([...tiers, { min_amount: 0, max_amount: null, percent: 1, bonus_amount: 0, label: 'Nova faixa' }])}>
            <Plus size={14} /> Faixa
          </button>
          <p className="text-sm text-slate-600">
            Simulação sobre vendido atual ({formatBrl(kpis?.valorVendido || 0)}): <strong>{formatBrl(preview.total)}</strong> ({formatPct(preview.percent)}
            {preview.bonus ? ` + bônus ${formatBrl(preview.bonus)}` : ''})
          </p>
          <button type="button" onClick={() => void savePlan()} className="px-4 py-2 rounded-xl bg-slate-900 text-amber-300 font-bold text-sm">
            Salvar plano
          </button>
          {msg && <p className="text-sm">{msg}</p>}
        </div>
      )}
    </div>
  );
};

export default GcCommissions;
