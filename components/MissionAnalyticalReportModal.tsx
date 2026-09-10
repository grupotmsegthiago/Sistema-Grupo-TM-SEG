import React, { useEffect, useState } from 'react';
import { Download, Loader2, Printer, X } from 'lucide-react';
import type { Mission } from '../types';
import { collectMissionAnalyticalReport } from '../lib/missionAnalyticalReport/collectAnalyticalReport';
import { buildMissionAnalyticalReportHtml } from '../lib/missionAnalyticalReport/buildAnalyticalReportHtml';
import {
  downloadDhlOccurrenceReportHtml,
  printDhlOccurrenceReportHtml,
} from '../lib/services/dhlOccurrenceReportService';

type Props = {
  mission: Mission;
  isOpen: boolean;
  onClose: () => void;
  omitFinancials?: boolean;
};

const MissionAnalyticalReportModal: React.FC<Props> = ({ mission, isOpen, onClose, omitFinancials }) => {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen || !mission?.id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setHtml('');
    void collectMissionAnalyticalReport(mission)
      .then((data) => {
        if (!alive) return;
        setHtml(buildMissionAnalyticalReportHtml(data, { omitFinancials }));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Falha ao montar o relatório da OS.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [isOpen, mission, omitFinancials]);

  if (!isOpen) return null;

  const filename = `TMSEG_Relatorio_Analitico_${String(mission.id).replace(/[^\w.-]+/g, '_')}`;

  const imprimirPdf = () => {
    if (!html) return;
    setPrinting(true);
    try {
      printDhlOccurrenceReportHtml(html, `Relatório Analítico ${mission.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir a impressão.');
    } finally {
      window.setTimeout(() => setPrinting(false), 800);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3" data-testid="modal-analytical-os-report">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-[#111827] via-[#991b1b] to-[#dc2626] text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-red-100">Grupo TM SEG</p>
            <h3 className="font-black text-sm uppercase">Relatório Analítico da Viagem · {mission.id}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!html || printing}
            onClick={imprimirPdf}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#450a0a] text-white text-[10px] font-black uppercase disabled:opacity-50"
            data-testid="button-print-analytical-os-report"
          >
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Gerar PDF
          </button>
          <button
            type="button"
            disabled={!html}
            onClick={() => downloadDhlOccurrenceReportHtml(html, `${filename}.html`)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-[10px] font-black uppercase text-gray-700 disabled:opacity-50"
            data-testid="button-download-html-analytical-os-report"
          >
            <Download size={14} /> Baixar HTML
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 relative min-h-[360px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-600" data-testid="overlay-analytical-os-loading">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-xs font-bold uppercase">Montando relatório da OS…</p>
            </div>
          )}
          {error && (
            <div className="p-6 text-sm text-red-700 font-bold">{error}</div>
          )}
          {html && (
            <iframe
              title={`Relatório analítico ${mission.id}`}
              srcDoc={html}
              className="w-full h-[70vh] bg-white"
              data-testid="iframe-analytical-os-preview"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionAnalyticalReportModal;
