import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../dateUtils.js';
import { isImageEvidenceUrl } from './photoUtils.js';
import type { DhlOccurrenceReportData } from './types.js';

const BRAND = {
  red: '#dc2626',
  redDark: '#991b1b',
  black: '#111827',
  light: '#fef2f2',
  text: '#1a1a1a',
  muted: '#6b7280',
};

function esc(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDelayHuman(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return 'Sem atraso registrado na origem.';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hora${h > 1 ? 's' : ''} e ${m} minutos`;
  if (h > 0) return `${h} hora${h > 1 ? 's' : ''}`;
  return `${m} minutos`;
}

function markAt(data: DhlOccurrenceReportData, labelPart: string): string | null {
  const mark = data.marks.find((m) => m.label.toLowerCase().includes(labelPart.toLowerCase()));
  return mark?.at || null;
}

function plateLabel(plate: string | null, model: string | null): string {
  const p = String(plate || '').trim();
  const m = String(model || '').trim();
  if (p && m) return `${p} — ${m}`;
  return p || m || '—';
}

function reportStyles(): string {
  return `
    :root {
      --brand-red: ${BRAND.red};
      --brand-red-dark: ${BRAND.redDark};
      --brand-black: ${BRAND.black};
      --brand-light: ${BRAND.light};
    }
    @page { size: A4; margin: 14mm 14mm 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: ${BRAND.text}; font-size: 10pt; line-height: 1.45; margin: 0; background: #fff; }
    .cover-title { text-align: center; margin-bottom: 6px; }
    .cover-title h1 { margin: 0; font-size: 15pt; color: #fff; text-transform: uppercase; letter-spacing: 0.03em; }
    .cover-title p { margin: 4px 0 0; color: #fecaca; font-size: 10pt; }
    .header {
      display: flex; align-items: center; gap: 16px;
      background: linear-gradient(135deg, ${BRAND.black} 0%, ${BRAND.redDark} 55%, ${BRAND.red} 100%);
      border-bottom: 3px solid ${BRAND.black};
      padding: 14px 16px; margin: -0px -0px 16px; border-radius: 0 0 8px 8px;
    }
    .header img { height: 52px; width: auto; max-width: 180px; object-fit: contain; background: transparent; }
    h2 {
      font-size: 11pt; color: var(--brand-red-dark);
      border-bottom: 2px solid var(--brand-red);
      padding-bottom: 4px; margin: 16px 0 8px;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    h3, h4 {
      font-size: 10pt; color: var(--brand-black);
      margin: 12px 0 6px;
      break-after: avoid-page;
      page-break-after: avoid;
    }
    h4 { font-size: 9pt; margin: 0 0 6px; }
    /* Mantém o primeiro bloco logo após o título na mesma página */
    h2 + p, h2 + div, h2 + table, h2 + ul,
    h3 + p, h3 + div, h3 + table, h3 + ul,
    h4 + img, h4 + div {
      break-before: avoid-page;
      page-break-before: avoid;
    }
    p { orphans: 3; widows: 3; }
    table {
      width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt;
      break-inside: auto;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%); color: var(--brand-black); font-weight: 700; }
    .meta td:first-child { font-weight: 700; width: 32%; background: #fafafa; }
    .summary, .quote {
      background: linear-gradient(90deg, #fef2f2 0%, #fff 100%);
      border-left: 4px solid var(--brand-red);
      padding: 10px 12px; margin: 8px 0;
      page-break-inside: avoid; break-inside: avoid-page;
    }
    .quote { font-style: normal; }
    .section-root-cause { page-break-inside: avoid; break-inside: avoid-page; }
    .subsection {
      break-inside: avoid-page;
      page-break-inside: avoid;
      margin-bottom: 6px;
    }
    .subsection-loose {
      break-inside: auto;
      page-break-inside: auto;
      margin-bottom: 6px;
    }
    .subsection-loose > h2,
    .subsection-loose > h3 {
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; break-inside: auto; page-break-inside: auto; }
    .photo-card {
      border: 1px solid #fca5a5; border-radius: 6px; padding: 8px;
      page-break-inside: avoid; break-inside: avoid-page;
      background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
    }
    .photo-card h4 { color: var(--brand-red-dark) !important; }
    .photo-card img { width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px; background: #fff; }
    .photo-missing { min-height: 64px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: ${BRAND.muted}; font-size: 8.5pt; text-align: center; padding: 8px; border-radius: 4px; }
    .photos-all-evidence { page-break-inside: auto; }
    .photos-all-evidence .photo-card { margin-bottom: 4px; }
    .photo-meta { font-size: 7.5pt; color: ${BRAND.muted}; margin-top: 4px; }
    .timeline td:first-child { width: 28%; font-weight: 600; }
    .cronograma { font-family: ui-monospace, monospace; font-size: 8.5pt; background: #fef2f2; padding: 10px; border-radius: 6px; white-space: pre-line; border-left: 3px solid var(--brand-red); }
    .signature { margin-top: 20px; border-top: 2px solid var(--brand-black); padding-top: 8px; }
    .visto { font-size: 13pt; font-weight: 700; color: var(--brand-red-dark); letter-spacing: 0.08em; }
    .footer { margin-top: 16px; font-size: 8.5pt; color: ${BRAND.muted}; text-align: center; }
    .no-print { margin-top: 10px; padding: 8px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; font-size: 8.5pt; }
    @media print {
      .no-print { display: none !important; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .photo-card img { max-height: 220px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h2, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
      .subsection { break-inside: avoid-page; page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
    ul.compact { margin: 6px 0 6px 18px; padding: 0; }
    ul.compact li { margin-bottom: 4px; }
  `;
}

function editable(id: string): string {
  return `data-dhl-editable="${id}"`;
}

function buildRootCauseBlock(data: DhlOccurrenceReportData, provider: string): string {
  return `<div class="quote" ${editable('sec-4-3-causa-raiz')}><strong>Identificamos um descompasso no planejamento e na gestão de capacidade logística do parceiro ${esc(provider)}</strong>, com alocação de viatura ainda vinculada a operação anterior sem margem de segurança temporal, o que exigiu remanejamento e troca de VTR em campo. A TM SEG reforça junto ao parceiro o compromisso com a melhoria dos processos para que situações semelhantes não se repitam, preservando o padrão de qualidade exigido pela operação DHL.</div>`;
}

export function buildFullOccurrenceReportHtml(
  data: DhlOccurrenceReportData,
  options?: { publicBaseUrl?: string; logoDataUri?: string },
): string {
  const logoSrc = String(options?.logoDataUri || '').trim();
  const generatedLabel = formatDateTimeBR(data.generatedAt);
  const emissionDate = formatDateBR(data.generatedAt);
  const provider = data.provider || 'parceiro operacional';
  const delayHuman = formatDelayHuman(data.delayMinutesAtOrigin);
  const originArrival = markAt(data, 'Chegada na origem');
  const inTransit = markAt(data, 'Início da operação');
  const destinationArrival = markAt(data, 'Chegada no destino');
  const completed = markAt(data, 'Fim da missão');
  const scheduledOrigin = data.scheduledOriginAt;
  const missionCreated = data.missionCreatedAt;
  const scheduledMission = data.scheduledMissionAt;

  const rootCauseBlock = buildRootCauseBlock(data, provider);

  const photoBlocks = data.phasePhotos
    .map((p) => {
      const when = p.at ? formatTimeBR(p.at) : '—';
      const img = p.url && isImageEvidenceUrl(p.url)
        ? `<img src="${p.url}" alt="${esc(p.label)}" />`
        : `<div class="photo-missing">Evidência não registrada no sistema para esta etapa.</div>`;
      return `<div class="photo-card"><h4 style="margin:0 0 6px;font-size:9pt">${esc(p.label)} — ${when}</h4>${img}</div>`;
    })
    .join('');

  const allEvidenceBlocks = (data.allEvidencePhotos || [])
    .filter((e) => e.url && isImageEvidenceUrl(e.url))
    .map((e) => {
      const when = e.at ? `${formatDateBR(e.at)} ${formatTimeBR(e.at)}` : '—';
      return `<div class="photo-card">
        <h4 style="margin:0 0 6px;font-size:9pt">${esc(e.label)}</h4>
        <img src="${e.url}" alt="${esc(e.label)}" />
        <div class="photo-meta">${esc(when)} · ${esc(e.source)}</div>
      </div>`;
    })
    .join('');

  const operationalRows = [
    ['Agendamento', scheduledMission, 'mission_history — status Agendada'],
    ['Chegada na origem', originArrival, 'mission_history — status Origem'],
    ['Início da operação (saída da origem)', inTransit, 'mission_history — status Em Viagem'],
    ['Chegada no destino', destinationArrival, 'mission_history — CHEGADA NO DESTINO'],
    ['Fim da missão', completed, 'mission_history — status Concluída'],
    ['Hodômetro — KM inicial', null, data.odometerStartKm || '—'],
    ['Hodômetro — KM final', null, data.odometerEndKm || '—'],
  ]
    .map(([label, at, source]) => {
      const when = at ? `${formatDateBR(at)} ${formatTimeBR(at)}` : '—';
      const src = typeof source === 'string' && source.includes('km') ? source : String(source);
      const timeCell = typeof source === 'string' && source.includes('km') ? '—' : when;
      const sourceCell = typeof source === 'string' && source.includes('km') ? '—' : src;
      const detailCell = typeof source === 'string' && source.includes('km') ? src : sourceCell;
      return `<tr><td>${esc(String(label))}</td><td>${timeCell}</td><td>${esc(String(detailCell))}</td></tr>`;
    })
    .join('');

  const factsSummary =
    data.factsSummary?.trim()
    || `Na operação do dia ${formatDateBR(scheduledOrigin || missionCreated)}, a S.E. ${data.seNumber} estava programada para atendimento na origem às ${formatTimeBR(scheduledOrigin)}. Houve atraso na chegada à origem (${delayHuman}), com necessidade de remanejamento de viatura. A TM SEG manteve comunicação com a DHL e acompanhou a operação até a conclusão.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Plano de Ação DHL — S.E. ${esc(data.seNumber)}</title>
  <style>${reportStyles()}</style>
</head>
<body>
  <header class="header">
    ${logoSrc ? `<img src="${logoSrc}" alt="Grupo TM SEG" />` : '<div style="font-size:18pt;font-weight:700;color:#fff">GRUPO TM SEG</div>'}
    <div>
      <div class="cover-title" style="text-align:left">
        <h1>Plano de Ação e Justificativa de Ocorrência</h1>
        <p>Operação FOXCONN / Apple — DHL Supply Chain</p>
      </div>
    </div>
  </header>

  <table class="meta">
    <tr><td>Documento</td><td>PA-DHL-${esc(data.seNumber)}</td></tr>
    <tr><td>Data de emissão</td><td>${emissionDate}</td></tr>
    <tr><td>Elaborado por</td><td>Grupo TM SEG — Operações / Gerenciamento de Risco</td></tr>
    <tr><td>Destinatário</td><td>DHL Supply Chain — Gerenciamento de Risco</td></tr>
    <tr><td>Contato DHL</td><td>Patrick Carneiro Almeida — Transportation Security Coordinator</td></tr>
    <tr><td>Classificação</td><td>Uso operacional — apresentação ao cliente final</td></tr>
  </table>

  <div class="subsection">
  <h2>1. Objetivo do documento</h2>
  <p>Formalizar, de forma estruturada e transparente, a justificativa do atraso registrado na operação de escolta vinculada à <strong>S.E. nº ${esc(data.seNumber)}</strong>, bem como o plano de ação com medidas corretivas e preventivas adotadas pela TM SEG, visando a apresentação à DHL Supply Chain e ao cliente final (Foxconn / Apple).</p>
  </div>

  <div class="subsection">
  <h2>2. Identificação da ocorrência</h2>
  <table class="meta">
    <tr><td>Data da operação</td><td>${formatDateBR(scheduledOrigin || missionCreated)}</td></tr>
    <tr><td>Nº S.E.</td><td>${esc(data.seNumber)}</td></tr>
    <tr><td>Nº OS TM SEG</td><td>${esc(data.missionId)}</td></tr>
    <tr><td>Placa transportada (cliente)</td><td>${esc(plateLabel(data.clientVehiclePlate, data.clientVehicleModel))}</td></tr>
    <tr><td>Viatura escolta (parceiro)</td><td>${esc(plateLabel(data.escortVehiclePlate, data.escortVehicleModel))}</td></tr>
    <tr><td>Cliente</td><td>${esc(data.client)}</td></tr>
    <tr><td>Operação</td><td>FOXCONN / Apple</td></tr>
    <tr><td>Local de origem</td><td>${esc(data.origin)}</td></tr>
    <tr><td>Destino operacional</td><td>${esc(data.destinationOperational || data.destination)}</td></tr>
    <tr><td>Horário programado (origem)</td><td>${formatDateBR(scheduledOrigin)} — ${formatTimeBR(scheduledOrigin)} (Brasília)</td></tr>
    <tr><td>Chegada na origem (registro sistêmico)</td><td>${formatDateBR(originArrival)} — ${formatTimeBR(originArrival)} (Brasília)</td></tr>
    <tr><td>Atraso na origem</td><td>${delayHuman}</td></tr>
    <tr><td>Data/hora de abertura da OS</td><td>${missionCreated ? `${formatDateBR(missionCreated)} às ${formatTimeBR(missionCreated)} (Brasília)` : '—'}</td></tr>
    <tr><td>Fornecedor operacional (parceiro)</td><td>${esc(provider)}</td></tr>
    <tr><td>Agentes</td><td>${esc(data.agents.join(' / ') || '—')}</td></tr>
    <tr><td>Emissão do relatório</td><td>${generatedLabel} (Brasília)</td></tr>
  </table>
  </div>

  <div class="subsection-loose">
  <h2>3. Descrição dos fatos (5W2H)</h2>
  <div class="summary" ${editable('facts-summary')}>${esc(factsSummary).replace(/\n/g, '<br/>')}</div>

  <table>
    <thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td>O quê?</td><td>Atraso na chegada da equipe de escolta à origem e deslocamento inicial da viatura para endereço divergente do programado (destino em vez de origem).</td></tr>
      <tr><td>Quando?</td><td>Operação do dia ${formatDateBR(scheduledOrigin)}, com horário contratual de atendimento às ${formatTimeBR(scheduledOrigin)} na origem.</td></tr>
      <tr><td>Onde?</td><td>Origem: ${esc(data.origin)}.</td></tr>
      <tr><td>Quem?</td><td ${editable('5w2h-quem')}>Equipe S.E. ${esc(data.seNumber)}, executada pelo parceiro ${esc(provider)}, sob gestão operacional da TM SEG.</td></tr>
      <tr><td>Por quê?</td><td ${editable('5w2h-porque')}>Falha no planejamento logístico do parceiro e necessidade de remanejamento/troca de viatura em campo.</td></tr>
      <tr><td>Como?</td><td ${editable('5w2h-como')}>A viatura designada não concluiu a operação anterior a tempo; houve troca de VTR em deslocamento e orientação da central para correção de rota.</td></tr>
      <tr><td>Impacto?</td><td ${editable('5w2h-impacto')}>Comprometimento do cronograma operacional do cliente e desgaste operacional em operação de alta criticidade.</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection">
  <h3>3.1 Linha do tempo resumida</h3>
  <table class="timeline">
    <tr><td>${missionCreated ? `${formatDateBR(missionCreated)} — ${formatTimeBR(missionCreated)}` : '—'}</td><td>OS ${esc(data.missionId)} criada no sistema TM SEG (S.E. ${esc(data.seNumber)}).</td></tr>
    <tr><td>${scheduledMission ? `${formatDateBR(scheduledMission)} — ${formatTimeBR(scheduledMission)}` : '—'}</td><td>Missão agendada com ${esc(provider)} e equipe designada.</td></tr>
    <tr><td>${formatDateBR(scheduledOrigin)} — ${formatTimeBR(scheduledOrigin)}</td><td>Horário programado de chegada à origem.</td></tr>
    <tr><td>${formatDateBR(originArrival)} — ${formatTimeBR(originArrival)}</td><td><strong>Chegada na origem</strong> — registro sistêmico (status Origem).</td></tr>
    <tr><td>${formatDateBR(inTransit)} — ${formatTimeBR(inTransit)}</td><td>Saída da origem / início da operação (status Em Viagem).</td></tr>
    <tr><td>${formatDateBR(destinationArrival)} — ${formatTimeBR(destinationArrival)}</td><td><strong>Chegada no destino</strong> — registro sistêmico.</td></tr>
    <tr><td>${formatDateBR(completed)} — ${formatTimeBR(completed)}</td><td><strong>Fim da missão</strong> — status Concluída.</td></tr>
  </table>
  </div>

  <div class="subsection">
  <h3>3.2 Registro operacional oficial (sistema TM SEG)</h3>
  <table>
    <thead><tr><th>Marco operacional</th><th>Data / Hora</th><th>Fonte no sistema</th></tr></thead>
    <tbody>${operationalRows}</tbody>
  </table>
  ${data.destinationOperational ? `<p><strong>Endereço registrado na chegada ao destino:</strong> ${esc(data.destinationOperational)}.</p>` : ''}
  </div>

  <div class="subsection-loose">
  <h3>3.3 Evidências fotográficas por etapa</h3>
  <div class="photos">${photoBlocks}</div>
  </div>

  ${allEvidenceBlocks ? `
  <div class="subsection-loose">
  <h3>3.4 Todas as evidências registradas no sistema</h3>
  <p style="font-size:9pt;color:${BRAND.muted};margin:4px 0 8px">Inclui prints e anexos da <strong>Atualizar OS</strong>, criação da OS, hodômetro, espelhamento, deslocamento DHL e demais uploads em <code>mission-evidence</code>.</p>
  <div class="photos photos-all-evidence">${allEvidenceBlocks}</div>
  </div>
  ` : ''}

  <h2>4. Justificativa do atraso e análise de causa raiz</h2>
  <div class="subsection">
  <h3>4.1 Síntese executiva</h3>
  <p ${editable('sec-4-1-sintese')}>O atraso de <strong>${delayHuman}</strong> na chegada à origem da S.E. ${esc(data.seNumber)} não decorreu de falha no aceite ou no registro da missão pela TM SEG. A OS foi aberta em <strong>${missionCreated ? `${formatDateBR(missionCreated)} às ${formatTimeBR(missionCreated)}` : '—'}</strong>. A ocorrência está associada a um descompasso pontual na execução operacional do parceiro, já acionado para alinhamento e melhoria contínua.</p>
  </div>

  <div class="subsection">
  <h3>4.2 Versão do parceiro</h3>
  <p ${editable('sec-4-2-parceiro')}>O fornecedor informou necessidade de <strong>troca de viatura (VTR) no meio do percurso</strong>. A TM SEG segue apurando os detalhes operacionais para consolidar o entendimento completo dos fatos, com foco em prevenção de reincidência.</p>
  </div>

  <div class="subsection section-root-cause">
  <h3>4.3 Conclusão da apuração TM SEG (causa raiz)</h3>
  ${rootCauseBlock}
  </div>

  <div class="subsection">
  <h3>4.4 Análise complementar — método dos 5 Porquês</h3>
  <table>
    <thead><tr><th>Nível</th><th>Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Por que houve atraso na origem?</td><td>A viatura chegou à origem somente às ${formatTimeBR(originArrival)} (registro sistêmico).</td></tr>
      <tr><td>2</td><td>Por que a viatura não chegou no horário programado?</td><td ${editable('5pq-2')}>Foi necessário reorganizar a VTR durante o deslocamento.</td></tr>
      <tr><td>3</td><td>Por que foi necessário reorganizar a VTR?</td><td ${editable('5pq-3')}>A viatura designada não estava disponível a tempo para assumir a missão.</td></tr>
      <tr><td>4</td><td>Por que a viatura não estava disponível?</td><td ${editable('5pq-4')}>Havia sobreposição com outra operação, sem desalocação com antecedência suficiente.</td></tr>
      <tr><td>5</td><td>Por que não houve substituição preventiva?</td><td ${editable('5pq-5')}>O fluxo de backup não foi acionado com a antecedência necessária; a TM SEG foi informada em momento posterior ao ideal.</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection-loose">
  <h2>5. Ações de contenção (imediatas — já executadas)</h2>
  <table>
    <thead><tr><th>#</th><th>Ação</th><th>Status</th><th>Data</th></tr></thead>
    <tbody>
      <tr><td>C1</td><td>Comunicação imediata à DHL assim que identificada a necessidade de troca de viatura</td><td>Concluída</td><td>${formatDateBR(scheduledOrigin)}</td></tr>
      <tr><td>C2</td><td>Orientação da equipe para correção de rota (destino → origem)</td><td>Concluída</td><td>${formatDateBR(scheduledOrigin)}</td></tr>
      <tr><td>C3</td><td>Acompanhamento operacional contínuo até a conclusão da missão</td><td>Concluída</td><td>${formatDateBR(completed)}</td></tr>
      <tr><td>C4</td><td ${editable('contencao-c4')}>Alinhamento formal e apuração junto ao parceiro, com plano de melhoria</td><td>Concluída</td><td>${emissionDate}</td></tr>
      <tr><td>C5</td><td>Retorno formal à DHL com relato estruturado dos fatos</td><td>Concluída</td><td>${emissionDate}</td></tr>
    </tbody>
  </table>
  </div>

  <h2>6. Plano de ação — medidas corretivas e preventivas</h2>
  <div class="subsection-loose">
  <h3>6.1 Ações corretivas</h3>
  <table>
    <thead><tr><th>ID</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Indicador</th></tr></thead>
    <tbody>
      <tr><td>AC-01</td><td ${editable('ac-01')}>Concluir apuração documentada com o parceiro e plano de melhoria para evitar reincidência</td><td>Coordenação Operacional TM SEG</td><td>17/07/2026</td><td>Termo arquivado</td></tr>
      <tr><td>AC-02</td><td>Registro formal no scorecard de fornecedores e reforço de SLA</td><td>Gestão de Fornecedores TM SEG</td><td>14/07/2026</td><td>Registro no sistema</td></tr>
      <tr><td>AC-03</td><td>Revisão temporária de alocação em missões críticas DHL/Foxconn até conclusão das ações</td><td>Coordenação Operacional TM SEG</td><td>Imediato</td><td>Plano de capacidade validado</td></tr>
      <tr><td>AC-04</td><td>Plano de capacidade diário do parceiro (VTRs × missões) até D-1 às 18:00</td><td>${esc(provider)} / TM SEG</td><td>14/07/2026</td><td>Planilha conferida</td></tr>
      <tr><td>AC-05</td><td>Reunião de alinhamento operacional (SLA, janelas, substituição)</td><td>Coordenação Operacional TM SEG</td><td>16/07/2026</td><td>Ata assinada</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection-loose">
  <h3>6.2 Ações preventivas</h3>
  <table>
    <thead><tr><th>ID</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Indicador</th></tr></thead>
    <tbody>
      <tr><td>AP-01</td><td>Monitoramento reduzido (15 min) nas 2 h que antecedem a origem</td><td>Central de Monitoramento TM SEG</td><td>14/07/2026</td><td>Log ≤ 15 min</td></tr>
      <tr><td>AP-02</td><td>Gatilho automático de risco e viatura de backup na região</td><td>Coordenação Operacional TM SEG</td><td>21/07/2026</td><td>Simulação documentada</td></tr>
      <tr><td>AP-03</td><td>Check-in GPS + confirmação verbal de origem antes do horário</td><td>Central de Monitoramento TM SEG</td><td>14/07/2026</td><td>100% missões DHL</td></tr>
      <tr><td>AP-04</td><td>Reunião de reforço com parceiros da base Sudeste DHL</td><td>Gestão de Fornecedores TM SEG</td><td>24/07/2026</td><td>Lista de presença</td></tr>
      <tr><td>AP-05</td><td>Briefing de aceite: VTR dedicada sem sobreposição de janela</td><td>Coordenação Operacional TM SEG</td><td>14/07/2026</td><td>Checklist no aceite</td></tr>
      <tr><td>AP-06</td><td>Reporte semanal de desempenho DHL (4 semanas)</td><td>Coordenação Operacional TM SEG</td><td>Semanal</td><td>Relatório às segundas</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection">
  <h3>6.3 Cronograma consolidado</h3>
  <div class="cronograma">${emissionDate} ──● Emissão deste plano de ação
14/07/2026 ──● AP-01, AP-03, AP-05 em vigor | AC-02, AC-04 iniciados
16/07/2026 ──● AC-05 — Reunião ${esc(provider)}
17/07/2026 ──● AC-01 concluído | AP-06 — 1º relatório semanal
21/07/2026 ──● AP-02 — Protocolo de backup operacional
24/07/2026 ──● AP-04 — Reunião geral de parceiros Sudeste
14/08/2026 ──● Encerramento do ciclo de acompanhamento intensivo (4 semanas)</div>
  </div>

  <div class="subsection-loose">
  <h2>7. Indicadores de acompanhamento (KPIs)</h2>
  <table>
    <thead><tr><th>Indicador</th><th>Meta</th><th>Frequência</th><th>Responsável</th></tr></thead>
    <tbody>
      <tr><td>Pontualidade na origem (missões DHL)</td><td>≥ 98%</td><td>Semanal</td><td>Coordenação Operacional</td></tr>
      <tr><td>Tempo médio de resposta a alertas de risco</td><td>≤ 5 minutos</td><td>Por ocorrência</td><td>Central de Monitoramento</td></tr>
      <tr><td>Missões críticas com check-in pré-origem</td><td>100%</td><td>Diário</td><td>Central de Monitoramento</td></tr>
      <tr><td>Ocorrências de troca de VTR em campo (DHL)</td><td>0</td><td>Mensal</td><td>Gestão de Fornecedores</td></tr>
      <tr><td>Reincidência do parceiro em operações DHL</td><td>0</td><td>Mensal</td><td>Gestão de Fornecedores</td></tr>
    </tbody>
  </table>
  <p ${editable('sec-7-referencia')}><em>Referência histórica TM SEG: mais de 380 missões aceitas e realizadas na operação DHL, sendo esta a primeira ocorrência de atraso significativo.</em></p>
  </div>

  <div class="subsection">
  <h2>8. Compromisso da TM SEG</h2>
  <ul class="compact">
    <li ${editable('commit-1')}>Transparência total na comunicação de ocorrências e planos de ação.</li>
    <li ${editable('commit-2')}>Trabalho conjunto com parceiros para elevar o padrão operacional e cumprir os SLAs acordados.</li>
    <li ${editable('commit-3')}>Melhoria contínua dos processos de monitoramento, substituição e prevenção.</li>
    <li ${editable('commit-4')}>Acompanhamento ativo com relatórios periódicos à DHL durante o período de estabilização.</li>
  </ul>
  </div>

  <div class="subsection">
  <h2>9. Anexos e registros de apoio</h2>
  <table>
    <thead><tr><th>Anexo</th><th>Descrição</th></tr></thead>
    <tbody>
      <tr><td>A</td><td>Registro de abertura da OS ${esc(data.missionId)} / S.E. ${esc(data.seNumber)}</td></tr>
      <tr><td>B</td><td>Marcos operacionais com horários (Seção 3.2)</td></tr>
      <tr><td>C</td><td>Evidências fotográficas por etapa (Seção 3.3)</td></tr>
      <tr><td>D</td><td>Todas as evidências do sistema — Atualizar OS e anexos (Seção 3.4)</td></tr>
      <tr><td>E</td><td>Registro de contato e apuração com ${esc(provider)}</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection">
  <h2>10. Aprovação</h2>
  <table>
    <thead><tr><th>Função</th><th>Nome</th><th>Assinatura</th><th>Data</th></tr></thead>
    <tbody>
      <tr><td>Direção / Operações</td><td>${esc(data.directorName)}</td><td>_______________________</td><td>${emissionDate}</td></tr>
      <tr><td>Coordenação Operacional</td><td>_______________________</td><td>_______________________</td><td>___/___/2026</td></tr>
    </tbody>
  </table>
  </div>

  <div class="subsection">
  <div class="signature">
    <div class="visto">VISTO</div>
    <strong>${esc(data.directorName)}</strong><br />
    Diretoria — Grupo TM SEG<br />
    ${generatedLabel}
  </div>
  </div>

  <p class="footer">Documento gerado eletronicamente pelo Sistema Grupo TM SEG em ${generatedLabel} (horário de Brasília).<br />
  contato: thiago@grupotmseg.com.br | sistema.grupotmseg.com.br</p>
  <p class="no-print">Para salvar em PDF: use <strong>Salvar PDF completo</strong> → Imprimir → <strong>Salvar como PDF</strong>.</p>
</body>
</html>`;
}
