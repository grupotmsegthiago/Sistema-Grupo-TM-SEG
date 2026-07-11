"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/dhlOccurrenceReport/generateReportOutput.ts
var generateReportOutput_exports = {};
__export(generateReportOutput_exports, {
  dhlOccurrenceReportFilename: () => dhlOccurrenceReportFilename,
  generateDhlOccurrenceReportHtml: () => generateDhlOccurrenceReportHtml,
  generateDhlOccurrenceReportPdf: () => generateDhlOccurrenceReportPdf
});
module.exports = __toCommonJS(generateReportOutput_exports);
var import_jspdf = require("jspdf");
var import_supabase_js3 = require("@supabase/supabase-js");

// lib/dateUtils.ts
var TMSEG_TIMEZONE = "America/Sao_Paulo";
var TZ = TMSEG_TIMEZONE;
var TIME_HM = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ
};
var DATE_SHORT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TZ
};
var DATETIME_SHORT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ
};
function toDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
var formatDateBR = (date) => {
  const d = toDate(date);
  if (!d) return "\u2014";
  return d.toLocaleDateString("pt-BR", DATE_SHORT);
};
var formatDateTimeBR = (date) => {
  const d = toDate(date);
  if (!d) return "\u2014";
  return d.toLocaleString("pt-BR", DATETIME_SHORT);
};
var formatTimeBR = (date, fallback = "\u2014") => {
  const d = toDate(date);
  if (!d) return fallback;
  return d.toLocaleTimeString("pt-BR", TIME_HM);
};

// lib/dhlOccurrenceReport/photoUtils.ts
function isImageEvidenceUrl(url) {
  const clean = String(url || "").trim().split("?")[0].toLowerCase();
  if (!clean) return false;
  if (/\.(pdf|doc|docx|eml|msg)$/i.test(clean)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(clean)) return true;
  return clean.includes("/storage/v1/object/public/");
}

