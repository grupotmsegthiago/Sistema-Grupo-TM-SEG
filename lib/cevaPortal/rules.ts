/** Regras do portal externo CEVA. Login fica desligado até o fechamento do projeto. */

export const CEVA_PORTAL_LOGIN_ENABLED = false;

export type CevaPortalSession = {
  id: string;
  name: string;
  email: string;
};

export type CevaSolicitacaoDraft = {
  dataInicio: string;
  dataFim: string | null;
  solicitante: string;
  quemAutorizou: string | null;
  servico: string;
  atendimentoPgr: string | null;
  contrato: string | null;
  operacao: string | null;
  tsp: string | null;
  placa: string | null;
  motorista: string | null;
  franquiaHora: string | null;
  franquiaKm: string | null;
  filledByUserId: string;
  filledByName: string;
  filledByEmail: string;
};

export function isCevaClientName(name: string | null | undefined): boolean {
  return String(name || '').toUpperCase().includes('CEVA');
}

export function canUseCevaPortal(user: { status?: string | null; clientName?: string | null }): boolean {
  const active = String(user.status || '').trim().toLowerCase() === 'ativo';
  return active && isCevaClientName(user.clientName);
}

export function issueCevaPortalToken(userId: string | number, now = Date.now()): string {
  return `ceva-portal-${userId}-${now}`;
}

export function parseCevaPortalToken(token: string | null | undefined): string | null {
  const match = String(token || '').trim().match(/^ceva-portal-(\d+)-(\d{10,})$/);
  return match ? match[1] : null;
}

export function readPortalToken(header: string | null | undefined): string | null {
  const raw = String(header || '').replace(/^Bearer\s+/i, '').trim();
  return parseCevaPortalToken(raw);
}

function cleanText(value: unknown, max: number): string | null {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function parseBrazilDateTime(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text}:00-03:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) return `${text}-03:00`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function normalizePlate(value: unknown): string | null {
  const plate = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return plate || null;
}

/** Com login ligado, o nome da sessão vence o que o formulário enviar. */
export function solicitanteDaSessao(sessionName: string): string {
  return String(sessionName || '').trim();
}

export function buildCevaSolicitacao(
  session: CevaPortalSession | null,
  body: unknown,
): { ok: true; value: CevaSolicitacaoDraft } | { ok: false; error: string } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const solicitanteInformado = cleanText(source.solicitante, 160);
  const solicitante = CEVA_PORTAL_LOGIN_ENABLED
    ? solicitanteDaSessao(session?.name || '')
    : (solicitanteInformado || '');
  const email = CEVA_PORTAL_LOGIN_ENABLED
    ? String(session?.email || '').trim().toLowerCase()
    : 'sem-login';
  const userId = CEVA_PORTAL_LOGIN_ENABLED ? String(session?.id || '').trim() : 'aberto';
  if (!solicitante) {
    return { ok: false, error: CEVA_PORTAL_LOGIN_ENABLED ? 'Sessão sem identificação da pessoa.' : 'Informe o solicitante.' };
  }
  if (CEVA_PORTAL_LOGIN_ENABLED && (!email || !userId)) {
    return { ok: false, error: 'Sessão sem identificação da pessoa.' };
  }

  const dataInicio = parseBrazilDateTime(source.dataInicio);
  if (!dataInicio) return { ok: false, error: 'Informe a data de início.' };

  const servico = cleanText(source.servico, 120);
  if (!servico) return { ok: false, error: 'Informe o serviço.' };

  return {
    ok: true,
    value: {
      dataInicio,
      dataFim: parseBrazilDateTime(source.dataFim),
      solicitante,
      quemAutorizou: cleanText(source.quemAutorizou, 160),
      servico,
      atendimentoPgr: cleanText(source.atendimentoPgr, 300),
      contrato: cleanText(source.contrato, 160),
      operacao: cleanText(source.operacao, 160),
      tsp: cleanText(source.tsp, 160),
      placa: normalizePlate(source.placa),
      motorista: cleanText(source.motorista, 160),
      franquiaHora: cleanText(source.franquiaHora, 20),
      franquiaKm: cleanText(source.franquiaKm, 20),
      filledByUserId: userId,
      filledByName: solicitante,
      filledByEmail: email,
    },
  };
}
