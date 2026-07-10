import React, { useEffect, useRef, useState } from 'react';
import { Eye, ExternalLink, FileText, Link2, Loader2, Paperclip, Printer, X } from 'lucide-react';
import type { Mission } from '../types';
import {
  downloadDhlOccurrenceReportBlob,
  fetchDhlOccurrenceReportPreview,
  generateDhlOccurrenceReportPdf,
  openDhlOccurrenceReportPrintPreview,
  type DhlReportProgress,
} from '../lib/services/dhlOccurrenceReportService';

type Props = {
  mission: Mission;
  isOpen: boolean;
  onClose: () => void;
};

type Step = 'edit' | 'preview';

const DEFAULT_183013_SUMMARY = `Na operação do dia 08/07/2026, a S.E. 183013 estava programada para atendimento na origem (Foxconn Jundiaí) às 11:00.
Houve atraso na chegada à origem, com necessidade de remanejamento de viatura próximo ao horário programado, em razão do encerramento de operação logística anterior na mesma janela.
A TM SEG manteve comunicação com a DHL, orientou a equipe quanto ao endereço correto e acompanhou a operação até a conclusão.`;

const EMAIL_FILE_ACCEPT = '.eml,.msg,.txt,.pdf,.html,.htm,image/*';

async function readEmailFile(file: File): Promise<string> {
  const text = await file.text();
  const trimmed = text.trim();
  if (trimmed) return trimmed.slice(0, 12000);
  return `[Arquivo anexado: ${file.name} — conteúdo binário não convertido automaticamente. Cole o texto do e-mail no resumo, se necessário.]`;
}

