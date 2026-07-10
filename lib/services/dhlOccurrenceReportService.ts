import { authFetch } from '../authFetch';

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

    const json = (await res.json()) as ReportJsonResponse;

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

/** Pré-visualização HTML — rápida, com fotos e textos editáveis antes do PDF. */
export async function fetchDhlOccurrenceReportPreview(
  params: GenerateDhlOccurrenceReportParams,
  onProgress?: (progress: DhlReportProgress) => void,
): Promise<{ html: string; filename: string }> {
  const json = await postOccurrenceReport(params, 'html', onProgress, PREVIEW_TIMEOUT_MS);
  if (!json.html) {
    throw new Error('Pré-visualização vazia — tente novamente.');
  }
  return {
    html: json.html,
    filename: json.filename || `PA-DHL-${params.seNumber || params.missionId}.html`,
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

/** Abre pré-visualização em nova aba para Imprimir → Salvar como PDF (com fotos). */
export function openDhlOccurrenceReportPrintPreview(html: string, title: string): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    throw new Error('Pop-up bloqueado. Permita pop-ups para salvar o PDF com fotos.');
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  popup.focus();
  window.setTimeout(() => {
    try {
      popup.print();
    } catch {
      /* usuário pode imprimir manualmente */
    }
  }, 600);
}

export function openDhlOccurrenceReportHtmlInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up bloqueado. Permita pop-ups para abrir a pré-visualização.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
