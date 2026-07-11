import React, { useEffect, useRef, useState } from 'react';
import { Eye, ExternalLink, FileText, History, Link2, Loader2, Paperclip, Printer, Save, Sparkles, X } from 'lucide-react';
import type { Mission } from '../types';
import { readEmailAttachmentFile } from '../lib/dhlOccurrenceReport/readEmailAttachment';
import {
  adjustDhlOccurrenceReportHtml,
  downloadDhlOccurrenceReportBlob,
  downloadDhlOccurrenceReportHtml,
  fetchDhlOccurrenceReportPreview,
  generateDhlOccurrenceReportPdf,
  getDhlOccurrenceReportVersion,
  listDhlOccurrenceReportHistory,
  openDhlOccurrenceReportHtmlInNewTab,
  printDhlOccurrenceReportHtml,
  saveDhlOccurrenceReport,
  type DhlReportHistoryItem,
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

const EMAIL_FILE_ACCEPT = '.eml,.txt,.html,.htm,.pdf';

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
  const [aiAdjustmentNotes, setAiAdjustmentNotes] = useState('');
  const [emailLink, setEmailLink] = useState('');
  const [emailAttachmentText, setEmailAttachmentText] = useState('');
  const [emailFileName, setEmailFileName] = useState<string | null>(null);
  const [evidenceStats, setEvidenceStats] = useState<{ total: number; phases: number } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'preview' | 'pdf' | 'print' | 'adjust' | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Iniciando...');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<DhlReportHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
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
      const content = await readEmailAttachmentFile(file);
      setEmailAttachmentText(content);
      setEmailFileName(file.name);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo de e-mail selecionado.');
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
      const { html, evidenceCount, phasePhotoCount } = await fetchDhlOccurrenceReportPreview(reportParams, applyProgress);
      setPreviewHtml(html);
      setEvidenceStats({ total: evidenceCount, phases: phasePhotoCount });
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar pré-visualização');
    } finally {
      resetLoading();
    }
  };

  const handleAiAdjust = async () => {
    if (!previewHtml) {
      setError('Gere a pré-visualização antes de pedir ajustes à IA.');
      return;
    }
    if (!aiAdjustmentNotes.trim()) {
      setError('Descreva o que deseja ajustar no relatório (tom, contexto, menções ao parceiro, etc.).');
      return;
    }

    setLoading(true);
    setLoadingMode('adjust');
    setError(null);
    targetPercentRef.current = 10;
    setProgressPercent(10);
    setProgressLabel('A IA está ajustando o contexto do relatório...');

    try {
      const adjusted = await adjustDhlOccurrenceReportHtml(
        previewHtml,
        aiAdjustmentNotes,
        mission.id,
        applyProgress,
      );
      setPreviewHtml(adjusted);
      setAiAdjustmentNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ajustar relatório com IA');
    } finally {
      resetLoading();
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const versions = await listDhlOccurrenceReportHistory(mission.id);
      setHistory(versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar histórico');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    setNotice(null);
    if (next) void loadHistory();
  };

  const handleSaveVersion = async () => {
    if (!previewHtml) {
      setError('Gere a pré-visualização antes de salvar.');
      return;
    }
    const label = window.prompt(
      'Rótulo desta versão (opcional). Ex.: "Enviado ao cliente em 11/07"',
      '',
    );
    if (label === null) return; // usuário cancelou
    setSavingVersion(true);
    setError(null);
    setNotice(null);
    try {
      const { version } = await saveDhlOccurrenceReport({
        missionId: mission.id,
        seNumber,
        html: previewHtml,
        factsSummary,
        emailLink,
        aiGenerated: !!(emailAttachmentText.trim() || emailLink.trim()),
        label: label.trim(),
      });
      setNotice(`Versão ${version} salva no histórico.`);
      setHistoryOpen(true);
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar versão');
    } finally {
      setSavingVersion(false);
    }
  };

  const handleOpenVersion = async (id: string) => {
    setHistoryLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { html, version } = await getDhlOccurrenceReportVersion(mission.id, id);
      setPreviewHtml(html);
      setHistoryOpen(false);
      setNotice(`Exibindo a versão ${version} salva.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir versão');
    } finally {
      setHistoryLoading(false);
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
      setError('Gere a pré-visualização antes de salvar o PDF completo.');
      return;
    }
    try {
      setError(null);
      printDhlOccurrenceReportHtml(previewHtml, `Plano DHL S.E. ${seNumber}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Use "Baixar HTML" e abra o arquivo no navegador.`
          : 'Não foi possível abrir a impressão.',
      );
    }
  };

  const handleDownloadHtml = () => {
    if (!previewHtml) {
      setError('Gere a pré-visualização antes de baixar o relatório.');
      return;
    }
    try {
      setError(null);
      downloadDhlOccurrenceReportHtml(previewHtml, `PA-DHL-${seNumber}.html`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar o HTML.');
    }
  };

  const handleOpenFullTab = () => {
    if (!previewHtml) {
      setError('Gere a pré-visualização antes de abrir o relatório.');
      return;
    }
    try {
      setError(null);
      openDhlOccurrenceReportHtmlInNewTab(previewHtml);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir em nova aba.');
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
                <p className="text-[10px] text-slate-500 mb-2">
                  Exporte do Outlook como <strong>.eml</strong>, <strong>.txt</strong> ou <strong>.pdf</strong> (texto selecionável).
                  Arquivos <strong>.msg</strong> e PDFs só-imagem (scan) não são lidos automaticamente.
                </p>
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
            <div className="px-4 py-3 bg-gradient-to-r from-[#111827] via-[#7f1d1d] to-[#dc2626] border-b border-[#991b1b] text-white shrink-0 space-y-2">
              <p className="text-[11px] leading-relaxed opacity-95">
                Leia o relatório abaixo. Se o <strong>tom ou contexto</strong> não estiver adequado para enviar à DHL,
                descreva o ajuste desejado e clique em <strong>Ajustar com IA</strong>.
              </p>
              <textarea
                value={aiAdjustmentNotes}
                onChange={(e) => setAiAdjustmentNotes(e.target.value)}
                rows={3}
                disabled={loading}
                placeholder='Ex.: O relatório está falando mal do fornecedor. Ajuste para tom construtivo, use "parceiro/fornecedor" no texto geral e cite o nome completo só na identificação.'
                className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:border-white outline-none disabled:opacity-50"
                data-testid="input-dhl-occurrence-ai-adjust"
              />
              <button
                type="button"
                onClick={() => void handleAiAdjust()}
                disabled={loading || !previewHtml || !aiAdjustmentNotes.trim()}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white text-[#991b1b] text-xs font-bold hover:bg-red-50 disabled:opacity-50"
                data-testid="button-ai-adjust-dhl-report"
              >
                {loading && loadingMode === 'adjust' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Ajustar com IA
              </button>
            </div>

            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 shrink-0">
              {evidenceStats && (
                <p className="mb-1">
                  Evidências no relatório: <strong>{evidenceStats.total}</strong> foto(s) total ·{' '}
                  <strong>{evidenceStats.phases}</strong>/4 por etapa.
                  {evidenceStats.total === 0 && (
                    <span className="text-red-700 font-semibold">
                      {' '}
                      Nenhuma foto encontrada — verifique SUPABASE_SERVICE_ROLE_KEY na Vercel ou evidências na OS.
                    </span>
                  )}
                </p>
              )}
              Relatório <strong>completo</strong> com cores TM SEG, logo, fotos e todas as seções.
              Para PDF: <strong>Salvar PDF completo</strong> → na janela de impressão escolha
              &quot;Salvar como PDF&quot;. O botão &quot;PDF resumido&quot; gera apenas um rascunho sem layout.
            </div>

            <div className="flex-1 min-h-[50vh] bg-slate-100 p-2 sm:p-3 overflow-hidden">
              {historyOpen ? (
                <div
                  className="w-full h-full min-h-[50vh] rounded-lg border border-slate-300 bg-white overflow-y-auto p-4"
                  data-testid="dhl-occurrence-history-panel"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black text-[#0d3b66] flex items-center gap-2">
                      <History size={16} /> Histórico de versões
                    </h4>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(false)}
                      className="text-xs font-semibold text-slate-500 underline"
                    >
                      Voltar ao relatório
                    </button>
                  </div>
                  {historyLoading ? (
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Carregando...
                    </p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nenhuma versão salva para esta OS ainda. Gere o relatório e clique em
                      <strong> Salvar versão</strong> para guardar no histórico.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h) => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800">
                              Versão {h.version}
                              {h.label ? <span className="font-normal text-slate-600"> — {h.label}</span> : ''}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {new Date(h.created_at).toLocaleString('pt-BR')} · {h.created_by || '—'}
                              {h.ai_generated ? ' · IA' : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleOpenVersion(h.id)}
                            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0d3b66] text-white text-xs font-bold hover:bg-[#0a2f52]"
                            data-testid="button-open-dhl-version"
                          >
                            <Eye size={13} /> Abrir
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                previewHtml && (
                  <iframe
                    title={`Pré-visualização Plano DHL S.E. ${seNumber}`}
                    srcDoc={previewHtml}
                    className="w-full h-full min-h-[50vh] rounded-lg border border-slate-300 bg-white"
                    data-testid="iframe-dhl-occurrence-preview"
                  />
                )
              )}
            </div>

            {notice && (
              <p className="mx-5 mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 shrink-0">
                {notice}
              </p>
            )}
            {error && (
              <p className="mx-5 mt-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 shrink-0">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-between p-4 border-t border-slate-200 shrink-0">
              <div className="flex flex-wrap gap-2 items-center">
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
                <button
                  type="button"
                  onClick={() => void handleSaveVersion()}
                  disabled={loading || savingVersion || !previewHtml}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
                  data-testid="button-save-dhl-version"
                >
                  {savingVersion ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar versão
                </button>
                <button
                  type="button"
                  onClick={handleToggleHistory}
                  disabled={loading}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold ${
                    historyOpen ? 'bg-[#0d3b66] text-white border-[#0d3b66]' : 'border-[#0d3b66] text-[#0d3b66]'
                  }`}
                  data-testid="button-history-dhl-report"
                >
                  <History size={14} />
                  Histórico
                </button>
              </div>

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
                  onClick={handleOpenFullTab}
                  disabled={loading || !previewHtml}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#0d3b66] text-[#0d3b66] text-sm font-bold"
                  data-testid="button-open-full-dhl-report-tab"
                >
                  <ExternalLink size={14} />
                  Abrir completo
                </button>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  disabled={loading || !previewHtml}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#0d3b66] text-[#0d3b66] text-sm font-bold"
                  data-testid="button-download-html-dhl-report"
                >
                  <FileText size={14} />
                  Baixar HTML
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={loading}
                  title="Versão resumida gerada no servidor — sem logo, fotos nem layout completo"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-400 text-slate-600 text-sm font-semibold"
                  data-testid="button-download-pdf-light-dhl-report"
                >
                  {loading && loadingMode === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  PDF resumido
                </button>
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={loading || !previewHtml}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#450a0a] hover:bg-[#7f1d1d] text-white text-sm font-bold"
                  data-testid="button-print-pdf-dhl-report"
                >
                  <Printer size={16} />
                  Salvar PDF completo
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