// lib/dhlOccurrenceReport/buildFullReportHtml.ts
var BRAND = {
  red: "#dc2626",
  redDark: "#991b1b",
  black: "#111827",
  light: "#fef2f2",
  text: "#1a1a1a",
  muted: "#6b7280"
};
function esc(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatDelayHuman(minutes) {
  if (minutes == null || minutes <= 0) return "Sem atraso registrado na origem.";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hora${h > 1 ? "s" : ""} e ${m} minutos`;
  if (h > 0) return `${h} hora${h > 1 ? "s" : ""}`;
  return `${m} minutos`;
}
function markAt(data, labelPart) {
  const mark = data.marks.find((m) => m.label.toLowerCase().includes(labelPart.toLowerCase()));
  return mark?.at || null;
}
function plateLabel(plate, model) {
  const p = String(plate || "").trim();
  const m = String(model || "").trim();
  if (p && m) return `${p} \u2014 ${m}`;
  return p || m || "\u2014";
}
function reportStyles() {
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
      page-break-after: avoid; break-after: avoid-page;
    }
    h3 { font-size: 10pt; color: var(--brand-black); margin: 12px 0 6px; page-break-after: avoid; break-after: avoid-page; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; page-break-inside: avoid; break-inside: avoid-page; }
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
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; page-break-inside: avoid; }
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
    @media print { .no-print { display: none !important; } .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    ul.compact { margin: 6px 0 6px 18px; padding: 0; }
    ul.compact li { margin-bottom: 4px; }
  `;
}
function editable(id) {
  return `data-dhl-editable="${id}"`;
}
function buildRootCauseBlock(data, provider) {
  return `<div class="quote" ${editable("sec-4-3-causa-raiz")}><strong>Identificamos um descompasso no planejamento e na gest\xE3o de capacidade log\xEDstica do parceiro ${esc(provider)}</strong>, com aloca\xE7\xE3o de viatura ainda vinculada a opera\xE7\xE3o anterior sem margem de seguran\xE7a temporal, o que exigiu remanejamento e troca de VTR em campo. A TM SEG refor\xE7a junto ao parceiro o compromisso com a melhoria dos processos para que situa\xE7\xF5es semelhantes n\xE3o se repitam, preservando o padr\xE3o de qualidade exigido pela opera\xE7\xE3o DHL.</div>`;
}
function buildFullOccurrenceReportHtml(data, options) {
  const logoSrc = String(options?.logoDataUri || "").trim();
  const generatedLabel = formatDateTimeBR(data.generatedAt);
  const emissionDate = formatDateBR(data.generatedAt);
  const provider = data.provider || "parceiro operacional";
  const delayHuman = formatDelayHuman(data.delayMinutesAtOrigin);
  const originArrival = markAt(data, "Chegada na origem");
  const inTransit = markAt(data, "In\xEDcio da opera\xE7\xE3o");
  const destinationArrival = markAt(data, "Chegada no destino");
  const completed = markAt(data, "Fim da miss\xE3o");
  const scheduledOrigin = data.scheduledOriginAt;
  const missionCreated = data.missionCreatedAt;
  const scheduledMission = data.scheduledMissionAt;
  const rootCauseBlock = buildRootCauseBlock(data, provider);
  const photoBlocks = data.phasePhotos.map((p) => {
    const when = p.at ? formatTimeBR(p.at) : "\u2014";
    const img = p.url && isImageEvidenceUrl(p.url) ? `<img src="${p.url}" alt="${esc(p.label)}" crossorigin="anonymous" />` : `<div class="photo-missing">Evid\xEAncia n\xE3o registrada no sistema para esta etapa.</div>`;
    return `<div class="photo-card"><h4 style="margin:0 0 6px;font-size:9pt">${esc(p.label)} \u2014 ${when}</h4>${img}</div>`;
  }).join("");
  const allEvidenceBlocks = (data.allEvidencePhotos || []).filter((e) => e.url && isImageEvidenceUrl(e.url)).map((e) => {
    const when = e.at ? `${formatDateBR(e.at)} ${formatTimeBR(e.at)}` : "\u2014";
    return `<div class="photo-card">
        <h4 style="margin:0 0 6px;font-size:9pt">${esc(e.label)}</h4>
        <img src="${e.url}" alt="${esc(e.label)}" crossorigin="anonymous" />
        <div class="photo-meta">${esc(when)} \xB7 ${esc(e.source)}</div>
      </div>`;
  }).join("");
  const operationalRows = [
    ["Agendamento", scheduledMission, "mission_history \u2014 status Agendada"],
    ["Chegada na origem", originArrival, "mission_history \u2014 status Origem"],
    ["In\xEDcio da opera\xE7\xE3o (sa\xEDda da origem)", inTransit, "mission_history \u2014 status Em Viagem"],
    ["Chegada no destino", destinationArrival, "mission_history \u2014 CHEGADA NO DESTINO"],
    ["Fim da miss\xE3o", completed, "mission_history \u2014 status Conclu\xEDda"],
    ["Hod\xF4metro \u2014 KM inicial", null, data.odometerStartKm || "\u2014"],
    ["Hod\xF4metro \u2014 KM final", null, data.odometerEndKm || "\u2014"]
  ].map(([label, at, source]) => {
    const when = at ? `${formatDateBR(at)} ${formatTimeBR(at)}` : "\u2014";
    const src = typeof source === "string" && source.includes("km") ? source : String(source);
    const timeCell = typeof source === "string" && source.includes("km") ? "\u2014" : when;
    const sourceCell = typeof source === "string" && source.includes("km") ? "\u2014" : src;
    const detailCell = typeof source === "string" && source.includes("km") ? src : sourceCell;
    return `<tr><td>${esc(String(label))}</td><td>${timeCell}</td><td>${esc(String(detailCell))}</td></tr>`;
  }).join("");
  const factsSummary = data.factsSummary?.trim() || `Na opera\xE7\xE3o do dia ${formatDateBR(scheduledOrigin || missionCreated)}, a S.E. ${data.seNumber} estava programada para atendimento na origem \xE0s ${formatTimeBR(scheduledOrigin)}. Houve atraso na chegada \xE0 origem (${delayHuman}), com necessidade de remanejamento de viatura. A TM SEG manteve comunica\xE7\xE3o com a DHL e acompanhou a opera\xE7\xE3o at\xE9 a conclus\xE3o.`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Plano de A\xE7\xE3o DHL \u2014 S.E. ${esc(data.seNumber)}</title>
  <style>${reportStyles()}</style>
</head>
<body>
  <header class="header">
    ${logoSrc ? `<img src="${logoSrc}" alt="Grupo TM SEG" />` : '<div style="font-size:18pt;font-weight:700;color:#fff">GRUPO TM SEG</div>'}
    <div>
      <div class="cover-title" style="text-align:left">
        <h1>Plano de A\xE7\xE3o e Justificativa de Ocorr\xEAncia</h1>
        <p>Opera\xE7\xE3o FOXCONN / Apple \u2014 DHL Supply Chain</p>
      </div>
    </div>
  </header>

  <table class="meta">
    <tr><td>Documento</td><td>PA-DHL-${esc(data.seNumber)}</td></tr>
    <tr><td>Data de emiss\xE3o</td><td>${emissionDate}</td></tr>
    <tr><td>Elaborado por</td><td>Grupo TM SEG \u2014 Opera\xE7\xF5es / Gerenciamento de Risco</td></tr>
    <tr><td>Destinat\xE1rio</td><td>DHL Supply Chain \u2014 Gerenciamento de Risco</td></tr>
    <tr><td>Contato DHL</td><td>Patrick Carneiro Almeida \u2014 Transportation Security Coordinator</td></tr>
    <tr><td>Classifica\xE7\xE3o</td><td>Uso operacional \u2014 apresenta\xE7\xE3o ao cliente final</td></tr>
  </table>

  <h2>1. Objetivo do documento</h2>
  <p>Formalizar, de forma estruturada e transparente, a justificativa do atraso registrado na opera\xE7\xE3o de escolta vinculada \xE0 <strong>S.E. n\xBA ${esc(data.seNumber)}</strong>, bem como o plano de a\xE7\xE3o com medidas corretivas e preventivas adotadas pela TM SEG, visando a apresenta\xE7\xE3o \xE0 DHL Supply Chain e ao cliente final (Foxconn / Apple).</p>

  <h2>2. Identifica\xE7\xE3o da ocorr\xEAncia</h2>
  <table class="meta">
    <tr><td>Data da opera\xE7\xE3o</td><td>${formatDateBR(scheduledOrigin || missionCreated)}</td></tr>
    <tr><td>N\xBA S.E.</td><td>${esc(data.seNumber)}</td></tr>
    <tr><td>N\xBA OS TM SEG</td><td>${esc(data.missionId)}</td></tr>
    <tr><td>Placa transportada (cliente)</td><td>${esc(plateLabel(data.clientVehiclePlate, data.clientVehicleModel))}</td></tr>
    <tr><td>Viatura escolta (parceiro)</td><td>${esc(plateLabel(data.escortVehiclePlate, data.escortVehicleModel))}</td></tr>
    <tr><td>Cliente</td><td>${esc(data.client)}</td></tr>
    <tr><td>Opera\xE7\xE3o</td><td>FOXCONN / Apple</td></tr>
    <tr><td>Local de origem</td><td>${esc(data.origin)}</td></tr>
    <tr><td>Destino operacional</td><td>${esc(data.destinationOperational || data.destination)}</td></tr>
    <tr><td>Hor\xE1rio programado (origem)</td><td>${formatDateBR(scheduledOrigin)} \u2014 ${formatTimeBR(scheduledOrigin)} (Bras\xEDlia)</td></tr>
    <tr><td>Chegada na origem (registro sist\xEAmico)</td><td>${formatDateBR(originArrival)} \u2014 ${formatTimeBR(originArrival)} (Bras\xEDlia)</td></tr>
    <tr><td>Atraso na origem</td><td>${delayHuman}</td></tr>
    <tr><td>Data/hora de abertura da OS</td><td>${missionCreated ? `${formatDateBR(missionCreated)} \xE0s ${formatTimeBR(missionCreated)} (Bras\xEDlia)` : "\u2014"}</td></tr>
    <tr><td>Fornecedor operacional (parceiro)</td><td>${esc(provider)}</td></tr>
    <tr><td>Agentes</td><td>${esc(data.agents.join(" / ") || "\u2014")}</td></tr>
    <tr><td>Emiss\xE3o do relat\xF3rio</td><td>${generatedLabel} (Bras\xEDlia)</td></tr>
  </table>

  <h2>3. Descri\xE7\xE3o dos fatos (5W2H)</h2>
  <div class="summary" ${editable("facts-summary")}>${esc(factsSummary).replace(/\n/g, "<br/>")}</div>

  <table>
    <thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td>O qu\xEA?</td><td>Atraso na chegada da equipe de escolta \xE0 origem e deslocamento inicial da viatura para endere\xE7o divergente do programado (destino em vez de origem).</td></tr>
      <tr><td>Quando?</td><td>Opera\xE7\xE3o do dia ${formatDateBR(scheduledOrigin)}, com hor\xE1rio contratual de atendimento \xE0s ${formatTimeBR(scheduledOrigin)} na origem.</td></tr>
      <tr><td>Onde?</td><td>Origem: ${esc(data.origin)}.</td></tr>
      <tr><td>Quem?</td><td ${editable("5w2h-quem")}>Equipe S.E. ${esc(data.seNumber)}, executada pelo parceiro ${esc(provider)}, sob gest\xE3o operacional da TM SEG.</td></tr>
      <tr><td>Por qu\xEA?</td><td ${editable("5w2h-porque")}>Falha no planejamento log\xEDstico do parceiro e necessidade de remanejamento/troca de viatura em campo.</td></tr>
      <tr><td>Como?</td><td ${editable("5w2h-como")}>A viatura designada n\xE3o concluiu a opera\xE7\xE3o anterior a tempo; houve troca de VTR em deslocamento e orienta\xE7\xE3o da central para corre\xE7\xE3o de rota.</td></tr>
      <tr><td>Impacto?</td><td ${editable("5w2h-impacto")}>Comprometimento do cronograma operacional do cliente e desgaste operacional em opera\xE7\xE3o de alta criticidade.</td></tr>
    </tbody>
  </table>

  <h3>3.1 Linha do tempo resumida</h3>
  <table class="timeline">
    <tr><td>${missionCreated ? `${formatDateBR(missionCreated)} \u2014 ${formatTimeBR(missionCreated)}` : "\u2014"}</td><td>OS ${esc(data.missionId)} criada no sistema TM SEG (S.E. ${esc(data.seNumber)}).</td></tr>
    <tr><td>${scheduledMission ? `${formatDateBR(scheduledMission)} \u2014 ${formatTimeBR(scheduledMission)}` : "\u2014"}</td><td>Miss\xE3o agendada com ${esc(provider)} e equipe designada.</td></tr>
    <tr><td>${formatDateBR(scheduledOrigin)} \u2014 ${formatTimeBR(scheduledOrigin)}</td><td>Hor\xE1rio programado de chegada \xE0 origem.</td></tr>
    <tr><td>${formatDateBR(originArrival)} \u2014 ${formatTimeBR(originArrival)}</td><td><strong>Chegada na origem</strong> \u2014 registro sist\xEAmico (status Origem).</td></tr>
    <tr><td>${formatDateBR(inTransit)} \u2014 ${formatTimeBR(inTransit)}</td><td>Sa\xEDda da origem / in\xEDcio da opera\xE7\xE3o (status Em Viagem).</td></tr>
    <tr><td>${formatDateBR(destinationArrival)} \u2014 ${formatTimeBR(destinationArrival)}</td><td><strong>Chegada no destino</strong> \u2014 registro sist\xEAmico.</td></tr>
    <tr><td>${formatDateBR(completed)} \u2014 ${formatTimeBR(completed)}</td><td><strong>Fim da miss\xE3o</strong> \u2014 status Conclu\xEDda.</td></tr>
  </table>

  <h3>3.2 Registro operacional oficial (sistema TM SEG)</h3>
  <table>
    <thead><tr><th>Marco operacional</th><th>Data / Hora</th><th>Fonte no sistema</th></tr></thead>
    <tbody>${operationalRows}</tbody>
  </table>
  ${data.destinationOperational ? `<p><strong>Endere\xE7o registrado na chegada ao destino:</strong> ${esc(data.destinationOperational)}.</p>` : ""}

  <h3>3.3 Evid\xEAncias fotogr\xE1ficas por etapa</h3>
  <div class="photos">${photoBlocks}</div>

  ${allEvidenceBlocks ? `
  <h3>3.4 Todas as evid\xEAncias registradas no sistema</h3>
  <p style="font-size:9pt;color:${BRAND.muted};margin:4px 0 8px">Inclui prints e anexos da <strong>Atualizar OS</strong>, cria\xE7\xE3o da OS, hod\xF4metro, espelhamento, deslocamento DHL e demais uploads em <code>mission-evidence</code>.</p>
  <div class="photos photos-all-evidence">${allEvidenceBlocks}</div>
  ` : ""}

  <h2>4. Justificativa do atraso e an\xE1lise de causa raiz</h2>
  <h3>4.1 S\xEDntese executiva</h3>
  <p ${editable("sec-4-1-sintese")}>O atraso de <strong>${delayHuman}</strong> na chegada \xE0 origem da S.E. ${esc(data.seNumber)} n\xE3o decorreu de falha no aceite ou no registro da miss\xE3o pela TM SEG. A OS foi aberta em <strong>${missionCreated ? `${formatDateBR(missionCreated)} \xE0s ${formatTimeBR(missionCreated)}` : "\u2014"}</strong>. A ocorr\xEAncia est\xE1 associada a um descompasso pontual na execu\xE7\xE3o operacional do parceiro, j\xE1 acionado para alinhamento e melhoria cont\xEDnua.</p>

  <h3>4.2 Vers\xE3o do parceiro</h3>
  <p ${editable("sec-4-2-parceiro")}>O fornecedor informou necessidade de <strong>troca de viatura (VTR) no meio do percurso</strong>. A TM SEG segue apurando os detalhes operacionais para consolidar o entendimento completo dos fatos, com foco em preven\xE7\xE3o de reincid\xEAncia.</p>

  <div class="section-root-cause">
  <h3>4.3 Conclus\xE3o da apura\xE7\xE3o TM SEG (causa raiz)</h3>
  ${rootCauseBlock}
  </div>

  <h3>4.4 An\xE1lise complementar \u2014 m\xE9todo dos 5 Porqu\xEAs</h3>
  <table>
    <thead><tr><th>N\xEDvel</th><th>Pergunta</th><th>Resposta</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Por que houve atraso na origem?</td><td>A viatura chegou \xE0 origem somente \xE0s ${formatTimeBR(originArrival)} (registro sist\xEAmico).</td></tr>
      <tr><td>2</td><td>Por que a viatura n\xE3o chegou no hor\xE1rio programado?</td><td ${editable("5pq-2")}>Foi necess\xE1rio reorganizar a VTR durante o deslocamento.</td></tr>
      <tr><td>3</td><td>Por que foi necess\xE1rio reorganizar a VTR?</td><td ${editable("5pq-3")}>A viatura designada n\xE3o estava dispon\xEDvel a tempo para assumir a miss\xE3o.</td></tr>
      <tr><td>4</td><td>Por que a viatura n\xE3o estava dispon\xEDvel?</td><td ${editable("5pq-4")}>Havia sobreposi\xE7\xE3o com outra opera\xE7\xE3o, sem desaloca\xE7\xE3o com anteced\xEAncia suficiente.</td></tr>
      <tr><td>5</td><td>Por que n\xE3o houve substitui\xE7\xE3o preventiva?</td><td ${editable("5pq-5")}>O fluxo de backup n\xE3o foi acionado com a anteced\xEAncia necess\xE1ria; a TM SEG foi informada em momento posterior ao ideal.</td></tr>
    </tbody>
  </table>

  <h2>5. A\xE7\xF5es de conten\xE7\xE3o (imediatas \u2014 j\xE1 executadas)</h2>
  <table>
    <thead><tr><th>#</th><th>A\xE7\xE3o</th><th>Status</th><th>Data</th></tr></thead>
    <tbody>
      <tr><td>C1</td><td>Comunica\xE7\xE3o imediata \xE0 DHL assim que identificada a necessidade de troca de viatura</td><td>Conclu\xEDda</td><td>${formatDateBR(scheduledOrigin)}</td></tr>
      <tr><td>C2</td><td>Orienta\xE7\xE3o da equipe para corre\xE7\xE3o de rota (destino \u2192 origem)</td><td>Conclu\xEDda</td><td>${formatDateBR(scheduledOrigin)}</td></tr>
      <tr><td>C3</td><td>Acompanhamento operacional cont\xEDnuo at\xE9 a conclus\xE3o da miss\xE3o</td><td>Conclu\xEDda</td><td>${formatDateBR(completed)}</td></tr>
      <tr><td>C4</td><td ${editable("contencao-c4")}>Alinhamento formal e apura\xE7\xE3o junto ao parceiro, com plano de melhoria</td><td>Conclu\xEDda</td><td>${emissionDate}</td></tr>
      <tr><td>C5</td><td>Retorno formal \xE0 DHL com relato estruturado dos fatos</td><td>Conclu\xEDda</td><td>${emissionDate}</td></tr>
    </tbody>
  </table>

  <h2>6. Plano de a\xE7\xE3o \u2014 medidas corretivas e preventivas</h2>
  <h3>6.1 A\xE7\xF5es corretivas</h3>
  <table>
    <thead><tr><th>ID</th><th>A\xE7\xE3o</th><th>Respons\xE1vel</th><th>Prazo</th><th>Indicador</th></tr></thead>
    <tbody>
      <tr><td>AC-01</td><td ${editable("ac-01")}>Concluir apura\xE7\xE3o documentada com o parceiro e plano de melhoria para evitar reincid\xEAncia</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>17/07/2026</td><td>Termo arquivado</td></tr>
      <tr><td>AC-02</td><td>Registro formal no scorecard de fornecedores e refor\xE7o de SLA</td><td>Gest\xE3o de Fornecedores TM SEG</td><td>14/07/2026</td><td>Registro no sistema</td></tr>
      <tr><td>AC-03</td><td>Revis\xE3o tempor\xE1ria de aloca\xE7\xE3o em miss\xF5es cr\xEDticas DHL/Foxconn at\xE9 conclus\xE3o das a\xE7\xF5es</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>Imediato</td><td>Plano de capacidade validado</td></tr>
      <tr><td>AC-04</td><td>Plano de capacidade di\xE1rio do parceiro (VTRs \xD7 miss\xF5es) at\xE9 D-1 \xE0s 18:00</td><td>${esc(provider)} / TM SEG</td><td>14/07/2026</td><td>Planilha conferida</td></tr>
      <tr><td>AC-05</td><td>Reuni\xE3o de alinhamento operacional (SLA, janelas, substitui\xE7\xE3o)</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>16/07/2026</td><td>Ata assinada</td></tr>
    </tbody>
  </table>

  <h3>6.2 A\xE7\xF5es preventivas</h3>
  <table>
    <thead><tr><th>ID</th><th>A\xE7\xE3o</th><th>Respons\xE1vel</th><th>Prazo</th><th>Indicador</th></tr></thead>
    <tbody>
      <tr><td>AP-01</td><td>Monitoramento reduzido (15 min) nas 2 h que antecedem a origem</td><td>Central de Monitoramento TM SEG</td><td>14/07/2026</td><td>Log \u2264 15 min</td></tr>
      <tr><td>AP-02</td><td>Gatilho autom\xE1tico de risco e viatura de backup na regi\xE3o</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>21/07/2026</td><td>Simula\xE7\xE3o documentada</td></tr>
      <tr><td>AP-03</td><td>Check-in GPS + confirma\xE7\xE3o verbal de origem antes do hor\xE1rio</td><td>Central de Monitoramento TM SEG</td><td>14/07/2026</td><td>100% miss\xF5es DHL</td></tr>
      <tr><td>AP-04</td><td>Reuni\xE3o de refor\xE7o com parceiros da base Sudeste DHL</td><td>Gest\xE3o de Fornecedores TM SEG</td><td>24/07/2026</td><td>Lista de presen\xE7a</td></tr>
      <tr><td>AP-05</td><td>Briefing de aceite: VTR dedicada sem sobreposi\xE7\xE3o de janela</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>14/07/2026</td><td>Checklist no aceite</td></tr>
      <tr><td>AP-06</td><td>Reporte semanal de desempenho DHL (4 semanas)</td><td>Coordena\xE7\xE3o Operacional TM SEG</td><td>Semanal</td><td>Relat\xF3rio \xE0s segundas</td></tr>
    </tbody>
  </table>

  <h3>6.3 Cronograma consolidado</h3>
  <div class="cronograma">${emissionDate} \u2500\u2500\u25CF Emiss\xE3o deste plano de a\xE7\xE3o
14/07/2026 \u2500\u2500\u25CF AP-01, AP-03, AP-05 em vigor | AC-02, AC-04 iniciados
16/07/2026 \u2500\u2500\u25CF AC-05 \u2014 Reuni\xE3o ${esc(provider)}
17/07/2026 \u2500\u2500\u25CF AC-01 conclu\xEDdo | AP-06 \u2014 1\xBA relat\xF3rio semanal
21/07/2026 \u2500\u2500\u25CF AP-02 \u2014 Protocolo de backup operacional
24/07/2026 \u2500\u2500\u25CF AP-04 \u2014 Reuni\xE3o geral de parceiros Sudeste
14/08/2026 \u2500\u2500\u25CF Encerramento do ciclo de acompanhamento intensivo (4 semanas)</div>

  <h2>7. Indicadores de acompanhamento (KPIs)</h2>
  <table>
    <thead><tr><th>Indicador</th><th>Meta</th><th>Frequ\xEAncia</th><th>Respons\xE1vel</th></tr></thead>
    <tbody>
      <tr><td>Pontualidade na origem (miss\xF5es DHL)</td><td>\u2265 98%</td><td>Semanal</td><td>Coordena\xE7\xE3o Operacional</td></tr>
      <tr><td>Tempo m\xE9dio de resposta a alertas de risco</td><td>\u2264 5 minutos</td><td>Por ocorr\xEAncia</td><td>Central de Monitoramento</td></tr>
      <tr><td>Miss\xF5es cr\xEDticas com check-in pr\xE9-origem</td><td>100%</td><td>Di\xE1rio</td><td>Central de Monitoramento</td></tr>
      <tr><td>Ocorr\xEAncias de troca de VTR em campo (DHL)</td><td>0</td><td>Mensal</td><td>Gest\xE3o de Fornecedores</td></tr>
      <tr><td>Reincid\xEAncia do parceiro em opera\xE7\xF5es DHL</td><td>0</td><td>Mensal</td><td>Gest\xE3o de Fornecedores</td></tr>
    </tbody>
  </table>
  <p ${editable("sec-7-referencia")}><em>Refer\xEAncia hist\xF3rica TM SEG: mais de 380 miss\xF5es aceitas e realizadas na opera\xE7\xE3o DHL, sendo esta a primeira ocorr\xEAncia de atraso significativo.</em></p>

  <h2>8. Compromisso da TM SEG</h2>
  <ul class="compact">
    <li ${editable("commit-1")}>Transpar\xEAncia total na comunica\xE7\xE3o de ocorr\xEAncias e planos de a\xE7\xE3o.</li>
    <li ${editable("commit-2")}>Trabalho conjunto com parceiros para elevar o padr\xE3o operacional e cumprir os SLAs acordados.</li>
    <li ${editable("commit-3")}>Melhoria cont\xEDnua dos processos de monitoramento, substitui\xE7\xE3o e preven\xE7\xE3o.</li>
    <li ${editable("commit-4")}>Acompanhamento ativo com relat\xF3rios peri\xF3dicos \xE0 DHL durante o per\xEDodo de estabiliza\xE7\xE3o.</li>
  </ul>


  <h2>9. Anexos e registros de apoio</h2>
  <table>
    <thead><tr><th>Anexo</th><th>Descri\xE7\xE3o</th></tr></thead>
    <tbody>
      <tr><td>A</td><td>Registro de abertura da OS ${esc(data.missionId)} / S.E. ${esc(data.seNumber)}</td></tr>
      <tr><td>B</td><td>Marcos operacionais com hor\xE1rios (Se\xE7\xE3o 3.2)</td></tr>
      <tr><td>C</td><td>Evid\xEAncias fotogr\xE1ficas por etapa (Se\xE7\xE3o 3.3)</td></tr>
      <tr><td>D</td><td>Todas as evid\xEAncias do sistema \u2014 Atualizar OS e anexos (Se\xE7\xE3o 3.4)</td></tr>
      <tr><td>E</td><td>Registro de contato e apura\xE7\xE3o com ${esc(provider)}</td></tr>
    </tbody>
  </table>

  <h2>10. Aprova\xE7\xE3o</h2>
  <table>
    <thead><tr><th>Fun\xE7\xE3o</th><th>Nome</th><th>Assinatura</th><th>Data</th></tr></thead>
    <tbody>
      <tr><td>Dire\xE7\xE3o / Opera\xE7\xF5es</td><td>${esc(data.directorName)}</td><td>_______________________</td><td>${emissionDate}</td></tr>
      <tr><td>Coordena\xE7\xE3o Operacional</td><td>_______________________</td><td>_______________________</td><td>___/___/2026</td></tr>
    </tbody>
  </table>

  <div class="signature">
    <div class="visto">VISTO</div>
    <strong>${esc(data.directorName)}</strong><br />
    Diretoria \u2014 Grupo TM SEG<br />
    ${generatedLabel}
  </div>

  <p class="footer">Documento gerado eletronicamente pelo Sistema Grupo TM SEG em ${generatedLabel} (hor\xE1rio de Bras\xEDlia).<br />
  contato: thiago@grupotmseg.com.br | sistema.grupotmseg.com.br</p>
  <p class="no-print">Para salvar em PDF: use <strong>Salvar PDF completo</strong> \u2192 Imprimir \u2192 <strong>Salvar como PDF</strong>.</p>
</body>
</html>`;
}

// lib/dhlOccurrenceReport/buildReportHtml.ts
function delayLabel(minutes) {
  if (minutes == null || minutes <= 0) return "Sem atraso registrado na origem.";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")} de atraso na chegada \xE0 origem.`;
  return `${m} min de atraso na chegada \xE0 origem.`;
}
function buildEmailReferenceBlock(data) {
  const parts = [];
  const link = String(data.emailLink || "").trim();
  const attachment = String(data.emailAttachmentText || "").trim();
  if (link) parts.push(`Refer\xEAncia de e-mail: ${link}`);
  if (attachment) parts.push(attachment);
  return parts.length ? parts.join("\n\n") : null;
}
function buildDefaultFactsSummary(data) {
  const originMark = data.marks.find((m) => m.label === "Chegada na origem");
  const scheduled = data.marks.find((m) => m.label === "Hor\xE1rio programado (origem)");
  const schedTime = scheduled?.at ? formatTimeBR(scheduled.at) : "\u2014";
  const originTime = originMark?.at ? formatTimeBR(originMark.at) : "\u2014";
  return [
    `Na data da opera\xE7\xE3o, a S.E. ${data.seNumber} estava programada para atendimento na origem \xE0s ${schedTime} (Bras\xEDlia).`,
    `A chegada efetiva na origem foi registrada \xE0s ${originTime}, com ${delayLabel(data.delayMinutesAtOrigin).toLowerCase()}`,
    "A TM SEG identifica que, neste cen\xE1rio espec\xEDfico, a indisponibilidade moment\xE2nea da viatura originalmente prevista \u2014 em raz\xE3o de uma opera\xE7\xE3o log\xEDstica anterior ainda em encerramento \u2014 exigiu remanejamento de viatura pr\xF3ximo ao hor\xE1rio de origem.",
    "A central manteve comunica\xE7\xE3o com a DHL, orientou a equipe quanto ao endere\xE7o correto e acompanhou a miss\xE3o at\xE9 a conclus\xE3o em seguran\xE7a."
  ].join(" ");
}
function buildOccurrenceNarrative(data) {
  const factsSummary = data.factsSummary?.trim() || buildDefaultFactsSummary(data);
  const emailReference = buildEmailReferenceBlock(data);
  const rootCause = [
    "Ap\xF3s apura\xE7\xE3o interna, a TM SEG compreende que a ocorr\xEAncia decorreu de um descompasso pontual entre a programa\xE7\xE3o da miss\xE3o e a libera\xE7\xE3o da viatura prevista,",
    "sem margem suficiente para absorver o encerramento de uma opera\xE7\xE3o anterior na mesma janela hor\xE1ria.",
    "A necessidade de remanejamento de viatura pr\xF3ximo ao hor\xE1rio de origem impactou o cumprimento do hor\xE1rio programado.",
    "A responsabilidade pela gest\xE3o da opera\xE7\xE3o e pelo relacionamento com o cliente \xE9 da TM SEG; tratamos o epis\xF3dio com transpar\xEAncia e foco em melhoria cont\xEDnua."
  ].join(" ");
  const correctiveActions = [
    "Revis\xE3o imediata do planejamento de capacidade para miss\xF5es cr\xEDticas DHL na regi\xE3o, com confirma\xE7\xE3o de viatura dedicada antes do hor\xE1rio de origem.",
    "Refor\xE7o do monitoramento em janela pr\xE9-operacional (intervalos reduzidos nas 2 horas que antecedem a origem).",
    "Fluxo de acionamento de viatura substituta assim que houver ind\xEDcio de risco de atraso, com comunica\xE7\xE3o proativa \xE0 DHL.",
    "Registro formal da ocorr\xEAncia e alinhamento interno com a equipe operacional respons\xE1vel pelo acompanhamento da miss\xE3o."
  ];
  const preventiveActions = [
    "Checklist de confirma\xE7\xE3o de origem (GPS + contato ativo com a equipe) em 100% das miss\xF5es DHL com S.E.",
    "Valida\xE7\xE3o di\xE1ria de capacidade de viaturas versus compromissos D+1 na regi\xE3o de opera\xE7\xE3o.",
    "Relat\xF3rio semanal de pontualidade DHL \xE0 equipe de gerenciamento de risco durante o ciclo de estabiliza\xE7\xE3o.",
    "Reuni\xE3o de alinhamento com a rede de parceiros da base para refor\xE7o de SLA e comunica\xE7\xE3o de risco \u2014 sem exposi\xE7\xE3o nominal em relat\xF3rios ao cliente."
  ];
  return { factsSummary, emailReference, rootCause, correctiveActions, preventiveActions };
}
function buildOccurrenceReportHtml(data, options) {
  return buildFullOccurrenceReportHtml(data, options);
}

// lib/supabaseAdmin.ts
var import_supabase_js = require("@supabase/supabase-js");

// lib/supabaseDefaults.ts
var TMSEG_SUPABASE_PROJECT_REF = "ajhmmjuewdsukecaimik";
var DEFAULT_SUPABASE_URL = `https://${TMSEG_SUPABASE_PROJECT_REF}.supabase.co`;
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";

// lib/supabasePublicEnv.ts
function cleanEnv(value) {
  if (value == null) return "";
  return String(value).trim().replace(/^["']|["']$/g, "");
}
function isValidHttpUrl(url) {
  return /^https?:\/\/.+/i.test(url);
}
function extractSupabaseProjectRef(url) {
  const match = cleanEnv(url).match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1]?.toLowerCase() ?? null;
}
function decodeJwtProjectRef(key) {
  try {
    const part = cleanEnv(key).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return payload.ref?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
function isTmSegSupabaseUrl(url) {
  return extractSupabaseProjectRef(url) === TMSEG_SUPABASE_PROJECT_REF;
}
function isTmSegSupabaseAnonKey(key, expectedUrl) {
  const cleaned = cleanEnv(key);
  if (!cleaned) return false;
  const keyRef = decodeJwtProjectRef(cleaned);
  if (keyRef && keyRef !== TMSEG_SUPABASE_PROJECT_REF) return false;
  if (expectedUrl) {
    const urlRef = extractSupabaseProjectRef(expectedUrl);
    if (urlRef && keyRef && urlRef !== keyRef) return false;
  }
  return true;
}

// lib/supabaseAdmin.ts
var warnedMissingServiceRole = false;
var warnedAnonKeyAsService = false;
var warnedAnonFallback = false;
var warnedForeignProject = false;
function warnForeignProjectOnce() {
  if (warnedForeignProject) return;
  warnedForeignProject = true;
  console.warn(
    "[Supabase] Variaveis de outro projeto ignoradas \u2014 usando projeto TM SEG (ajhmmjuewdsukecaimik). Remova na Vercel envs de integracao Supabase incorretas ou alinhe SUPABASE_URL/VITE_SUPABASE_URL."
  );
}
function pickServerUrl() {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.TMSEG_SUPABASE_URL
  ];
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isValidHttpUrl(value) && isTmSegSupabaseUrl(value)) return value;
    if (isValidHttpUrl(value)) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_URL;
}
function pickServerAnonKey(url) {
  const candidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.TMSEG_SUPABASE_ANON_KEY
  ];
  for (const candidate of candidates) {
    const value = cleanEnv(candidate);
    if (isTmSegSupabaseAnonKey(value, url)) return value;
    if (value) warnForeignProjectOnce();
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}
function decodeJwtRole(key) {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return payload.role ?? null;
  } catch {
    return null;
  }
}
function getSupabaseUrl() {
  return pickServerUrl();
}
function getSupabaseAnonKey() {
  return pickServerAnonKey(getSupabaseUrl());
}
function getSupabaseServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY
  ];
  for (const candidate of candidates) {
    const key = cleanEnv(candidate);
    if (!key) continue;
    const ref = decodeJwtProjectRef(key);
    if (ref && ref !== decodeJwtProjectRef(getSupabaseUrl())) {
      warnForeignProjectOnce();
      continue;
    }
    if (decodeJwtRole(key) === "anon") {
      if (!warnedAnonKeyAsService) {
        warnedAnonKeyAsService = true;
        console.error(
          '[Supabase] SUPABASE_SERVICE_KEY cont\xE9m a chave ANON, n\xE3o service_role. Substitua pelo valor "service_role" no .env (Settings \u2192 API no Supabase).'
        );
      }
      continue;
    }
    return key;
  }
  if (!warnedMissingServiceRole) {
    warnedMissingServiceRole = true;
    console.warn(
      '[Supabase] SUPABASE_SERVICE_ROLE_KEY n\xE3o definida para o projeto TM SEG. Copie a chave "service_role" em Supabase \u2192 Settings \u2192 API e adicione na Vercel.'
    );
  }
  return "";
}
function getSupabaseServerKey() {
  const service = getSupabaseServiceRoleKey();
  if (service) return service;
  const anon = getSupabaseAnonKey();
  if (anon && !warnedAnonFallback) {
    warnedAnonFallback = true;
    console.warn("[Supabase] Servidor operando com chave ANON \u2014 algumas rotas podem falhar por RLS.");
  }
  return anon;
}
function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServerKey();
  if (!url || !key) return null;
  return (0, import_supabase_js.createClient)(url, key);
}

