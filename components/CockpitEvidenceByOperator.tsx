import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { summarizeEvidenceByOperator } from '../lib/endEvidenceGate';

type Raw = {
  end_evidence_operator?: string | null;
  end_evidence_pending?: boolean | null;
  end_trip_evidence_url?: string | null;
  end_km_evidence_url?: string | null;
};

const CockpitEvidenceByOperator: React.FC = () => {
  const [rows, setRows] = useState<ReturnType<typeof summarizeEvidenceByOperator>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('missions')
        .select('end_evidence_operator, end_evidence_pending, end_trip_evidence_url, end_km_evidence_url')
        .or('end_evidence_pending.eq.true,end_trip_evidence_url.not.is.null')
        .limit(2000);
      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        return;
      }
      setRows(summarizeEvidenceByOperator(((data || []) as Raw[]).map((row) => ({
        operator: row.end_evidence_operator,
        pending: row.end_evidence_pending,
        tripUrl: row.end_trip_evidence_url,
        kmUrl: row.end_km_evidence_url,
      }))));
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm" data-testid="cockpit-evidence-by-operator">
      <h3 className="text-sm font-black text-gray-900">Pendências de evidência por operador</h3>
      <p className="text-xs text-gray-500 mt-1">Quantas OS já têm as fotos do fim e quantas ainda estão pendentes com cada usuário.</p>
      {error && <p className="mt-2 text-xs font-bold text-red-600">ERRO — {error}</p>}
      {!error && rows.length === 0 && <p className="mt-3 text-xs text-gray-500">Nenhuma evidência de fim registrada ainda.</p>}
      {rows.length > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] font-black uppercase text-gray-400">
              <th className="py-1">Operador</th>
              <th className="py-1 text-right">Com evidência</th>
              <th className="py-1 text-right">Pendentes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.operator} className="border-t border-gray-100">
                <td className="py-2 font-bold text-gray-800">{row.operator}</td>
                <td className="py-2 text-right font-black text-emerald-700">{row.withEvidence}</td>
                <td className="py-2 text-right font-black text-red-700">{row.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CockpitEvidenceByOperator;
