export type FotoEvento = { rotulo: 'Origem' | 'Fim' | 'Km inicial' | 'Km final'; url: string | null };

export function urlDeEvidencia(valor: unknown): string | null {
  const texto = String(valor || '').trim();
  if (!/^https:\/\//i.test(texto)) return null;
  try {
    const url = new URL(texto);
    if (!url.pathname.includes('/mission-evidence/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function lerDetalhe(valor: unknown): Record<string, unknown> {
  if (!valor) return {};
  if (typeof valor === 'object') return valor as Record<string, unknown>;
  try {
    const lido = JSON.parse(String(valor));
    return lido && typeof lido === 'object' ? lido as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** O print de início é a única foto ligada ao momento da origem. A evidência da solicitação não entra no lugar dela. */
export function fotoOrigemDosLogs(linhas: Array<{ details?: unknown; created_at?: string | null }>): string | null {
  const ordenadas = [...linhas].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const linha of ordenadas) {
    const detalhe = lerDetalhe(linha.details);
    if (detalhe.source !== 'evidence_start_alert') continue;
    const url = urlDeEvidencia(detalhe.publicUrl);
    if (url) return url;
  }
  return null;
}

export function montarFotosEvento(entrada: {
  origem?: string | null;
  fim?: string | null;
  kmInicial?: string | null;
  kmFinal?: string | null;
}): FotoEvento[] {
  return [
    { rotulo: 'Origem', url: urlDeEvidencia(entrada.origem) },
    { rotulo: 'Fim', url: urlDeEvidencia(entrada.fim) },
    { rotulo: 'Km inicial', url: urlDeEvidencia(entrada.kmInicial) },
    { rotulo: 'Km final', url: urlDeEvidencia(entrada.kmFinal) },
  ];
}
