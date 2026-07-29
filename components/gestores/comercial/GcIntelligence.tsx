import React from 'react';
import { Brain, RefreshCw, Sparkles } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';

interface Props {
  onNavigate: (screen: string, id?: string) => void;
}

const GcIntelligence: React.FC<Props> = ({ onNavigate }) => {
  const { insights, loading, enrichAi, aiLoading, refresh, hideStrategic } = useGcData();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title="Inteligência Comercial"
        subtitle="Insights automáticos com ações práticas — dados da carteira real (SSOT)"
        icon={Brain}
        actions={
          <>
            <button type="button" onClick={() => void refresh()} className="px-3 py-2 rounded-xl border bg-white text-sm font-semibold inline-flex gap-2 items-center">
              <RefreshCw size={16} /> Atualizar
            </button>
            <button type="button" onClick={() => void enrichAi()} disabled={aiLoading} className="px-3 py-2 rounded-xl bg-slate-900 text-amber-300 text-sm font-semibold inline-flex gap-2 items-center disabled:opacity-60">
              <Sparkles size={16} /> {aiLoading ? 'Processando…' : 'Refinar com IA'}
            </button>
          </>
        }
      />

      {hideStrategic && (
        <div className="mb-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
          Modo comercial: a IA só analisa sua carteira e não expõe lucro/margem global.
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-40 bg-slate-100 rounded-2xl" />
      ) : (
        <div className="space-y-3">
          {insights.map((ins, idx) => (
            <article
              key={`${ins.title}-${idx}`}
              className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {ins.source === 'ai' ? 'IA' : 'Regra'} · {ins.severity}
                  </p>
                  <h3 className="font-bold text-slate-900 mt-1">{ins.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{ins.detail}</p>
                </div>
                {ins.client_id && (
                  <button
                    type="button"
                    className="text-xs font-bold text-amber-700 shrink-0"
                    onClick={() => onNavigate('gc-client-card', ins.client_id!)}
                  >
                    Abrir ficha
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ins.suggested_actions.map((a) => (
                  <span key={a} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                    {a}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {!insights.length && (
            <p className="text-slate-500">Nenhum insight no momento.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default GcIntelligence;
