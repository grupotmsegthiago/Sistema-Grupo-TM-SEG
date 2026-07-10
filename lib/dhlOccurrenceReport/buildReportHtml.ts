import type { DhlOccurrenceReportData } from './types';
import { formatDateTimeBR, formatTimeBR } from '../dateUtils';
import { buildFullOccurrenceReportHtml } from './buildFullReportHtml';

const BRAND = {
  navy: '#0d3b66',
  wine: '#450a0a',
  wineDark: '#7f1d1d',
  light: '#e8eef4',
  text: '#1a1a1a',
  muted: '#5a6570',
};

function delayLabel(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return 'Sem atraso registrado na origem.';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')} de atraso na chegada à origem.`;
  return `${m} min de atraso na chegada à origem.`;
}

function buildEmailReferenceBlock(data: DhlOccurrenceReportData): string | null {
  const parts: string[] = [];
  const link = String(data.emailLink || '').trim();
  const attachment = String(data.emailAttachmentText || '').trim();
  if (link) parts.push(`Referência de e-mail: ${link}`);
  if (attachment) parts.push(attachment);
  return parts.length ? parts.join('\n\n') : null;
}

function buildDefaultFactsSummary(data: DhlOccurrenceReportData): string {
  const originMark = data.marks.find((m) => m.label === 'Chegada na origem');
  const scheduled = data.marks.find((m) => m.label === 'Horário programado (origem)');
  const schedTime = scheduled?.at ? formatTimeBR(scheduled.at) : '—';
  const originTime = originMark?.at ? formatTimeBR(originMark.at) : '—';

  return [
    `Na data da operação, a S.E. ${data.seNumber} estava programada para atendimento na origem às ${schedTime} (Brasília).`,
    `A chegada efetiva na origem foi registrada às ${originTime}, com ${delayLabel(data.delayMinutesAtOrigin).toLowerCase()}`,
    'A TM SEG identifica que, neste cenário específico, a indisponibilidade momentânea da viatura originalmente prevista — em razão de uma operação logística anterior ainda em encerramento — exigiu remanejamento de viatura próximo ao horário de origem.',
    'A central manteve comunicação com a DHL, orientou a equipe quanto ao endereço correto e acompanhou a missão até a conclusão em segurança.',
  ].join(' ');
}

export function buildOccurrenceNarrative(data: DhlOccurrenceReportData): {
  factsSummary: string;
  emailReference: string | null;
  rootCause: string;
  correctiveActions: string[];
  preventiveActions: string[];
} {
  const factsSummary = data.factsSummary?.trim() || buildDefaultFactsSummary(data);
  const emailReference = buildEmailReferenceBlock(data);

  const rootCause = [
    'Após apuração interna, a TM SEG compreende que a ocorrência decorreu de um descompasso pontual entre a programação da missão e a liberação da viatura prevista,',
    'sem margem suficiente para absorver o encerramento de uma operação anterior na mesma janela horária.',
    'A necessidade de remanejamento de viatura próximo ao horário de origem impactou o cumprimento do horário programado.',
    'A responsabilidade pela gestão da operação e pelo relacionamento com o cliente é da TM SEG; tratamos o episódio com transparência e foco em melhoria contínua.',
  ].join(' ');

  const correctiveActions = [
    'Revisão imediata do planejamento de capacidade para missões críticas DHL na região, com confirmação de viatura dedicada antes do horário de origem.',
    'Reforço do monitoramento em janela pré-operacional (intervalos reduzidos nas 2 horas que antecedem a origem).',
    'Fluxo de acionamento de viatura substituta assim que houver indício de risco de atraso, com comunicação proativa à DHL.',
    'Registro formal da ocorrência e alinhamento interno com a equipe operacional responsável pelo acompanhamento da missão.',
  ];

  const preventiveActions = [
    'Checklist de confirmação de origem (GPS + contato ativo com a equipe) em 100% das missões DHL com S.E.',
    'Validação diária de capacidade de viaturas versus compromissos D+1 na região de operação.',
    'Relatório semanal de pontualidade DHL à equipe de gerenciamento de risco durante o ciclo de estabilização.',
    'Reunião de alinhamento com a rede de parceiros da base para reforço de SLA e comunicação de risco — sem exposição nominal em relatórios ao cliente.',
  ];

  return { factsSummary, emailReference, rootCause, correctiveActions, preventiveActions };
}

export function buildOccurrenceReportHtml(
  data: DhlOccurrenceReportData,
  options?: { publicBaseUrl?: string; logoDataUri?: string },
): string {
  return buildFullOccurrenceReportHtml(data, options);
}
