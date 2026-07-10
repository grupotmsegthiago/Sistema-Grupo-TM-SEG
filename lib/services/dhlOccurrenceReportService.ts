function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type GenerateDhlOccurrenceReportParams = {
  missionId: string;
  seNumber?: string;
  factsSummary?: string;
};

export async function generateDhlOccurrenceReportPdf(
  params: GenerateDhlOccurrenceReportParams,
): Promise<Blob> {
  try {
    const res = await fetch('/api/dhl/occurrence-report', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        missionId: params.missionId,
        seNumber: params.seNumber,
        factsSummary: params.factsSummary?.trim() || undefined,
      }),
    });

    if (!res.ok) {
      let message = `Erro ao gerar relatório (${res.status})`;
      try {
        const json = await res.json();
        if (json?.error) message = String(json.error);
      } catch {
        /* mantém mensagem padrão */
      }
      throw new Error(message);
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('Falha ao gerar relatório DHL');
  }
}

export function downloadDhlOccurrenceReportBlob(blob: Blob, seNumber: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PA-DHL-${seNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