// lib/dhlOccurrenceReport/collectReportData.ts
var PHASE_LABELS = {
  origem: "Origem",
  em_viagem: "Em viagem",
  destino: "Chegada no destino",
  conclusao: "Conclus\xE3o da OS \u2014 KM final"
};
function parseDetails(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}
function pickUrl(details) {
  const url = details.publicUrl || details.evidenceUrl || details.url || details.imageUrl;
  if (url) return String(url);
  const filePath = String(details.filePath || details.path || "").trim();
  if (filePath) return publicStorageUrl(filePath);
  return null;
}
function formatKm(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} km`;
}
function evidenceLabel(item) {
  const map = {
    mirroring: "Espelhamento na origem",
    mirror_proof: "Comprovante espelhamento (intake DHL)",
    dhl_deslocamento_print: "Print aprova\xE7\xE3o deslocamento DHL",
    odometer_print: "Hod\xF4metro \u2014 print KM final",
    odometer_storage: "Hod\xF4metro (storage)",
    evidence_upload: "Evid\xEAncia \u2014 cria\xE7\xE3o/atualiza\xE7\xE3o OS",
    terminal_status_confirmed: "Confirma\xE7\xE3o status terminal (Atualizar OS)",
    refused_status_evidence: "Evid\xEAncia \u2014 recusa da OS",
    cancel_status_evidence: "Evid\xEAncia \u2014 cancelamento da OS",
    storage: "Arquivo mission-evidence"
  };
  const ctx = String(item.context || "").trim();
  if (ctx) return ctx;
  return map[item.actionType] || item.actionType || "Evid\xEAncia fotogr\xE1fica";
}
function evidenceSource(item) {
  if (item.filePath) return `Storage: ${item.filePath}`;
  if (item.actionType === "mirroring" || item.actionType === "mirror_proof") return "missions / dhl_supplier_intakes";
  if (item.actionType) return `system_logs \u2014 ${item.actionType}`;
  return "mission-evidence";
}
function buildAllEvidencePhotos(pool) {
  return [...pool].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return ta - tb;
  }).map((item) => ({
    url: item.url,
    label: evidenceLabel(item),
    actionType: item.actionType,
    at: item.at || null,
    source: evidenceSource(item)
  }));
}
function pushEvidence(pool, item) {
  const url = String(item.url || "").trim();
  if (!url || !isImageEvidenceUrl(url) || pool.some((p) => p.url === url)) return;
  pool.push({
    url,
    at: item.at || "",
    context: item.context || "",
    actionType: item.actionType || "",
    filePath: item.filePath || ""
  });
}
async function listStorageFiles(sb, folderPath) {
  try {
    const { data, error } = await sb.storage.from("mission-evidence").list(folderPath, {
      limit: 100,
      sortBy: { column: "created_at", order: "asc" }
    });
    if (error || !data) return [];
    return data.filter((f) => f.name && !f.name.endsWith("/")).map((f) => ({
      name: f.name,
      created_at: f.created_at || f.updated_at || "",
      fullPath: folderPath ? `${folderPath}/${f.name}` : f.name
    }));
  } catch {
    return [];
  }
}
function publicStorageUrl(storagePath) {
  const base = getSupabaseUrl();
  const clean = storagePath.replace(/^\/+/, "");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/mission-evidence/${clean}`;
}
async function collectMissionEvidence(sb, missionId, mission) {
  const pool = [];
  const mirroringUrl = String(mission.mirroring_evidence_url || "").trim();
  if (mirroringUrl) {
    pushEvidence(pool, { url: mirroringUrl, context: "Espelhamento", actionType: "mirroring" });
  }
  const deslocUrl = String(mission.dhl_deslocamento_approval_url || "").trim();
  if (deslocUrl) {
    pushEvidence(pool, { url: deslocUrl, context: "Deslocamento DHL", actionType: "dhl_deslocamento_print" });
  }
  try {
    const { data: intake } = await sb.from("dhl_supplier_intakes").select("mirror_proof_url, updated_at").eq("mission_id", missionId).maybeSingle();
    if (intake?.mirror_proof_url) {
      pushEvidence(pool, {
        url: String(intake.mirror_proof_url),
        at: String(intake.updated_at || ""),
        context: "Espelhamento intake DHL",
        actionType: "mirror_proof"
      });
    }
  } catch {
  }
  const storagePrefixes = [
    missionId,
    `odometer/${missionId}`,
    `refused/${missionId}`,
    `cancelled/${missionId}`,
    `dhl-mirror-proof/${missionId}`,
    "espelhamento"
  ];
  for (const prefix of storagePrefixes) {
    const files = await listStorageFiles(sb, prefix);
    for (const file of files) {
      if (prefix === "espelhamento" && !file.name.includes(missionId)) continue;
      let actionType = "storage";
      let context = "Arquivo mission-evidence";
      if (file.fullPath.includes("/odometer/")) {
        actionType = "odometer_storage";
        context = "Hod\xF4metro \u2014 KM final (Atualizar OS)";
      } else if (file.fullPath.includes("/refused/")) {
        actionType = "refused_status_evidence";
        context = "Evid\xEAncia \u2014 recusa da OS (Atualizar OS)";
      } else if (file.fullPath.includes("/cancelled/")) {
        actionType = "cancel_status_evidence";
        context = "Evid\xEAncia \u2014 cancelamento da OS (Atualizar OS)";
      } else if (file.fullPath.includes("/dhl-mirror-proof/")) {
        actionType = "mirror_proof";
        context = "Comprovante espelhamento (intake DHL)";
      } else if (file.fullPath.includes("/deslocamento_")) {
        actionType = "dhl_deslocamento_print";
        context = "Print aprova\xE7\xE3o deslocamento DHL";
      } else if (file.fullPath.includes("/espelhamento/")) {
        actionType = "mirroring";
        context = "Espelhamento na origem (Atualizar OS)";
      } else if (file.fullPath.startsWith(`${missionId}/`)) {
        actionType = "evidence_upload";
        context = "Evid\xEAncia \u2014 pasta da OS (cria\xE7\xE3o/atualiza\xE7\xE3o)";
      }
      pushEvidence(pool, {
        url: publicStorageUrl(file.fullPath),
        at: file.created_at,
        context,
        actionType,
        filePath: file.fullPath
      });
    }
  }
  return pool;
}
function pickDirectional(items, targetIso, used, direction, maxMs = Number.POSITIVE_INFINITY) {
  if (!targetIso || !items.length) return null;
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return null;
  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (used.has(item.url)) continue;
    const t = new Date(item.at).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = t - target;
    if (direction === "after" && delta < 0) continue;
    if (direction === "before" && delta > 0) continue;
    const diff = Math.abs(delta);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  if (best && bestDiff <= maxMs) {
    used.add(best.url);
    return best;
  }
  return null;
}
function buildPhasePhotos(input) {
  const used = /* @__PURE__ */ new Set();
  const pool = [...input.evidence];
  const pickBy = (predicate) => {
    const found = pool.find((e) => !used.has(e.url) && predicate(e));
    if (found) {
      used.add(found.url);
      return found;
    }
    return null;
  };
  const pickChronological = () => {
    const sorted = [...pool].filter((e) => !used.has(e.url)).sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return ta - tb;
    });
    const found = sorted[0] || null;
    if (found) used.add(found.url);
    return found;
  };
  const pickMirroring = () => {
    if (input.mirroringUrl && isImageEvidenceUrl(input.mirroringUrl) && !used.has(input.mirroringUrl)) {
      used.add(input.mirroringUrl);
      return { url: input.mirroringUrl, at: "", context: "Espelhamento", actionType: "mirroring", filePath: "" };
    }
    return pickBy((e) => e.actionType === "mirroring" || e.actionType === "mirror_proof") || pickBy((e) => /espelh|origem|solicita/i.test(`${e.context} ${e.actionType} ${e.filePath}`));
  };
  const pickDeslocamento = () => {
    if (input.deslocUrl && isImageEvidenceUrl(input.deslocUrl) && !used.has(input.deslocUrl)) {
      used.add(input.deslocUrl);
      return { url: input.deslocUrl, at: "", context: "Deslocamento DHL", actionType: "dhl_deslocamento_print", filePath: "" };
    }
    return pickBy((e) => e.actionType === "dhl_deslocamento_print") || pickBy((e) => /desloc/i.test(`${e.context} ${e.actionType} ${e.filePath}`));
  };
  const pickOdometerFinal = () => pickBy((e) => e.actionType === "terminal_status_confirmed") || pickBy((e) => e.actionType === "odometer_print" || e.actionType === "odometer_storage") || pickBy((e) => /\/odometer\//i.test(e.url) || /\/odometer\//i.test(e.filePath)) || pickBy((e) => /hod[oô]metr|km final|conclus|terminal/i.test(`${e.context} ${e.actionType}`));
  const originAt = input.marks.originArrival || null;
  const inTransitAt = input.marks.inTransit || null;
  const destinoAt = input.marks.destinationArrival || null;
  const completedAt = input.marks.completed || null;
  const specific = {
    origem: pickMirroring(),
    em_viagem: pickDeslocamento(),
    destino: pickBy((e) => /destino|chegada/i.test(`${e.context} ${e.actionType}`)),
    conclusao: pickOdometerFinal()
  };
  const phases = [
    {
      phase: "origem",
      at: originAt,
      resolve: () => specific.origem || pickDirectional(pool, originAt, used, "after") || pickDirectional(pool, originAt, used, "before") || pickChronological()
    },
    {
      phase: "em_viagem",
      at: inTransitAt,
      resolve: () => specific.em_viagem || pickDirectional(pool, inTransitAt, used, "after") || pickDirectional(pool, inTransitAt, used, "before") || pickChronological()
    },
    {
      phase: "destino",
      at: destinoAt,
      resolve: () => specific.destino || pickDirectional(pool, destinoAt, used, "after") || pickDirectional(pool, destinoAt, used, "before") || pickDirectional(pool, completedAt, used, "after") || pickDirectional(pool, completedAt, used, "before") || pickChronological()
    },
    {
      phase: "conclusao",
      at: completedAt,
      resolve: () => specific.conclusao || pickDirectional(pool, completedAt, used, "before") || pickDirectional(pool, completedAt, used, "after") || pickChronological()
    }
  ];
  const result = phases.map(({ phase, at, resolve }) => {
    const picked = resolve();
    return {
      phase,
      label: PHASE_LABELS[phase],
      at,
      url: picked?.url || null,
      note: picked ? picked.context : "Evid\xEAncia n\xE3o registrada no sistema para esta etapa."
    };
  });
  for (const photo of result) {
    if (photo.url) continue;
    const leftover = pool.find((e) => !used.has(e.url));
    if (leftover) {
      used.add(leftover.url);
      photo.url = leftover.url;
      photo.note = leftover.context;
    }
  }
  return result;
}
async function collectDhlOccurrenceReportData(sb, input) {
  try {
    const missionId = String(input.missionId || "").trim();
    if (!missionId) return null;
    const { data: mission } = await sb.from("missions").select("*").eq("id", missionId).maybeSingle();
    if (!mission) return null;
    const seNumber = String(mission.dhl_se_number || "").trim();
    if (!seNumber) return null;
    const [{ data: history }, { data: logs }, { data: evidenceLogs }] = await Promise.all([
      sb.from("mission_history").select("changed_at,field_name,new_value").eq("mission_id", missionId).order("changed_at", { ascending: true }),
      sb.from("system_logs").select("created_at,action_type,details,entity").eq("entity_id", missionId).order("created_at", { ascending: true }),
      sb.from("system_logs").select("created_at,action_type,details,entity").eq("entity", "MissionEvidence").eq("entity_id", missionId).order("created_at", { ascending: true })
    ]);
    const evidence = await collectMissionEvidence(sb, missionId, mission);
    const rows = history || [];
    const lastStatus = (val) => [...rows].reverse().find((h) => h.field_name === "status" && h.new_value === val)?.changed_at || null;
    const originArrival = lastStatus("Origem");
    const inTransit = lastStatus("Em Viagem");
    const completed = lastStatus("Conclu\xEDda");
    const destinationArrival = [...rows].reverse().find(
      (h) => h.field_name === "current_location" && String(h.new_value || "").toUpperCase().includes("CHEGADA NO DESTINO")
    )?.changed_at || null;
    const destinationOperational = [...rows].reverse().find(
      (h) => h.field_name === "current_location" && String(h.new_value || "").toUpperCase().includes("CHEGADA NO DESTINO")
    )?.new_value?.split("|").pop()?.trim() || null;
    let clientVehiclePlate = null;
    let clientVehicleModel = null;
    const clientVehicleId = mission.client_vehicle || mission.client_vehicle_id;
    if (clientVehicleId) {
      const { data: cv } = await sb.from("client_vehicles").select("plate,model").eq("id", clientVehicleId).maybeSingle();
      if (cv?.plate) clientVehiclePlate = cv.plate;
      if (cv?.model) clientVehicleModel = cv.model;
    }
    let escortVehiclePlate = null;
    let escortVehicleModel = null;
    if (mission.vehicle_id) {
      const { data: veh } = await sb.from("vehicles").select("plate,model").eq("id", mission.vehicle_id).maybeSingle();
      if (veh?.plate) escortVehiclePlate = veh.plate;
      if (veh?.model) escortVehicleModel = veh.model;
    }
    const scheduledMissionAt = rows.find((h) => h.field_name === "status" && h.new_value === "Agendada")?.changed_at || null;
    let odometerStartKm = formatKm(mission.start_km);
    let odometerEndKm = formatKm(mission.end_km);
    for (const log of [...logs || [], ...evidenceLogs || []]) {
      const details = parseDetails(log.details);
      const url = pickUrl(details);
      if (url) {
        pushEvidence(evidence, {
          url,
          at: String(log.created_at || details.uploadedAt || details.confirmedAt || ""),
          context: String(details.context || log.action_type || ""),
          actionType: String(log.action_type || ""),
          filePath: String(details.filePath || "")
        });
      }
      const rawKm = details.km ?? details.odometer ?? details.hodometro ?? details.hod\u00F4metro;
      if (rawKm != null) {
        const km = String(rawKm).trim();
        const ctx = String(details.context || log.action_type || "").toLowerCase();
        if (!odometerStartKm && (ctx.includes("inicial") || ctx.includes("origem") || String(log.action_type || "").includes("start"))) {
          odometerStartKm = km.includes("km") ? km : `${km} km`;
        }
        if (ctx.includes("final") || ctx.includes("conclus") || ctx.includes("terminal") || String(log.action_type || "").includes("odometer")) {
          odometerEndKm = km.includes("km") ? km : `${km} km`;
        }
      }
    }
    const marks = [
      { label: "Hor\xE1rio programado (origem)", at: mission.start_time || null },
      { label: "Chegada na origem", at: originArrival },
      { label: "In\xEDcio da opera\xE7\xE3o (sa\xEDda da origem)", at: inTransit },
      { label: "Chegada no destino", at: destinationArrival },
      { label: "Fim da miss\xE3o", at: completed || mission.end_time || null }
    ];
    let delayMinutesAtOrigin = null;
    if (mission.start_time && originArrival) {
      const scheduled = new Date(mission.start_time).getTime();
      const arrived = new Date(originArrival).getTime();
      if (Number.isFinite(scheduled) && Number.isFinite(arrived) && arrived > scheduled) {
        delayMinutesAtOrigin = Math.round((arrived - scheduled) / 6e4);
      }
    }
    const phasePhotos = buildPhasePhotos({
      marks: {
        originArrival,
        inTransit,
        destinationArrival,
        completed: completed || mission.end_time || null
      },
      evidence,
      mirroringUrl: mission.mirroring_evidence_url || null,
      deslocUrl: mission.dhl_deslocamento_approval_url || null
    });
    const allEvidencePhotos = buildAllEvidencePhotos(evidence);
    const agents = [mission.agent1, mission.agent2].filter(Boolean).map(String);
    return {
      missionId,
      seNumber,
      client: mission.client || "DHL Supply Chain",
      provider: mission.provider || "\u2014",
      origin: mission.origin || "\u2014",
      destination: mission.destination || "\u2014",
      destinationOperational,
      clientVehiclePlate,
      escortVehiclePlate,
      clientVehicleModel,
      escortVehicleModel,
      agents,
      scheduledOriginAt: mission.start_time || null,
      scheduledMissionAt,
      missionCreatedAt: mission.created_at || null,
      odometerStartKm,
      odometerEndKm,
      marks,
      phasePhotos,
      allEvidencePhotos,
      delayMinutesAtOrigin,
      factsSummary: input.factsSummary?.trim() || null,
      emailLink: input.emailLink?.trim() || null,
      emailAttachmentText: input.emailAttachmentText?.trim() || null,
      directorName: input.directorName?.trim() || "Diretoria \u2014 Grupo TM SEG",
      generatedAt: input.generatedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (err) {
    console.error("[dhlOccurrenceReport] collect:", err);
    return null;
  }
}

// lib/dhlOccurrenceReport/generateReportHtml.ts
var import_supabase_js2 = require("@supabase/supabase-js");

// lib/dhlOccurrenceReport/adjustReportHtml.ts
var EDITABLE_BLOCK_RE = /<([a-z][a-z0-9]*)[^>]*\sdata-dhl-editable="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
function extractEditableBlocks(html) {
  const blocks = [];
  const seen = /* @__PURE__ */ new Set();
  let match;
  const re = new RegExp(EDITABLE_BLOCK_RE.source, EDITABLE_BLOCK_RE.flags);
  while ((match = re.exec(html)) !== null) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    blocks.push({ id, html: match[3].trim() });
  }
  return blocks;
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function applyEditablePatches(html, patches) {
  let result = html;
  for (const [id, newInner] of Object.entries(patches)) {
    if (!id || newInner == null) continue;
    const openRe = new RegExp(
      `<([a-z][a-z0-9]*)[^>]*\\sdata-dhl-editable="${escapeRegex(id)}"[^>]*>`,
      "i"
    );
    const open = openRe.exec(result);
    if (!open) continue;
    const tagName = open[1];
    const contentStart = open.index + open[0].length;
    const tagRe = new RegExp(`<(/?)${tagName}(\\s[^>]*?)?(/?)>`, "gi");
    tagRe.lastIndex = contentStart;
    let depth = 1;
    let closeStart = -1;
    let m;
    while ((m = tagRe.exec(result)) !== null) {
      const isClosing = m[1] === "/";
      const isSelfClosing = m[3] === "/";
      if (isClosing) {
        depth -= 1;
        if (depth === 0) {
          closeStart = m.index;
          break;
        }
      } else if (!isSelfClosing) {
        depth += 1;
      }
    }
    if (closeStart === -1) continue;
    result = result.slice(0, contentStart) + newInner + result.slice(closeStart);
  }
  return result;
}
function parseGeminiAdjustmentJson(raw) {
  const trimmed = String(raw || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("A IA n\xE3o retornou JSON v\xE1lido para o ajuste.");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Resposta da IA em formato inv\xE1lido.");
  }
  const out = {};
  for (const patch of parsed.patches || []) {
    const id = String(patch.id || "").trim();
    const html = String(patch.html ?? "").trim();
    if (id && html) out[id] = html;
  }
  if (!Object.keys(out).length) {
    throw new Error("A IA n\xE3o sugeriu altera\xE7\xF5es. Tente reformular a observa\xE7\xE3o.");
  }
  return out;
}
function buildDhlReportGenerationPrompt(blocks, context) {
  return `Voc\xEA \xE9 analista s\xEAnior de opera\xE7\xF5es e gerenciamento de risco da TM SEG e vai redigir o conte\xFAdo de um Plano de A\xE7\xE3o e Justificativa de Ocorr\xEAncia para a DHL Supply Chain (opera\xE7\xE3o Foxconn/Apple).

Sua tarefa: com base em (1) DADOS DO SISTEMA (fatos reais e imut\xE1veis da miss\xE3o), (2) CONTEXTO DO E-MAIL do cliente (o problema apontado) e (3) OBSERVA\xC7\xD5ES DA DIRETORIA, escrever o conte\xFAdo de cada bloco edit\xE1vel do relat\xF3rio \u2014 explicando o que aconteceu, a causa e o plano de a\xE7\xE3o \u2014 de forma completa, coesa e profissional.

REGRAS OBRIGAT\xD3RIAS:
1. Responda APENAS com JSON v\xE1lido, sem markdown: {"patches":[{"id":"...","html":"..."}]}
2. Retorne um patch para CADA bloco fornecido (todos os ids recebidos), com o texto final adequado ao papel do bloco.
3. N\xC3O copie e cole o e-mail. Use-o apenas como fonte para entender o ocorrido e sintetizar. N\xC3O inclua cabe\xE7alhos de e-mail (De/Para/Cc/Data), assinaturas nem trechos literais.
4. N\xC3O invente fatos: use somente o que est\xE1 nos DADOS DO SISTEMA e no CONTEXTO DO E-MAIL. Preserve exatamente n\xFAmeros de S.E., OS, datas, hor\xE1rios, placas e nomes de clientes (DHL, Foxconn, Apple).
5. Em textos narrativos, prefira "parceiro" ou "fornecedor" em vez de citar o nome comercial do parceiro. Tom construtivo e profissional, sem linguagem punitiva ou acusat\xF3ria que manche a imagem do parceiro.
6. Mantenha HTML simples no campo html: <strong>, <em>, <br/> quando necess\xE1rio. Respeite o formato de cada bloco: respostas de c\xE9lula de tabela devem ser curtas e diretas; blocos de s\xEDntese/causa podem ser um par\xE1grafo.
7. Escreva em portugu\xEAs do Brasil. Se faltar informa\xE7\xE3o para algum bloco, produza um texto coerente e neutro com base no que existe, sem inventar dados factuais.

DADOS DO SISTEMA (fatos reais):
${context.factsBlock}

CONTEXTO DO E-MAIL DO CLIENTE (n\xE3o copiar; apenas sintetizar):
${context.emailText.trim() || "(sem anexo de e-mail)"}
${context.emailLink.trim() ? `Refer\xEAncia de e-mail: ${context.emailLink.trim()}` : ""}

OBSERVA\xC7\xD5ES DA DIRETORIA:
${context.userSummary.trim() || "(sem observa\xE7\xF5es adicionais)"}

BLOCOS A PREENCHER (JSON com id e conte\xFAdo atual como refer\xEAncia de formato):
${JSON.stringify(blocks.map((b) => ({ id: b.id, html_atual: b.html })), null, 2)}`;
}
async function generateDhlReportHtmlWithAi(html, context, generateText) {
  const blocks = extractEditableBlocks(html);
  if (!blocks.length) return html;
  const prompt = buildDhlReportGenerationPrompt(blocks, context);
  const response = await generateText(prompt);
  const patches = parseGeminiAdjustmentJson(response);
  return applyEditablePatches(html, patches);
}

// lib/dhlOccurrenceReport/generateReportHtml.ts
var TMSEG_LOGO_SVG_DATA_URI = "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="52" viewBox="0 0 220 52"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#111827"/><stop offset="55%" stop-color="#991b1b"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><rect width="220" height="52" rx="6" fill="url(#g)"/><text x="110" y="33" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="18" font-weight="700">GRUPO TM SEG</text></svg>`).toString("base64");
function getSupabase() {
  return createSupabaseAdminClient() ?? (0, import_supabase_js2.createClient)(getSupabaseUrl(), getSupabaseAnonKey());
}
function getPublicBaseUrl() {
  return (process.env.APP_PUBLIC_URL || process.env.SYSTEM_URL || "https://sistema.grupotmseg.com.br").replace(/\/$/, "");
}
async function resolveTmSegLogoDataUri() {
  const fetchCandidates = [
    getPublicBaseUrl(),
    "https://sistema.grupotmseg.com.br"
  ].map((base) => `${base.replace(/\/$/, "")}/logo.png`);
  for (const logoUrl of fetchCandidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1e4);
      const res = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const contentType = String(res.headers.get("content-type") || "");
      if (!contentType.includes("image")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) {
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    } catch {
    }
  }
  return TMSEG_LOGO_SVG_DATA_URI;
}
function plateLabel2(plate, model) {
  const p = String(plate || "").trim();
  const m = String(model || "").trim();
  if (p && m) return `${p} \u2014 ${m}`;
  return p || m || "\u2014";
}
function markWhen(at) {
  return at ? `${formatDateBR(at)} ${formatTimeBR(at)} (Bras\xEDlia)` : "\u2014";
}
function buildAiContext(data) {
  const facts = [
    `N\xBA S.E.: ${data.seNumber}`,
    `N\xBA OS TM SEG: ${data.missionId}`,
    `Cliente: ${data.client}`,
    `Opera\xE7\xE3o: FOXCONN / Apple`,
    `Parceiro/fornecedor operacional: ${data.provider}`,
    `Local de origem: ${data.origin}`,
    `Destino operacional: ${data.destinationOperational || data.destination}`,
    `Placa transportada (cliente): ${plateLabel2(data.clientVehiclePlate, data.clientVehicleModel)}`,
    `Viatura de escolta (parceiro): ${plateLabel2(data.escortVehiclePlate, data.escortVehicleModel)}`,
    `Agentes: ${data.agents.join(" / ") || "\u2014"}`,
    `Abertura da OS: ${markWhen(data.missionCreatedAt)}`,
    `Hor\xE1rio programado na origem: ${markWhen(data.scheduledOriginAt)}`,
    `Atraso registrado na origem (minutos): ${data.delayMinutesAtOrigin ?? 0}`,
    `Hod\xF4metro inicial: ${data.odometerStartKm || "\u2014"}`,
    `Hod\xF4metro final: ${data.odometerEndKm || "\u2014"}`,
    "Marcos operacionais (registro sist\xEAmico):",
    ...data.marks.map((m) => `  - ${m.label}: ${markWhen(m.at)}`)
  ].join("\n");
  return {
    factsBlock: facts,
    emailText: data.emailAttachmentText || "",
    emailLink: data.emailLink || "",
    userSummary: data.factsSummary || ""
  };
}
async function generateDhlOccurrenceReportHtml(input, options) {
  try {
    const sb = options?.supabaseClient ?? getSupabase();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    const logoDataUri = await resolveTmSegLogoDataUri();
    let html = buildOccurrenceReportHtml(data, {
      publicBaseUrl: getPublicBaseUrl(),
      logoDataUri
    });
    let aiGenerated = false;
    const hasEmailContext = !!(data.emailAttachmentText?.trim() || data.emailLink?.trim());
    if (options?.generateText && hasEmailContext) {
      try {
        html = await generateDhlReportHtmlWithAi(html, buildAiContext(data), options.generateText);
        aiGenerated = true;
      } catch (err) {
        console.error("[dhlOccurrenceReportHtml] IA de gera\xE7\xE3o falhou, usando template:", err);
      }
    }
    const evidenceCount = data.allEvidencePhotos?.length || 0;
    const phasePhotoCount = data.phasePhotos.filter((p) => p.url).length;
    return { html, evidenceCount, phasePhotoCount, aiGenerated };
  } catch (err) {
    console.error("[dhlOccurrenceReportHtml]", err);
    return null;
  }
}
function dhlOccurrenceReportFilename(seNumber) {
  return `PA-DHL-${seNumber}.pdf`;
}

// lib/dhlOccurrenceReport/generateReportOutput.ts
var BRAND_WINE = "#450a0a";
var BRAND_NAVY = "#0d3b66";
var BRAND_LIGHT = "#e8eef4";
var IMAGE_FETCH_TIMEOUT_MS = 8e3;
var PDF_GENERATION_TIMEOUT_MS = 55e3;
function getSupabase2() {
  return createSupabaseAdminClient() ?? (0, import_supabase_js3.createClient)(getSupabaseUrl(), getSupabaseAnonKey());
}
async function fetchWithTimeout(url, timeoutMs = IMAGE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function loadImageBase64(url) {
  try {
    const fetchUrl = url.startsWith("/") ? `${getPublicBaseUrl()}${url}` : url;
    const res = await fetchWithTimeout(fetchUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") || "image/png";
    const fmt = ctype.includes("png") ? "PNG" : "JPEG";
    return `data:image/${fmt.toLowerCase()};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
function ensureSpace(doc, y, need, margin) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}
function wrapText(doc, text, x, y, maxW, lineH = 4.5) {
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}
async function preloadPhaseImages(photos) {
  const map = /* @__PURE__ */ new Map();
  const urls = photos.map((p) => p.url).filter((u) => !!u);
  await Promise.all(
    urls.map(async (url) => {
      const img = await loadImageBase64(url);
      if (!img) return;
      const format = img.includes("image/png") ? "PNG" : "JPEG";
      map.set(url, { data: img, format });
    })
  );
  return map;
}
async function buildPdfBuffer(data, options) {
  if (!data) throw new Error("Dados da miss\xE3o indispon\xEDveis");
  const embedPhotos = options?.embedPhotos === true;
  const narrative = buildOccurrenceNarrative(data);
  const doc = new import_jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  let y = margin;
  const logoDataUri = await resolveTmSegLogoDataUri();
  if (logoDataUri && !logoDataUri.includes("svg+xml")) {
    try {
      const format = logoDataUri.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logoDataUri, format, margin, y, 34, 14);
    } catch {
    }
  }
  doc.setTextColor(BRAND_NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Plano de A\xE7\xE3o e Justificativa", pageW / 2, y + 5, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#555");
  doc.text(`DHL \u2014 S.E. ${data.seNumber} \xB7 OS ${data.missionId}`, pageW / 2, y + 10, { align: "center" });
  doc.setDrawColor(BRAND_WINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 16, pageW - margin, y + 16);
  y += 22;
  const section = (title) => {
    y = ensureSpace(doc, y, 12, margin);
    doc.setFillColor(BRAND_LIGHT);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setTextColor(BRAND_NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, margin + 2, y + 5);
    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#111");
    doc.setFontSize(8.5);
  };
  section("Identifica\xE7\xE3o");
  const meta = [
    ["S.E.", data.seNumber],
    ["OS", data.missionId],
    ["Placa", data.clientVehiclePlate || "\u2014"],
    ["Emiss\xE3o", `${formatDateTimeBR(data.generatedAt)} (Bras\xEDlia)`]
  ];
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), margin + 22, y);
    y += 5;
  }
  y += 3;
  section("Resumo dos fatos");
  y = wrapText(doc, narrative.factsSummary, margin, y, contentW);
  y += 4;
  section("Marcos operacionais (Bras\xEDlia)");
  for (const mark of data.marks) {
    const when = mark.at ? `${formatTimeBR(mark.at)} \u2014 ${formatDateTimeBR(mark.at).split(" ")[0]}` : "\u2014";
    doc.setFont("helvetica", "bold");
    doc.text(`${mark.label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(when, margin + 52, y);
    y += 5;
  }
  y += 3;
  section("An\xE1lise e causa");
  y = wrapText(doc, narrative.rootCause, margin, y, contentW);
  y += 4;
  section("Evid\xEAncias fotogr\xE1ficas");
  if (embedPhotos) {
    const imageCache = await preloadPhaseImages(data.phasePhotos);
    for (const photo of data.phasePhotos) {
      y = ensureSpace(doc, y, 58, margin);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const timeLabel = photo.at ? formatTimeBR(photo.at) : "\u2014";
      doc.text(`${photo.label} \u2014 ${timeLabel}`, margin, y);
      y += 5;
      const cached = photo.url ? imageCache.get(photo.url) : null;
      if (cached) {
        try {
          doc.addImage(cached.data, cached.format, margin, y, contentW / 2, 36);
          y += 40;
          continue;
        } catch {
        }
      }
      doc.setFont("helvetica", "italic");
      doc.setTextColor("#666");
      y = wrapText(doc, "Evid\xEAncia n\xE3o registrada no sistema para esta etapa.", margin, y, contentW);
      doc.setTextColor("#111");
      y += 4;
    }
  } else {
    y = wrapText(
      doc,
      "Fotos dispon\xEDveis na pr\xE9-visualiza\xE7\xE3o HTML. Use Imprimir \u2192 Salvar como PDF para incluir imagens.",
      margin,
      y,
      contentW
    );
    y += 4;
  }
  section("A\xE7\xF5es corretivas e preventivas");
  y = wrapText(doc, `Corretivas: ${narrative.correctiveActions.join(" ")}`, margin, y, contentW);
  y += 2;
  y = wrapText(doc, `Preventivas: ${narrative.preventiveActions.join(" ")}`, margin, y, contentW);
  y += 8;
  y = ensureSpace(doc, y, 30, margin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(BRAND_WINE);
  doc.text("VISTO", margin, y);
  y += 7;
  doc.setTextColor("#111");
  doc.setFontSize(9);
  doc.text(data.directorName, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("Diretoria \u2014 Grupo TM SEG", margin, y);
  y += 5;
  doc.text(formatDateTimeBR(data.generatedAt), margin, y);
  return Buffer.from(doc.output("arraybuffer"));
}
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1e3)}s`)), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function generateDhlOccurrenceReportPdf(input, options) {
  try {
    const sb = getSupabase2();
    const data = await collectDhlOccurrenceReportData(sb, input);
    if (!data) return null;
    return await withTimeout(
      buildPdfBuffer(data, { embedPhotos: options?.embedPhotos ?? false }),
      PDF_GENERATION_TIMEOUT_MS,
      "Gera\xE7\xE3o do PDF"
    );
  } catch (err) {
    console.error("[dhlOccurrenceReportPdf]", err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dhlOccurrenceReportFilename,
  generateDhlOccurrenceReportHtml,
  generateDhlOccurrenceReportPdf
});
