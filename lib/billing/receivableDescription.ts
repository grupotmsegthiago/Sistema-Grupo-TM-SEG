/**
 * Descrição padrão do Contas a Receber ao emitir NF de cliente.
 * Formato: "Ref. a primeira quinzena de Junho/2026"
 */

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export const CLIENT_RECEIVABLE_CATEGORY = 'Cliente';

export type QuinzenaKind = 'primeira' | 'segunda' | 'mes';

function monthYearLabel(year: number, monthIndex: number): string {
  const month = MONTH_NAMES[monthIndex] || MONTH_NAMES[0];
  return `${month}/${year}`;
}

export function formatQuinzenaReceivableDescription(
  kind: QuinzenaKind,
  year: number,
  monthIndex: number,
): string {
  const my = monthYearLabel(year, monthIndex);
  if (kind === 'mes') return `Ref. ao mês completo de ${my}`;
  if (kind === 'segunda') return `Ref. a segunda quinzena de ${my}`;
  return `Ref. a primeira quinzena de ${my}`;
}

/** Monta a descrição a partir do período do boletim (start/end). */
export function buildQuinzenaReceivableFromRange(
  startDate?: string | null,
  endDate?: string | null,
): string | null {
  if (!startDate) return null;
  const sDate = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(sDate.getTime())) return null;
  const year = sDate.getFullYear();
  const monthIndex = sDate.getMonth();
  const sDay = sDate.getDate();
  const eDate = endDate ? new Date(`${endDate}T12:00:00`) : sDate;
  const eDay = Number.isNaN(eDate.getTime()) ? sDay : eDate.getDate();
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();

  if (sDay === 1 && eDay === lastDayOfMonth) {
    return formatQuinzenaReceivableDescription('mes', year, monthIndex);
  }
  if (sDay === 1 && eDay === 15) {
    return formatQuinzenaReceivableDescription('primeira', year, monthIndex);
  }
  if (sDay === 16) {
    return formatQuinzenaReceivableDescription('segunda', year, monthIndex);
  }
  // Período parcial: usa a quinzena do dia inicial
  return formatQuinzenaReceivableDescription(
    sDay <= 15 ? 'primeira' : 'segunda',
    year,
    monthIndex,
  );
}

/** Extrai quinzena de textos já usados na NF (notes / discriminação / asaasDescription). */
export function extractQuinzenaReceivableFromText(text?: string | null): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const monthAlt = MONTH_NAMES.join('|');
  const re =
    new RegExp(
      `(?:referente\\s+ao\\s+)?(?:(1[ªa]|primeira|1)\\s*quinzena|(2[ªa]|segunda|2)\\s*quinzena|(m[eê]s\\s*completo))\\s*(?:de\\s+)?(${monthAlt})\\s*/\\s*(\\d{4})`,
      'i',
    );
  const m = raw.match(re);
  if (!m) return null;

  const monthName = m[4];
  const year = Number(m[5]);
  const monthIndex = MONTH_NAMES.findIndex(
    (n) => n.toLowerCase() === String(monthName || '').toLowerCase(),
  );
  if (monthIndex < 0 || !Number.isFinite(year)) return null;

  if (m[3]) return formatQuinzenaReceivableDescription('mes', year, monthIndex);
  if (m[2]) return formatQuinzenaReceivableDescription('segunda', year, monthIndex);
  return formatQuinzenaReceivableDescription('primeira', year, monthIndex);
}

/** Quinzena a partir de uma data de competência (dia ≤15 = primeira). */
export function buildQuinzenaReceivableFromDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const kind: QuinzenaKind = d.getDate() <= 15 ? 'primeira' : 'segunda';
  return formatQuinzenaReceivableDescription(kind, d.getFullYear(), d.getMonth());
}

/**
 * Resolve a descrição do Contas a Receber na emissão de NF.
 * Prioridade: período do boletim → texto da NF → data de competência → fallback.
 */
export function resolveClientReceivableDescription(input: {
  startDate?: string | null;
  endDate?: string | null;
  competenceDate?: string | null;
  serviceDescription?: string | null;
  notes?: string | null;
  asaasDescription?: string | null;
  fallback?: string | null;
}): string {
  const fromRange = buildQuinzenaReceivableFromRange(input.startDate, input.endDate);
  if (fromRange) return fromRange;

  const fromText =
    extractQuinzenaReceivableFromText(input.serviceDescription) ||
    extractQuinzenaReceivableFromText(input.notes) ||
    extractQuinzenaReceivableFromText(input.asaasDescription);
  if (fromText) return fromText;

  const fromDate = buildQuinzenaReceivableFromDate(input.competenceDate);
  if (fromDate) return fromDate;

  return String(input.fallback || 'Ref. a serviços prestados').slice(0, 500);
}
