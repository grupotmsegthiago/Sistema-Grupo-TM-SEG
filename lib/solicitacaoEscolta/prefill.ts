// Rascunho que a OS nova lê depois que o operador confirma o fornecedor.
// O cliente fica de fora: quem confirma escolhe o cliente na própria OS.

export const CHAVE_PREFILL_SOLICITACAO = 'tmseg.solicitacaoEscolta.prefill';

export interface PrefillSolicitacaoOs {
  solicitacaoId: string;
  provider: string;
  origin: string;
  destination: string;
  imediata: boolean;
  scheduledDate: string;
  scheduledTime: string;
}

export function horarioParaOs(imediata: boolean, data: string | null, hora: string | null, agora = new Date()): { scheduledDate: string; scheduledTime: string } {
  if (!imediata) {
    return { scheduledDate: data || '', scheduledTime: hora || '' };
  }
  const scheduledDate = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const scheduledTime = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  return { scheduledDate, scheduledTime };
}

export function gravarPrefillSolicitacao(prefill: PrefillSolicitacaoOs): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(CHAVE_PREFILL_SOLICITACAO, JSON.stringify(prefill));
}

export function consumirPrefillSolicitacao(): PrefillSolicitacaoOs | null {
  if (typeof sessionStorage === 'undefined') return null;
  const bruto = sessionStorage.getItem(CHAVE_PREFILL_SOLICITACAO);
  sessionStorage.removeItem(CHAVE_PREFILL_SOLICITACAO);
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as PrefillSolicitacaoOs;
    if (!lido || typeof lido !== 'object') return null;
    if (!lido.provider || !lido.origin) return null;
    return {
      solicitacaoId: String(lido.solicitacaoId || ''),
      provider: String(lido.provider),
      origin: String(lido.origin),
      destination: String(lido.destination || ''),
      imediata: lido.imediata === true,
      scheduledDate: String(lido.scheduledDate || ''),
      scheduledTime: String(lido.scheduledTime || ''),
    };
  } catch {
    return null;
  }
}