function DhlReportLoadingOverlay({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#0d3b66]/75 backdrop-blur-sm p-6"
      data-testid="overlay-dhl-occurrence-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8eef4]">
          <Loader2 size={34} className="animate-spin text-[#0d3b66]" />
        </div>

        <p className="text-sm font-black uppercase tracking-wide text-[#0d3b66]">
          Plano de Ação DHL
        </p>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed min-h-[2.5rem]">
          {label}
        </p>

        <div className="mt-5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            <span>Progresso</span>
            <span data-testid="dhl-occurrence-progress-percent">{safePercent}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#450a0a] via-[#7f1d1d] to-[#0d3b66] transition-all duration-500 ease-out relative overflow-hidden"
              style={{ width: `${safePercent}%` }}
              data-testid="dhl-occurrence-progress-bar"
            >
              <div className="absolute inset-0 bg-white/25 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DhlOccurrenceReportModal({ mission, isOpen, onClose }: Props) {
  const seNumber = String(mission.dhl_se_number || '').trim();
  const [step, setStep] = useState<Step>('edit');
  const [factsSummary, setFactsSummary] = useState(() =>
    seNumber === '183013' ? DEFAULT_183013_SUMMARY : '',
  );
  const [emailLink, setEmailLink] = useState('');
  const [emailAttachmentText, setEmailAttachmentText] = useState('');
  const [emailFileName, setEmailFileName] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'preview' | 'pdf' | 'print' | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Iniciando...');
  const [error, setError] = useState<string | null>(null);
  const targetPercentRef = useRef(0);
  const tickRef = useRef<number | null>(null);

  const reportParams = {
    missionId: mission.id,
    seNumber,
    factsSummary,
    emailLink,
    emailAttachmentText,
  };

  useEffect(() => {
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    if (tickRef.current != null) window.clearInterval(tickRef.current);

    tickRef.current = window.setInterval(() => {
      setProgressPercent((current) => {
        const target = targetPercentRef.current;
        if (current >= target) return current;
        const stepSize = current < 40 ? 3 : current < 85 ? 2 : 1;
        return Math.min(target, current + stepSize);
      });
    }, 100);

    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [loading]);

  const applyProgress = (progress: DhlReportProgress) => {
    targetPercentRef.current = progress.percent;
    setProgressLabel(progress.label);
    if (progress.percent >= 100) setProgressPercent(100);
  };

  const resetLoading = () => {
    setLoading(false);
    setLoadingMode(null);
    targetPercentRef.current = 0;
    setProgressPercent(0);
    setProgressLabel('Iniciando...');
  };

  if (!isOpen) return null;

  const handleEmailFile = async (file: File | null) => {
    if (!file) return;
    try {
      const content = await readEmailFile(file);
      setEmailAttachmentText(content);
      setEmailFileName(file.name);
      setError(null);
    } catch {
      setError('Não foi possível ler o arquivo de e-mail selecionado.');
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    setLoadingMode('preview');
    setError(null);
    targetPercentRef.current = 8;
    setProgressPercent(8);
    setProgressLabel('Gerando pré-visualização...');

    try {
      const { html } = await fetchDhlOccurrenceReportPreview(reportParams, applyProgress);
      setPreviewHtml(html);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar pré-visualização');
    } finally {
      resetLoading();
    }
  };

  const handleDownloadPdf = async () => {
    setLoading(true);
    setLoadingMode('pdf');
    setError(null);
    targetPercentRef.current = 10;
    setProgressPercent(10);
    setProgressLabel('Gerando PDF resumido (sem fotos embutidas)...');

    try {
      const { blob, filename } = await generateDhlOccurrenceReportPdf(reportParams, applyProgress);
      downloadDhlOccurrenceReportBlob(blob, filename);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Use "Salvar PDF (com fotos)" na pré-visualização.`
          : 'Falha ao gerar PDF',
      );
    } finally {
      resetLoading();
    }
  };

  const handlePrintPdf = () => {
    if (!previewHtml) {
      setError('Gere a pré-visualização antes de salvar o PDF com fotos.');
      return;
    }
    try {
      openDhlOccurrenceReportPrintPreview(previewHtml, `Plano DHL S.E. ${seNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a impressão.');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div
        className={`relative w-full rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col ${
          step === 'preview' ? 'max-w-5xl max-h-[96vh]' : 'max-w-xl max-h-[92vh]'
        }`}
        data-testid="modal-dhl-occurrence-report"
      >
        {loading && (
          <DhlReportLoadingOverlay percent={progressPercent} label={progressLabel} />
        )}

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-[#0d3b66] text-white shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide">Plano de Ação DHL</h3>
              <p className="text-[11px] opacity-90">
                S.E. {seNumber} · OS {mission.id}
                {step === 'preview' ? ' · Pré-visualização' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'edit' ? (
          <>
            <div className={`p-5 space-y-4 overflow-y-auto ${loading ? 'pointer-events-none opacity-60' : ''}`}>
              <p className="text-xs text-slate-600 leading-relaxed">
                Preencha os textos e clique em <strong>Pré-visualizar</strong> para revisar o documento
                (com fotos e horários). Depois salve em PDF.
              </p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
                  Resumo dos fatos
                </label>
                <textarea
                  value={factsSummary}
                  onChange={(e) => setFactsSummary(e.target.value)}
                  rows={6}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#0d3b66] outline-none disabled:bg-slate-50"
                  data-testid="input-dhl-occurrence-summary"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
                  Link do e-mail
                </label>
                <div className="relative">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={emailLink}
                    onChange={(e) => setEmailLink(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm disabled:bg-slate-50"
                    placeholder="https://..."
                    data-testid="input-dhl-occurrence-email-link"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
                  Anexar e-mail (.eml, .txt, .pdf)
                </label>
                <label className={`inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-slate-100'}`}>
                  <Paperclip size={14} />
                  {emailFileName ? `Arquivo: ${emailFileName}` : 'Selecionar arquivo de e-mail'}
                  <input
                    type="file"
                    accept={EMAIL_FILE_ACCEPT}
                    className="hidden"
                    disabled={loading}
                    onChange={(e) => {
                      void handleEmailFile(e.target.files?.[0] || null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                {emailAttachmentText && (
                  <textarea
                    value={emailAttachmentText}
                    onChange={(e) => setEmailAttachmentText(e.target.value)}
                    rows={4}
                    disabled={loading}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:bg-slate-50"
                  />
                )}
              </div>

              {error && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end p-5 border-t border-slate-200 shrink-0">
              <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0d3b66] hover:bg-[#0a2f52] text-white text-sm font-bold disabled:opacity-60"
                data-testid="button-preview-dhl-occurrence-report"
              >
                {loading && loadingMode === 'preview' ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                Pré-visualizar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 shrink-0">
              Revise o documento abaixo. Para corrigir textos, clique em <strong>Editar textos</strong>.
              Para PDF com fotos: <strong>Salvar PDF (com fotos)</strong> → Imprimir → Salvar como PDF.
            </div>

            <div className="flex-1 min-h-[50vh] bg-slate-100 p-2 sm:p-3 overflow-hidden">
              {previewHtml && (
                <iframe
                  title={`Pré-visualização Plano DHL S.E. ${seNumber}`}
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[50vh] rounded-lg border border-slate-300 bg-white"
                  data-testid="iframe-dhl-occurrence-preview"
                />
              )}
            </div>

            {error && (
              <p className="mx-5 mt-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 shrink-0">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-between p-4 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStep('edit');
                  setError(null);
                }}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
                data-testid="button-back-edit-dhl-report"
              >
                Editar textos
              </button>

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
                >
                  <ExternalLink size={14} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#450a0a] text-[#450a0a] text-sm font-bold"
                  data-testid="button-download-pdf-light-dhl-report"
                >
                  {loading && loadingMode === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  PDF rápido
                </button>
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={loading || !previewHtml}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#450a0a] hover:bg-[#7f1d1d] text-white text-sm font-bold"
                  data-testid="button-print-pdf-dhl-report"
                >
                  <Printer size={16} />
                  Salvar PDF (com fotos)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
