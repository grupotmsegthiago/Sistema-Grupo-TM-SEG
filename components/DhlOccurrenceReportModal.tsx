import React, { useEffect, useRef, useState } from 'react';
import { FileText, Link2, Loader2, Paperclip, X } from 'lucide-react';
import type { Mission } from '../types';
import {
  downloadDhlOccurrenceReportBlob,
  generateDhlOccurrenceReportPdf,
  type DhlReportProgress,
} from '../lib/services/dhlOccurrenceReportService';

type Props = {
  mission: Mission;
  isOpen: boolean;
  onClose: () => void;
};

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
          Gerando Plano de Ação DHL
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

        <p className="mt-4 text-[10px] text-slate-400">
          Aguarde — pode levar até 90 segundos conforme fotos e dados da OS.
        </p>
      </div>
    </div>
  );
}

export default function DhlOccurrenceReportModal({ mission, isOpen, onClose }: Props) {
  const seNumber = String(mission.dhl_se_number || '').trim();
  const [factsSummary, setFactsSummary] = useState(() =>
    seNumber === '183013' ? DEFAULT_183013_SUMMARY : '',
  );
  const [emailLink, setEmailLink] = useState('');
  const [emailAttachmentText, setEmailAttachmentText] = useState('');
  const [emailFileName, setEmailFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Iniciando...');
  const [error, setError] = useState<string | null>(null);
  const targetPercentRef = useRef(0);
  const tickRef = useRef<number | null>(null);

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
        if (current >= target) {
          if (target >= 100 && tickRef.current != null) {
            window.clearInterval(tickRef.current);
            tickRef.current = null;
          }
          return current;
        }
        const step = current < 30 ? 2 : current < 70 ? 1 : 0.5;
        return Math.min(target, current + step);
      });
    }, 120);

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
    if (progress.percent >= 100) {
      setProgressPercent(100);
    }
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

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    targetPercentRef.current = 5;
    setProgressPercent(5);
    setProgressLabel('Enviando solicitação ao servidor...');

    try {
      const { blob, filename } = await generateDhlOccurrenceReportPdf(
        {
          missionId: mission.id,
          seNumber,
          factsSummary,
          emailLink,
          emailAttachmentText,
        },
        applyProgress,
      );
      applyProgress({ percent: 100, label: 'Iniciando download do PDF...' });
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      downloadDhlOccurrenceReportBlob(blob, filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar relatório');
    } finally {
      setLoading(false);
      targetPercentRef.current = 0;
      setProgressPercent(0);
      setProgressLabel('Iniciando...');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
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
              <p className="text-[11px] opacity-90">S.E. {seNumber} · OS {mission.id}</p>
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

        <div className={`p-5 space-y-4 overflow-y-auto ${loading ? 'pointer-events-none opacity-60' : ''}`}>
          <p className="text-xs text-slate-600 leading-relaxed">
            Informe o <strong>resumo dos fatos</strong> e, se houver, o <strong>link ou anexo do e-mail</strong> da DHL.
            O PDF incluirá logo TM SEG, horários operacionais, fotos por etapa e assinatura da diretoria.
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
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] outline-none disabled:bg-slate-50"
              placeholder="Descreva o ocorrido, comunicações com a DHL e medidas adotadas..."
              data-testid="input-dhl-occurrence-summary"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
              Link do e-mail (Outlook, Gmail, etc.)
            </label>
            <div className="relative">
              <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={emailLink}
                onChange={(e) => setEmailLink(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-800 focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] outline-none disabled:bg-slate-50"
                placeholder="https://..."
                data-testid="input-dhl-occurrence-email-link"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">
              Anexar e-mail (.eml, .txt, .pdf)
            </label>
            <label className={`inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'}`}>
              <Paperclip size={14} />
              {emailFileName ? `Arquivo: ${emailFileName}` : 'Selecionar arquivo de e-mail'}
              <input
                type="file"
                accept={EMAIL_FILE_ACCEPT}
                className="hidden"
                disabled={loading}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  void handleEmailFile(file);
                  e.currentTarget.value = '';
                }}
                data-testid="input-dhl-occurrence-email-file"
              />
            </label>
            {emailAttachmentText && (
              <textarea
                value={emailAttachmentText}
                onChange={(e) => setEmailAttachmentText(e.target.value)}
                rows={4}
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:border-[#0d3b66] focus:ring-1 focus:ring-[#0d3b66] outline-none disabled:bg-slate-50"
                placeholder="Conteúdo extraído do e-mail (pode editar)"
                data-testid="textarea-dhl-occurrence-email-content"
              />
            )}
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end p-5 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#450a0a] hover:bg-[#7f1d1d] text-white text-sm font-bold disabled:opacity-60 min-w-[140px] justify-center"
            data-testid="button-generate-dhl-occurrence-report"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {loading ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
