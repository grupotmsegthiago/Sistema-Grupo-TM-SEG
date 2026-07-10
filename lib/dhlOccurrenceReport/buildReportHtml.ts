import type { DhlOccurrenceReportData } from './types';
import { formatDateTimeBR, formatTimeBR } from '../dateUtils';

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
  rootCause: string;
  correctiveActions: string[];
  preventiveActions: string[];
} {
  const factsSummary = data.factsSummary?.trim() || buildDefaultFactsSummary(data);

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

  return { factsSummary, rootCause, correctiveActions, preventiveActions };
}

export function buildOccurrenceReportHtml(data: DhlOccurrenceReportData): string {
  const narrative = buildOccurrenceNarrative(data);
  const logoUrl = '/logo.png';
  const generatedLabel = formatDateTimeBR(data.generatedAt);

  const marksRows = data.marks
    .map((m) => {
      const when = m.at ? `${formatDateTimeBR(m.at).split(' ')[0]} ${formatTimeBR(m.at)}` : '—';
      return `<tr><td>${m.label}</td><td><strong>${when}</strong></td></tr>`;
    })
    .join('');

  const photoBlocks = data.phasePhotos
    .map((p) => {
      const when = p.at ? formatTimeBR(p.at) : '—';
      const img = p.url
        ? `<img src="${p.url}" alt="${p.label}" />`
        : `<div class="photo-missing">Evidência não registrada no sistema para esta etapa.</div>`;
      return `
        <div class="photo-card">
          <h4>${p.label} <span class="photo-time">${when}</span></h4>
          ${img}
          ${p.note && !p.url ? `<p class="photo-note">${p.note}</p>` : ''}
        </div>`;
    })
    .join('');

  const actionRows = (items: string[], prefix: string) =>
    items
      .map((text, i) => `<tr><td>${prefix}-${String(i + 1).padStart(2, '0')}</td><td>${text}</td></tr>`)
      .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Plano de Ação DHL — S.E. ${data.seNumber}</title>
  <style>
    :root {
      --brand-navy: ${BRAND.navy};
      --brand-wine: ${BRAND.wine};
      --brand-wine-dark: ${BRAND.wineDark};
      --brand-light: ${BRAND.light};
    }
    @page { size: A4; margin: 14mm 14mm 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: ${BRAND.text}; font-size: 10.5pt; line-height: 1.45; margin: 0; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--brand-wine); padding-bottom: 12px; margin-bottom: 18px; }
    .header img { height: 52px; width: auto; }
    .header-text h1 { margin: 0; font-size: 16pt; color: var(--brand-navy); }
    .header-text p { margin: 4px 0 0; color: ${BRAND.muted}; font-size: 9.5pt; }
    h2 { font-size: 11pt; color: var(--brand-navy); border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 18px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: var(--brand-light); color: var(--brand-navy); }
    .meta td:first-child { font-weight: 700; width: 34%; background: #f8fafc; }
    .summary { background: #f8fafc; border-left: 4px solid var(--brand-wine); padding: 12px 14px; margin: 10px 0 14px; }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .photo-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; page-break-inside: avoid; }
    .photo-card h4 { margin: 0 0 8px; font-size: 9.5pt; color: var(--brand-navy); }
    .photo-time { color: ${BRAND.muted}; font-weight: 600; }
    .photo-card img { width: 100%; max-height: 180px; object-fit: contain; border-radius: 4px; background: #fff; }
    .photo-missing { min-height: 72px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: ${BRAND.muted}; font-size: 8.5pt; text-align: center; padding: 8px; border-radius: 4px; }
    .signature { margin-top: 24px; display: flex; justify-content: space-between; gap: 24px; }
    .signature-box { flex: 1; border-top: 1px solid #334155; padding-top: 8px; min-height: 72px; }
    .signature-box strong { display: block; font-size: 10pt; }
    .visto { font-size: 14pt; font-weight: 700; color: var(--brand-wine-dark); letter-spacing: 0.08em; margin-bottom: 6px; }
    .footer { margin-top: 18px; font-size: 8.5pt; color: ${BRAND.muted}; text-align: center; }
  </style>
</head>
<body>
  <header class="header">
    <img src="${logoUrl}" alt="Grupo TM SEG" />
    <div class="header-text">
      <h1>Plano de Ação e Justificativa de Ocorrência</h1>
      <p>DHL Supply Chain — Operação com S.E. ${data.seNumber} · OS ${data.missionId}</p>
    </div>
  </header>

  <h2>1. Identificação</h2>
  <table class="meta">
    <tr><td>Documento</td><td>PA-DHL-${data.seNumber}</td></tr>
    <tr><td>S.E.</td><td>${data.seNumber}</td></tr>
    <tr><td>OS TM SEG</td><td>${data.missionId}</td></tr>
    <tr><td>Cliente</td><td>${data.client}</td></tr>
    <tr><td>Origem</td><td>${data.origin}</td></tr>
    <tr><td>Destino programado</td><td>${data.destination}</td></tr>
    ${data.destinationOperational ? `<tr><td>Destino operacional registrado</td><td>${data.destinationOperational}</td></tr>` : ''}
    <tr><td>Placa transportada</td><td>${data.clientVehiclePlate || '—'}</td></tr>
    <tr><td>Viatura de escolta</td><td>${data.escortVehiclePlate || '—'}</td></tr>
    <tr><td>Agentes</td><td>${data.agents.join(' / ') || '—'}</td></tr>
    <tr><td>Emissão do relatório</td><td>${generatedLabel} (Brasília)</td></tr>
  </table>

  <h2>2. Resumo dos fatos</h2>
  <div class="summary">${narrative.factsSummary}</div>

  <h2>3. Marcos operacionais (Brasília — HH:MM)</h2>
  <table>
    <thead><tr><th>Marco</th><th>Data / Hora</th></tr></thead>
    <tbody>${marksRows}</tbody>
  </table>
  <p><strong>Atraso na origem:</strong> ${delayLabel(data.delayMinutesAtOrigin)}</p>

  <h2>4. Análise e causa</h2>
  <p>${narrative.rootCause}</p>

  <h2>5. Evidências fotográficas por etapa</h2>
  <div class="photos">${photoBlocks}</div>

  <h2>6. Ações corretivas (TM SEG)</h2>
  <table><tbody>${actionRows(narrative.correctiveActions, 'AC')}</tbody></table>

  <h2>7. Ações preventivas (TM SEG)</h2>
  <table><tbody>${actionRows(narrative.preventiveActions, 'AP')}</tbody></table>

  <h2>8. Compromisso</h2>
  <p>A Grupo TM SEG reafirma seu compromisso com a operação DHL, a transparência na comunicação de ocorrências e a melhoria contínua dos processos de planejamento, monitoramento e contingência — sempre sob nossa responsabilidade como gestora da operação.</p>

  <div class="signature">
    <div class="signature-box">
      <div class="visto">VISTO</div>
      <strong>${data.directorName}</strong>
      <span>Diretoria — Grupo TM SEG</span><br />
      <span>${generatedLabel}</span>
    </div>
  </div>

  <p class="footer">Documento gerado eletronicamente pelo Sistema Grupo TM SEG em ${generatedLabel} (horário de Brasília).</p>
</body>
</html>`;
}
