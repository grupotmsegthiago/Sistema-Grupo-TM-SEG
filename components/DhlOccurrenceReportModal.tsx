import React, { useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import type { Mission } from '../types';
import {
  downloadDhlOccurrenceReportBlob,
  generateDhlOccurrenceReportPdf,
} from '../lib/services/dhlOccurrenceReportService';

type Props = {
  mission: Mission;
  isOpen: boolean;
  onClose: () => void;
};

const DEFAULT_183013_SUMMARY = `Na operação do dia 08/07/2026, a S.E. 183013 estava programada para atendimento na origem (Foxconn Jundiaí) às 11:00.
Houve atraso na chegada à origem, com necessidade de remanejamento de viatura próximo ao horário programado, em razão do encerramento de operação logística anterior na mesma janela.
A TM SEG manteve comunicação com a DHL, orientou a equipe quanto ao endereço correto e acompanhou a operação até a conclusão.`;

export default function DhlOccurrenceReportModal({ mission, isOpen, onClose }: Props) {
  const seNumber = String(mission.dhl_se_number || '').trim();
  const [factsSummary, setFactsSummary] = useState(() =>
    seNumber === '183013' ? DEFAULT_183013_SUMMARY : '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await generateDhlOccurrenceReportPdf({
        missionId: mission.id,
        seNumber,
        factsSummary,
      });
      downloadDhlOccurrenceReportBlob(blob, seNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        data-testid="modal-dhl-occurrence-report"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-[#0d3b66] text-white">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide">Plano de Ação DHL</h3>
              <p className="text-[11px] opacity-90">S.E. {seNumber} · OS {mission.id}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Informe o <strong>resumo dos fatos</strong> ou as <strong>trocas de e-mail</strong> que fundamentam este plano.
            O texto será incluído no PDF com logo TM SEG, horários operacionais, fotos por etapa e assinatura da diretoria.
          </p>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
              Resumo dos fatos / e-mails (opcional em missões futuras)
            </label>
            <textarea
              value={factsSummary}
              onChange={(e) => setFactsSummary(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] outline-none"
              placeholder="Descreva o ocorrido, comunicações com a DHL e medidas adotadas..."
              data-testid="input-dhl-occurrence-summary"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#450a0a] hover:bg-[#7f1d1d] text-white text-sm font-bold disabled:opacity-60"
              data-testid="button-generate-dhl-occurrence-report"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              Gerar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
