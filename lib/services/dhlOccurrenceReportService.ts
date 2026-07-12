import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';

const REQUEST_TIMEOUT_MS = 90000;
const PREVIEW_TIMEOUT_MS = 45000;

export type GenerateDhlOccurrenceReportParams = {
  missionId: string;
  seNumber?: string;
  factsSummary?: string;
  emailLink?: string;
  emailAttachmentText?: string;
};

export type DhlReportProgress = {
  percent: number;
  label: string;
};

type ReportJsonResponse = {
  ok?: boolean;
  error?: string;
  filename?: string;
  pdfBase64?: string;
  html?: string;
  format?: string;
  hint?: string;
  evidenceCount?: number;
  phasePhotoCount?: number;
};

function buildPayload(params: GenerateDhlOccurrenceReportParams, format: 'html' | 'pdf') {
  return {
    missionId: params.missionId,
    seNumber: params.seNumber,
    format,
    factsSummary: params.factsSummary?.trim() || undefined,
    emailLink: params.emailLink?.trim() || undefined,
    emailAttachmentText: params.emailAttachmentText?.trim() || undefined,
  };
}

function base64ToBlob(base64: string, contentType = 'application/pdf'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

async function postOccurrenceReport(
  params: GenerateDhlOccurrenceReportParams,
  format: 'html' | 'pdf',
  onProgress?: (progress: DhlReportProgress) => void,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ReportJsonResponse> {
  const report = (percent: number, label: string) => {
    onProgress?.({ percent: Math.min(100, Math.max(0, percent)), label });
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    report(format === 'html' ? 15 : 10, 'Enviando dados ao servidor...');

    const res = await authFetch('/api/dhl/occurrence-report', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify(buildPayload(params, format)),
    });

    report(format === 'html' ? 70 : 60, format === 'html' ? 'Montando pré-visualização...' : 'Gerando PDF...');

    const json = (await parseJsonResponse(res)) as ReportJsonResponse;

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Erro ao gerar relatório (${res.status})`);
    }

    report(100, format === 'html' ? 'Pré-visualização pronta!' : 'PDF pronto!');
    return json;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        format === 'html'
          ? 'Tempo esgotado ao carregar a pré-visualização. Tente novamente.'
          : 'Tempo esgotado ao gerar o PDF. Use a pré-visualização e Imprimir → Salvar como PDF.',
      );
    }
    if (err instanceof Error) throw err;
    throw new Error('Falha ao gerar relatório DHL');
  } finally {
    window.clearTimeout(timer);
  }
}

/** Ajusta tom/contexto do HTML já gerado com observações da diretoria (IA). */
export async function adjustDhlOccurrenceReportHtml(
  html: string,
  adjustmentNotes: string,
  missionId: string,
  onProgress?: (progress: DhlReportProgress) => void,
  options?: {
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
): Promise<{ html: string; reply: string }> {
  const report = (percent: number, label: string) => {
    onProgress?.({ percent: Math.min(100, Math.max(0, percent)), label });
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    report(15, 'Enviando pedido ao agente de IA...');

    const res = await authFetch('/api/dhl/occurrence-report', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        missionId,
        format: 'adjust',
        html,
        adjustmentNotes: adjustmentNotes.trim(),
        conversationHistory: (options?.conversationHistory || []).slice(-12),
      }),
    });

    report(70, 'Aplicando ajustes no relatório...');

    const json = (await parseJsonResponse(res)) as ReportJsonResponse & {
      html?: string;
      reply?: string;
    };

    if (!res.ok || !json.ok || !json.html) {
      throw new Error(json.error || `Erro ao ajustar relatório (${res.status})`);
    }

    report(100, 'Relatório ajustado!');
    return {
      html: json.html,
      reply:
        String(json.reply || '').trim() ||
        'Pronto — apliquei o ajuste solicitado no relatório.',
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao ajustar o relatório. Tente novamente.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Falha ao ajustar relatório DHL com IA');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchDhlOccurrenceReportPreview(
  params: GenerateDhlOccurrenceReportParams,
  onProgress?: (progress: DhlReportProgress) => void,
): Promise<{ html: string; filename: string; evidenceCount: number; phasePhotoCount: number }> {
  const json = await postOccurrenceReport(params, 'html', onProgress, PREVIEW_TIMEOUT_MS);
  if (!json.html) {
    throw new Error('Pré-visualização vazia — tente novamente.');
  }
  return {
    html: json.html,
    filename: json.filename || `PA-DHL-${params.seNumber || params.missionId}.html`,
    evidenceCount: json.evidenceCount ?? 0,
    phasePhotoCount: json.phasePhotoCount ?? 0,
  };
}

export async function generateDhlOccurrenceReportPdf(
  params: GenerateDhlOccurrenceReportParams,
  onProgress?: (progress: DhlReportProgress) => void,
): Promise<{ blob: Blob; filename: string }> {
  const json = await postOccurrenceReport(params, 'pdf', onProgress, 45000);
  if (!json.pdfBase64) {
    throw new Error(json.error || 'Resposta inválida ao gerar PDF');
  }
  return {
    blob: base64ToBlob(json.pdfBase64),
    filename: json.filename || `PA-DHL-${params.seNumber || params.missionId}.pdf`,
  };
}

export type DhlReportHistoryItem = {
  id: string;
  version: number;
  label: string;
  se_number: string | null;
  ai_generated: boolean;
  created_by: string | null;
  created_at: string;
};

// Histórico usa o MESMO endpoint do relatório (POST /api/dhl/occurrence-report
// com `format`), servido pelo handler standalone da Vercel. O catch-all Express
// (/api/index) não é confiável em produção, por isso não criamos sub-rotas.

/** Salva o HTML atual do relatório como uma nova versão no histórico. */
export async function saveDhlOccurrenceReport(params: {
  missionId: string;
  seNumber?: string;
  html: string;
  factsSummary?: string;
  emailLink?: string;
  aiGenerated?: boolean;
  label?: string;
}): Promise<{ id: string; version: number; createdAt: string }> {
  const res = await authFetch('/api/dhl/occurrence-report', {
    method: 'POST',
    body: JSON.stringify({
      format: 'save',
      missionId: params.missionId,
      seNumber: params.seNumber,
      html: params.html,
      factsSummary: params.factsSummary,
      emailLink: params.emailLink,
      aiGenerated: params.aiGenerated === true,
      label: params.label,
    }),
  });
  const json = (await parseJsonResponse(res)) as {
    ok?: boolean;
    error?: string;
    id?: string;
    version?: number;
    createdAt?: string;
  };
  if (!res.ok || !json.ok || !json.id) {
    throw new Error(json.error || `Erro ao salvar versão (${res.status})`);
  }
  return { id: json.id, version: json.version || 1, createdAt: json.createdAt || '' };
}

/** Lista as versões salvas do relatório de uma OS (sem o HTML). */
export async function listDhlOccurrenceReportHistory(
  missionId: string,
): Promise<DhlReportHistoryItem[]> {
  const res = await authFetch('/api/dhl/occurrence-report', {
    method: 'POST',
    body: JSON.stringify({ format: 'history', missionId }),
  });
  const json = (await parseJsonResponse(res)) as {
    ok?: boolean;
    error?: string;
    versions?: DhlReportHistoryItem[];
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Erro ao listar histórico (${res.status})`);
  }
  return json.versions || [];
}

