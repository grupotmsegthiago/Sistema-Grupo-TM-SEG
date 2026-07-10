import { authFetch } from '../authFetch';

const REQUEST_TIMEOUT_MS = 90000;

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
  onProgress?: (progress: DhlReportProgress) => void,
): Promise<{ blob: Blob; filename: string }> {
  const report = (percent: number, label: string) => {
    onProgress?.({ percent: Math.min(100, Math.max(0, percent)), label });
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    report(8, 'Preparando dados da OS...');

    let waitPercent = 8;
    const waitTimer = window.setInterval(() => {
      if (waitPercent < 48) {
        waitPercent += 1;
        report(waitPercent, 'Coletando horários, fotos e evidências da OS...');
      }
    }, 1200);

    let res: Response;
    try {
      res = await authFetch('/api/dhl/occurrence-report', {
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
    } finally {
      window.clearInterval(waitTimer);
    }

    report(55, 'Montando PDF com logo TM SEG e assinatura...');

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
      report(78, 'Recebendo documento do servidor...');
      const json = (await res.json()) as PdfJsonResponse;
      if (!json.ok || !json.pdfBase64) {
        throw new Error(json.error || 'Resposta inválida ao gerar PDF');
      }
      report(92, 'Finalizando arquivo PDF...');
      const filename = json.filename || `PA-DHL-${params.seNumber || params.missionId}.pdf`;
      const blob = base64ToBlob(json.pdfBase64);
      report(100, 'Download pronto!');
      return { blob, filename };
    }

    report(85, 'Processando arquivo PDF...');
    const blob = await res.blob();
    if (!blob.size) {
      throw new Error('PDF vazio — tente novamente em alguns segundos');
    }
    report(100, 'Download pronto!');
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
