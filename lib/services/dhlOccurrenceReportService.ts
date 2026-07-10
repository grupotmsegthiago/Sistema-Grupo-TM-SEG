import { authFetch } from '../authFetch';

const REQUEST_TIMEOUT_MS = 90000;

export type GenerateDhlOccurrenceReportParams = {
  missionId: string;
  seNumber?: string;
  factsSummary?: string;
  emailLink?: string;
  emailAttachmentText?: string;
};

type PdfJsonResponse = {
  ok?: boolean;
  error?: string;
  filename?: string;
  pdfBase64?: string;
};

function base64ToBlob(base64: string, contentType = 'application/pdf'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

export async function generateDhlOccurrenceReportPdf(
  params: GenerateDhlOccurrenceReportParams,
): Promise<{ blob: Blob; filename: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await authFetch('/api/dhl/occurrence-report', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        missionId: params.missionId,
        seNumber: params.seNumber,
        factsSummary: params.factsSummary?.trim() || undefined,
        emailLink: params.emailLink?.trim() || undefined,
        emailAttachmentText: params.emailAttachmentText?.trim() || undefined,
      }),
    });

    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      let message = `Erro ao gerar relatório (${res.status})`;
      try {
        const json = (await res.json()) as PdfJsonResponse;
        if (json?.error) message = String(json.error);
      } catch {
        /* mantém mensagem padrão */
      }
      throw new Error(message);
    }

    if (contentType.includes('application/json')) {
      const json = (await res.json()) as PdfJsonResponse;
      if (!json.ok || !json.pdfBase64) {
        throw new Error(json.error || 'Resposta inválida ao gerar PDF');
      }
      const filename = json.filename || `PA-DHL-${params.seNumber || params.missionId}.pdf`;
      return {
        blob: base64ToBlob(json.pdfBase64),
        filename,
      };
    }

    const blob = await res.blob();
    if (!blob.size) {
      throw new Error('PDF vazio — tente novamente em alguns segundos');
    }
    return {
      blob,
      filename: `PA-DHL-${params.seNumber || params.missionId}.pdf`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao gerar o PDF. Tente novamente.');
    }
    if (err instanceof Error) throw err;
    throw new Error('Falha ao gerar relatório DHL');
  } finally {
    window.clearTimeout(timer);
  }
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
