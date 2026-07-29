import React, { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import GcPageHeader from './shared/GcPageHeader';
import { formatBrl } from './shared/format';
import { useGcData } from '../../../lib/gestores/comercial/useGcData';

const GcRanking: React.FC = () => {
  const { health, reps, hideStrategic } = useGcData();

  const byRep = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of health) {
      const key = h.ownedBy || 'Sem responsável';
      map.set(key, (map.get(key) || 0) + h.monthlyRevenue);
    }
    // garantir reps cadastrados
    for (const r of reps) {
      if (!map.has(r.full_name)) map.set(r.full_name, 0);
    }
    return Array.from(map.entries())
      .map(([name, receita]) => ({ name, receita }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 15);
  }, [health, reps]);

  if (hideStrategic) {
    return (
      <div className="p-8">
        <GcPageHeader title="Ranking Comercial" icon={Trophy} />
        <p className="text-slate-600">Ranking global disponível apenas para a Diretoria.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <GcPageHeader
        title="Ranking Comercial"
        subtitle="Receita do mês por responsável (created_by / cadastro GC)"
        icon={Trophy}
      />
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 h-96 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byRep} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatBrl(v)} />
            <Bar dataKey="receita" fill="#0f172a" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ol className="space-y-2">
        {byRep.map((r, i) => (
          <li key={r.name} className="flex justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
            <span className="font-bold text-slate-800">#{i + 1} {r.name}</span>
            <span className="font-semibold text-amber-700">{formatBrl(r.receita)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default GcRanking;