/** Carrega o HTML completo de uma versão salva do relatório. */
export async function getDhlOccurrenceReportVersion(
  missionId: string,
  reportId: string,
): Promise<{ html: string; version: number; label: string; createdAt: string }> {
  const res = await authFetch('/api/dhl/occurrence-report', {
    method: 'POST',
    body: JSON.stringify({ format: 'history-get', missionId, reportId }),
  });
  const json = (await parseJsonResponse(res)) as {
    ok?: boolean;
    error?: string;
    report?: {
      report_html?: string;
      version?: number;
      label?: string;
      created_at?: string;
    };
  };
  if (!res.ok || !json.ok || !json.report?.report_html) {
    throw new Error(json.error || `Erro ao carregar versão (${res.status})`);
  }
  return {
    html: json.report.report_html,
    version: json.report.version || 1,
    label: json.report.label || '',
    createdAt: json.report.created_at || '',
  };
}

export function downloadDhlOccurrenceReportBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baixa o relatório HTML completo (layout TM SEG, fotos e seções). */
export function downloadDhlOccurrenceReportHtml(html: string, filename: string): void {
  const safeName = filename.endsWith('.html') ? filename : `${filename.replace(/\.pdf$/i, '')}.html`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PRINT_FRAME_ID = 'dhl-occurrence-print-frame';

/**
 * Imprime o HTML completo na mesma página (sem pop-up).
 * Evita bloqueio do navegador ao salvar PDF com fotos e layout TM SEG.
 */
export function printDhlOccurrenceReportHtml(html: string, title?: string): void {
  const existing = document.getElementById(PRINT_FRAME_ID);
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = PRINT_FRAME_ID;
  iframe.setAttribute('title', title || 'Impressão Plano de Ação DHL');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error('Não foi possível preparar a impressão do relatório.');
  }

  doc.open();
  doc.write(html);
  doc.close();

  const runPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* usuário pode usar Baixar HTML ou imprimir pela pré-visualização */
    }
    window.setTimeout(() => iframe.remove(), 3000);
  };

  const waitForImagesThenPrint = () => {
    const images = doc ? Array.from(doc.images) : [];
    if (!images.length) {
      runPrint();
      return;
    }

    const pending = images.filter((img) => !(img.complete && img.naturalHeight > 0));
    if (!pending.length) {
      runPrint();
      return;
    }

    let remaining = pending.length;
    const maxWait = window.setTimeout(runPrint, 20000);
    const onDone = () => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearTimeout(maxWait);
        runPrint();
      }
    };

    for (const img of pending) {
      img.addEventListener('load', onDone, { once: true });
      img.addEventListener('error', onDone, { once: true });
    }
  };

  window.setTimeout(waitForImagesThenPrint, 150);
}

/** Abre HTML completo em nova aba via navegação (menos bloqueio que window.open vazio). */
export function openDhlOccurrenceReportHtmlInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** @deprecated Use printDhlOccurrenceReportHtml — mantido como alias. */
export function openDhlOccurrenceReportPrintPreview(html: string, title: string): void {
  printDhlOccurrenceReportHtml(html, title);
}
