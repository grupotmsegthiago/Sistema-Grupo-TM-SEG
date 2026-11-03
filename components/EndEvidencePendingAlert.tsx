import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sameOperator } from '../lib/endEvidenceGate';

type Row = { id: string; client?: string | null; end_evidence_operator?: string | null };

const EndEvidencePendingAlert: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let name = '';
      try { name = String(JSON.parse(localStorage.getItem('userData') || '{}')?.name || ''); } catch { name = ''; }
      if (!name) return;
      const { data } = await supabase
        .from('missions')
        .select('id, client, end_evidence_operator')
        .eq('end_evidence_pending', true)
        .order('id', { ascending: true })
        .limit(80);
      if (cancelled) return;
      const mine = ((data || []) as Row[]).filter((row) => sameOperator(row.end_evidence_operator, name));
      setRows(mine);
      setOpen(mine.length > 0);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[220] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg font-black text-xs uppercase"
        data-testid="end-evidence-pending-pill"
      >
        {rows.length} OS sem foto do fim
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[220] bg-black/70 flex items-center justify-center p-4" data-testid="end-evidence-pending-alert">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border-4 border-red-600 overflow-hidden">
        <div className="bg-red-600 text-white px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black uppercase">Falta a evidência do fim</p>
            <p className="text-[11px] font-semibold">Abra a OS e finalize com a foto do fim da viagem, a foto do KM e a confirmação do horário da foto do fornecedor.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-red-500" aria-label="Fechar cobrança" data-testid="button-end-evidence-close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {rows.map((row) => (
            <p key={row.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-800">
              {row.id} · {row.client || 'Cliente'}
            </p>
          ))}
        </div>
        <div className="p-4 pt-0">
          <button type="button" onClick={() => setOpen(false)} className="w-full py-2 rounded-xl border border-red-300 text-red-700 text-xs font-black uppercase">
            Fechar e deixar pendente
          </button>
        </div>
      </div>
    </div>
  );
};

export default EndEvidencePendingAlert;
