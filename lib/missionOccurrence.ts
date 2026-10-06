import { UF_TO_REGION } from './financialUtils';

/** Texto do aviso no cartão quando a OS já tem ocorrência salva. */
export const OCCURRENCE_BANNER = 'Essa OS possui ocorrências, verificar..';

const UFS = new Set(Object.keys(UF_TO_REGION));
const CODIGO_PLUS = /\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}\b/gi;
const COORDENADA = /\bLAT\s*-?\d+(?:[.,]\d+)?\s*,?\s*LNG\s*-?\d+(?:[.,]\d+)?\b/gi;

function semCodigoDeLocal(endereco: string): string {
  return String(endereco || '')
    .replace(CODIGO_PLUS, ' ')
    .replace(COORDENADA, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pareceCodigo(valor: string): boolean {
  const texto = valor.trim();
  if (!texto || texto.includes('+')) return true;
  if (/^(BR|KM|LAT|LNG|SN|S\/N)\b/i.test(texto)) return true;
  const compacto = texto.replace(/[^A-Za-z0-9]/g, '');
  return /[A-Za-z]/.test(compacto) && /\d/.test(compacto) && !/\s/.test(texto) && compacto.length <= 12;
}

function cidadeUtil(bruto: string): string {
  const partes = bruto.split(',').map((parte) => parte.trim()).filter(Boolean);
  let cidade = (partes[partes.length - 1] || bruto).replace(/\s+/g, ' ').trim();
  cidade = cidade.replace(/^REGI[AÃ]O METROPOLITANA DE\s+/i, '').trim();
  if (!cidade || cidade.length < 3 || /^\d/.test(cidade) || pareceCodigo(cidade)) return '';
  return cidade;
}

/** Um lado da rota: "Cidade - UF". Código plus e coordenada não entram. */
export function formatarPontoRota(endereco: string): string {
  const texto = semCodigoDeLocal(endereco);
  if (!texto) return '';
  const upper = texto.toUpperCase();
  const porTraco = [...upper.matchAll(/([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9.'\s]{1,}?)\s*[-–]\s*([A-Z]{2})\b/g)]
    .filter((match) => UFS.has(match[2]));
  for (let i = porTraco.length - 1; i >= 0; i -= 1) {
    const cidade = cidadeUtil(porTraco[i][1]);
    if (cidade) return `${cidade} - ${porTraco[i][2]}`;
  }
  const porVirgula = [...upper.matchAll(/([A-ZÀ-Ý][A-ZÀ-Ý\s]{2,}?)\s*,\s*([A-Z]{2})\b/g)]
    .filter((match) => UFS.has(match[2]));
  for (let i = porVirgula.length - 1; i >= 0; i -= 1) {
    const cidade = cidadeUtil(porVirgula[i][1]);
    if (cidade) return `${cidade} - ${porVirgula[i][2]}`;
  }
  if (UFS.has(upper)) return upper;
  return '';
}

/** Rota curta do cockpit: Cidade - UF x Cidade - UF. */
export function formatarRotaCidadeUf(origem: string, destino: string): string {
  const saida = formatarPontoRota(origem);
  const chegada = formatarPontoRota(destino);
  if (saida && chegada) return `${saida} x ${chegada}`;
  return saida || chegada || 'NÃO INFORMADO';
}

const MIN_LENGTH = 5;
const MAX_LENGTH = 2000;

export function normalizeOccurrenceText(raw: string): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

export function occurrenceTextError(raw: string): string | null {
  const text = normalizeOccurrenceText(raw);
  if (text.length < MIN_LENGTH) return 'Descreva o problema para a auditoria poder verificar.';
  if (text.length > MAX_LENGTH) return 'A ocorrência passou de 2000 caracteres.';
  return null;
}

export function missionHasOccurrence(count: number | null | undefined): boolean {
  return Number(count) > 0;
}

export function isOccurrenceOpen(row: { resolved_at?: string | null }): boolean {
  return !String(row.resolved_at || '').trim();
}

export function countOpenOccurrences(rows: { resolved_at?: string | null }[]): number {
  return rows.filter(isOccurrenceOpen).length;
}

export const ROTULO_RESOLVER_OCORRENCIA = 'Resolvido';
export const ROTULO_O_QUE_FOI_FEITO = 'Informar o que foi feito';

export function resolutionTextError(raw: string): string | null {
  const text = normalizeOccurrenceText(raw);
  if (text.length < MIN_LENGTH) return 'Informe o que foi feito.';
  if (text.length > MAX_LENGTH) return 'A resolução passou de 2000 caracteres.';
  return null;
}

export type OpenOccurrenceSource = {
  id: string;
  mission_id: string;
  description: string;
  created_by?: string | null;
  created_at: string;
  evidence_url?: string | null;
  resolved_at?: string | null;
};

export type OpenOccurrenceMission = {
  id: string;
  client?: string | null;
  origin?: string | null;
  destination?: string | null;
};

export type OpenOccurrenceView = {
  id: string;
  missionId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  evidenceUrl: string | null;
  client: string;
  route: string;
  routeFull: string;
};

/** Junta a ocorrência em aberto com a OS. OS ausente não vira cliente vazio. */
export function buildOpenOccurrenceViews(
  occurrences: OpenOccurrenceSource[],
  missions: OpenOccurrenceMission[],
): OpenOccurrenceView[] {
  const byId = new Map(missions.map((mission) => [String(mission.id), mission]));
  return occurrences.filter(isOccurrenceOpen).map((row) => {
    const mission = byId.get(String(row.mission_id));
    const origin = String(mission?.origin || '').trim();
    const destination = String(mission?.destination || '').trim();
    return {
      id: row.id,
      missionId: String(row.mission_id),
      description: row.description,
      createdBy: String(row.created_by || '').trim() || 'Operador',
      createdAt: row.created_at,
      evidenceUrl: row.evidence_url || null,
      client: mission ? (String(mission.client || '').trim() || 'NÃO INFORMADO') : 'NÃO CARREGADO',
      route: mission ? formatarRotaCidadeUf(origin, destination) : 'NÃO CARREGADO',
      routeFull: mission ? ([origin, destination].filter(Boolean).join(' → ') || 'NÃO INFORMADO') : 'NÃO CARREGADO',
    };
  });
}
