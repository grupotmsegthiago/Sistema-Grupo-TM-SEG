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

/** dd/mm/aaaa ou dd/mm/aaaa hh:mm, no fuso de Brasília, sem inverter o dia. */
export function dataHoraBrasil(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const hora = Number(match[4] ?? '0');
  const minuto = Number(match[5] ?? '0');
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`;
}

/** Enquanto a pessoa digita: 22102026 0830 vira 22/10/2026 08:30. */
export function mascaraDataHora(bruto: string): string {
  const digits = String(bruto ?? '').replace(/\D/g, '').slice(0, 12);
  let texto = digits.slice(0, 2);
  if (digits.length > 2) texto += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) texto += `/${digits.slice(4, 8)}`;
  if (digits.length > 8) texto += ` ${digits.slice(8, 10)}`;
  if (digits.length > 10) texto += `:${digits.slice(10, 12)}`;
  return texto;
}

export function isoParaDataHoraBrasil(iso: string): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
}

export function parseBrazilDateTime(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const brasil = dataHoraBrasil(text);
  if (brasil) return brasil;
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
