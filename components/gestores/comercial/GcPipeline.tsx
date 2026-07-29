import React, { useState } from 'react';
import { Filter, Plus } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { formatBrl, formatPct } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';
import { GC_PIPELINE_STAGES, defaultProbabilityForStage } from '../../../lib/gestores/comercial/pipeline';
import { getGcUser } from '../../../lib/gestores/comercial/access';
import { supabase } from '../../../lib/supabase';
import { logGcAudit } from '../../../lib/gestores/comercial/audit';

const GcPipeline: React.FC = () => {
  const { opportunities, settings, refresh, reps } = useGcData();
  const user = getGcUser();
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [stage, setStage] = useState('lead');
  const [value, setValue] = useState('0');
  const [msg, setMsg] = useState('');

  const createOpp = async () => {
    setMsg('');
    if (!title.trim()) {
      setMsg('Informe o título.');
      return;
    }
    const myRep = reps.find((r) => r.full_name.toLowerCase() === String(user.name || '').toLowerCase());
    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || null,
      stage,
      probability_pct: defaultProbabilityForStage(stage, settings.pipeline_probabilities),
      expected_value: Number(value) || 0,
      status: 'open',
      priority: 'media',
      rep_id: myRep?.id || null,
      created_by: user.name || null,
    };
    const { data, error } = await supabase.from('gc_opportunities').insert([payload]).select('id').single();
    if (error) {
      setMsg(error.message.includes('does not exist')
        ? 'Execute a migration do Gestor Comercial no Supabase.'
        : error.message);
      return;
    }
    await logGcAudit({ entity: 'gc_opportunities', entityId: data.id, actionType: 'CREATE', newValue: payload });
    setTitle('');
    setClientName('');
    setMsg('Oportunidade criada.');
    await refresh();
  };

  const moveStage = async (id: string, nextStage: string) => {
    const probability_pct = defaultProbabilityForStage(nextStage, settings.pipeline_probabilities);
    await supabase.from('gc_opportunities').update({
      stage: nextStage,
      probability_pct,
      updated_by: user.name || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    await logGcAudit({
      entity: 'gc_opportunities',
      entityId: id,
      actionType: 'UPDATE',
      newValue: { stage: nextStage, probability_pct },
    });
    await refresh();
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
      <GcPageHeader
        title="Pipeline Inteligente"
        subtitle="Lead → Cliente Ativo com probabilidade parametrizável"
        icon={Filter}
      />

      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input className="border rounded-xl px-3 py-2 text-sm md:col-span-2" placeholder="Título da oportunidade" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Cliente" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <select className="border rounded-xl px-3 py-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
          {GC_PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="flex gap-2">
          <input className="border rounded-xl px-3 py-2 text-sm w-full" type="number" placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="button" onClick={() => void createOpp()} className="px-3 rounded-xl bg-slate-900 text-amber-300">
            <Plus size={18} />
          </button>
        </div>
        {msg && <p className="md:col-span-5 text-sm text-slate-600">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {GC_PIPELINE_STAGES.map((s) => {
          const items = opportunities.filter((o) => o.stage === s.key && o.status === 'open');
          return (
            <div key={s.key} className="bg-slate-50 rounded-2xl border border-slate-100 p-3 min-h-[220px]">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-black text-xs uppercase text-slate-700">{s.label}</h3>
                <span className="text-[10px] font-bold text-amber-700">
                  {formatPct(settings.pipeline_probabilities[s.key] ?? 10)}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <div key={o.id} className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="font-bold text-sm text-slate-900">{o.title}</p>
                    <p className="text-xs text-slate-500">{o.client_name || '—'}</p>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{formatBrl(o.expected_value)} · {formatPct(o.probability_pct)}</p>
                    <select
                      className="mt-2 w-full text-xs border rounded-lg px-2 py-1"
                      value={o.stage}
                      onChange={(e) => void moveStage(o.id, e.target.value)}
                    >
                      {GC_PIPELINE_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                    </select>
                  </div>
                ))}
                {!items.length && <p className="text-xs text-slate-400">Vazio</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GcPipeline;
