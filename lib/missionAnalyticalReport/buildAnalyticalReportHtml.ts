/**
 * HTML A4 do relatório analítico da OS — paleta e logo TM SEG (mesmo padrão visual do Plano DHL).
 */
import { formatDateBR, formatDateTimeBR, formatTimeBR } from '../dateUtils';
import type { MissionAnalyticalReportData } from './collectAnalyticalReport';
import type { RouteKind } from './routePoints';

const BRAND = {
  red: '#dc2626',
  redDark: '#991b1b',
  black: '#111827',
  wine: '#450a0a',
  light: '#fef2f2',
  text: '#1a1a1a',
  muted: '#6b7280',
};

const LOGO_URL = 'https://sistema.grupotmseg.com.br/logo.png';

function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtBRL(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function when(iso?: string | null): string {
  if (!iso) return '—';
  return `${formatDateBR(iso)} ${formatTimeBR(iso)} (Brasília)`;
}

const FINANCIAL_HISTORY_FIELDS = /^(revenue_value|cost_value|toll_value|displacement_value|invoice_number|billing_approved|billing_verified_by|payment_date|client_price|provider_cost|billing_)/i;

function kindColor(kind: RouteKind): string {
  if (kind === 'origem') return '#16a34a';
  if (kind === 'destino') return '#dc2626';
  if (kind === 'parada') return '#d97706';
  return '#2563eb';
}

function styles(): string {
  return `
    @page { size: A4; margin: 12mm 12mm 14mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: ${BRAND.text}; font-size: 10pt; line-height: 1.45; margin: 0; background: #fff; }
    .header {
      display: flex; align-items: center; gap: 16px;
      background: linear-gradient(135deg, ${BRAND.black} 0%, ${BRAND.redDark} 55%, ${BRAND.red} 100%);
      padding: 14px 16px; border-radius: 0 0 8px 8px; margin-bottom: 14px;
    }
    .header img { height: 52px; width: auto; max-width: 180px; object-fit: contain; }
    .cover-title h1 { margin: 0; font-size: 14pt; color: #fff; text-transform: uppercase; letter-spacing: 0.03em; }
    .cover-title p { margin: 4px 0 0; color: #fecaca; font-size: 9.5pt; }
    h2 {
      font-size: 11pt; color: ${BRAND.redDark};
      border-bottom: 2px solid ${BRAND.red};
      padding-bottom: 4px; margin: 16px 0 8px;
    }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%); color: ${BRAND.black}; font-weight: 700; }
    .meta td:first-child { font-weight: 700; width: 30%; background: #fafafa; }
    .quote {
      background: linear-gradient(90deg, #fef2f2 0%, #fff 100%);
      border-left: 4px solid ${BRAND.red};
      padding: 10px 12px; margin: 8px 0;
    }
    .map-wrap { border: 1px solid #fca5a5; border-radius: 8px; overflow: hidden; background: #fef2f2; }
    .map-wrap img { width: 100%; max-height: 320px; object-fit: cover; display: block; }
    .route-item {
      display: grid; grid-template-columns: 44px 1fr; gap: 10px;
      padding: 8px 0; border-bottom: 1px solid #fee2e2;
      page-break-inside: avoid;
    }
    .pin {
      width: 36px; height: 36px; border-radius: 999px; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 11px;
    }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .photo-card {
      border: 1px solid #fca5a5; border-radius: 6px; padding: 8px;
      background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
      page-break-inside: avoid;
    }
    .photo-card img { width: 100%; max-height: 190px; object-fit: contain; background: #fff; border-radius: 4px; }
    .photo-meta { font-size: 7.5pt; color: ${BRAND.muted}; margin-top: 4px; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 8pt; margin: 6px 0 10px; }
    .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; margin-right: 4px; vertical-align: middle; }
    .footer { margin-top: 16px; font-size: 8pt; color: ${BRAND.muted}; text-align: center; }
    .no-print { margin-top: 8px; padding: 8px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; font-size: 8.5pt; }
    @media print {
      .no-print { display: none !important; }
      .header, th, .pin { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function vanSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="7" width="16" height="10" rx="2"/><path d="M17 9h4l2 3v5h-6V9z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>`;
}

export function buildMissionAnalyticalReportHtml(
  data: MissionAnalyticalReportData,
  options?: { omitFinancials?: boolean },
): string {
  const pointsRows = data.points.length === 0
    ? `<p class="quote">Sem coordenadas GPS suficientes para desenhar a rota. A origem/destino em texto segue abaixo.</p>`
    : data.points.map((p) => `
      <div class="route-item">
        <div class="pin" style="background:${kindColor(p.kind)}">${esc(p.mapLabel)}</div>
        <div>
          <div style="font-weight:800;color:${kindColor(p.kind)};text-transform:uppercase;font-size:8.5pt;">
            ${vanSvg()} ${esc(p.label)}
            ${p.kind === 'parada' ? '<span style="margin-left:6px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:999px;font-size:7.5pt;">PARADA</span>' : ''}
          </div>
          <div>${esc(p.description)}</div>
          <div class="photo-meta">
            ${p.at ? esc(when(p.at)) : ''}
            ${p.stretchKm != null ? ` · Trecho desde o ponto anterior: <strong>${p.stretchKm.toFixed(1)} km</strong>` : ''}
            ${p.mapLink ? ` · <a href="${esc(p.mapLink)}">GPS</a>` : ''}
          </div>
        </div>
      </div>`).join('');

  const photos = data.photos.length === 0
    ? `<p class="quote">Nenhuma foto/evidência encontrada nesta OS.</p>`
    : `<div class="photos">${data.photos.map((p) => `
        <div class="photo-card">
          <img src="${esc(p.url)}" alt="${esc(p.caption)}" />
          <div class="photo-meta">${esc(p.caption)}${p.at ? ` · ${esc(when(p.at))}` : ''}</div>
        </div>`).join('')}</div>`;

  const logs = data.logs.length === 0
    ? `<tr><td colspan="3">Sem atualizações operacionais registradas.</td></tr>`
    : data.logs.map((l) => `
      <tr>
        <td>${esc(when(l.created_at))}</td>
        <td>${esc(l.updated_by || '—')}</td>
        <td>${esc(l.description || '—')}${l.map_link ? `<div class="photo-meta"><a href="${esc(l.map_link)}">Abrir GPS</a></div>` : ''}</td>
      </tr>`).join('');

  const historyRows = (data.history || []).filter((h) =>
    options?.omitFinancials ? !FINANCIAL_HISTORY_FIELDS.test(String(h.field_name || '')) : true,
  );
  const history = historyRows.length === 0
    ? `<tr><td colspan="4">Sem histórico de campos.</td></tr>`
    : historyRows.slice(0, 80).map((h) => `
      <tr>
        <td>${esc(when(h.changed_at))}</td>
        <td>${esc(h.changed_by || '—')}</td>
        <td>${esc(h.field_name)}</td>
        <td>${esc(h.old_value || '—')} → ${esc(h.new_value || '—')}</td>
      </tr>`).join('');

  const stretchTable = data.points.length < 2
    ? ''
    : `<table>
        <thead><tr><th>Trecho</th><th>De</th><th>Para</th><th>Distância</th></tr></thead>
        <tbody>
          ${data.points.slice(1).map((p, i) => {
            const prev = data.points[i];
            return `<tr>
              <td>${i + 1}</td>
              <td>${esc(prev.label)}</td>
              <td>${esc(p.label)}${p.kind === 'parada' ? ' (PARADA)' : ''}</td>
              <td>${p.stretchKm != null ? `${p.stretchKm.toFixed(1)} km` : '—'}</td>
            </tr>`;
          }).join('')}
          <tr><td colspan="3"><strong>Soma dos trechos GPS</strong></td><td><strong>${data.routeKmEstimado.toFixed(1)} km</strong></td></tr>
        </tbody>
      </table>`;

  const timeline = (data.statusTimeline || []).length === 0
    ? ''
    : `<table>
        <thead><tr><th>Status</th><th>Quando</th><th>Quem</th></tr></thead>
        <tbody>
          ${data.statusTimeline!.map((s) => `<tr><td>${esc(s.status)}</td><td>${esc(when(s.at))}</td><td>${esc(s.by || '—')}</td></tr>`).join('')}
        </tbody>
      </table>`;

  const agents = data.agents.length === 0
    ? `<tr><td colspan="4">Nenhum agente informado nesta OS.</td></tr>`
    : data.agents.map((a) => `
      <tr>
        <td>${esc(a.role)}</td>
        <td>${esc(a.name)}</td>
        <td>${esc(a.cpf || '—')}</td>
        <td>CNH ${esc(a.cnh || '—')} · CNV ${esc(a.cnv || '—')}<br/>Tel. ${esc(a.phone || '—')}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Analítico ${esc(data.missionId)} — Grupo TM SEG</title>
  <style>${styles()}</style>
</head>
<body>
  <div class="header">
    <img src="${LOGO_URL}" alt="Grupo TM SEG" />
    <div class="cover-title">
      <h1>Relatório Analítico da Viagem</h1>
      <p>OS ${esc(data.missionId)} · ${esc(data.client)} · ${esc(data.status)}</p>
    </div>
  </div>

  <div class="quote">
    Documento operacional completo da escolta: cliente, equipe, viatura, horários, KM, atualizações, ocorrências, fotos e rota
    (Ponto A → atualizações / paradas → Ponto B). Valores financeiros abaixo são os <strong>já gravados</strong> na OS — este PDF não recalcula faturamento.
  </div>

  <h2>1. Identificação da OS</h2>
  <table class="meta">
    <tr><td>OS TM SEG</td><td>${esc(data.missionId)}</td></tr>
    <tr><td>Status</td><td>${esc(data.status)}</td></tr>
    <tr><td>Cliente</td><td>${esc(data.client)}${data.clientCnpj ? ` · CNPJ ${esc(data.clientCnpj)}` : ''}</td></tr>
    ${data.clientContact || data.clientPhone || data.clientEmail ? `<tr><td>Contato do cliente</td><td>${esc([data.clientContact, data.clientPhone, data.clientEmail].filter(Boolean).join(' · ') || '—')}</td></tr>` : ''}
    ${data.clientAddress ? `<tr><td>Endereço do cliente</td><td>${esc(data.clientAddress)}</td></tr>` : ''}
    <tr><td>Fornecedor</td><td>${esc(data.provider || '—')}</td></tr>
    <tr><td>Tipo</td><td>${esc(data.missionType)}${data.specialOperation ? ` · ${esc(data.specialOperation)}` : ''}</td></tr>
    ${data.grEspelhamento ? `<tr><td>GR / espelhamento</td><td>${esc(data.grEspelhamento)}</td></tr>` : ''}
    ${data.seNumber ? `<tr><td>S.E. DHL</td><td>${esc(data.seNumber)}</td></tr>` : ''}
    ${data.smNumber ? `<tr><td>S.M. DHL</td><td>${esc(data.smNumber)}</td></tr>` : ''}
    ${data.vendorOsNumber ? `<tr><td>OS fornecedor</td><td>${esc(data.vendorOsNumber)}</td></tr>` : ''}
    ${data.referenceNumber ? `<tr><td>Referência</td><td>${esc(data.referenceNumber)}</td></tr>` : ''}
    ${options?.omitFinancials ? '' : `<tr><td>Fatura</td><td>${esc(data.invoiceNumber || '—')} · Aprovação faturamento: ${data.billingApproved ? 'Sim' : 'Não'}</td></tr>`}
    <tr><td>Abertura</td><td>${esc(when(data.createdAt))}</td></tr>
    ${data.lastUpdate ? `<tr><td>Última atualização</td><td>${esc(when(data.lastUpdate))}</td></tr>` : ''}
  </table>
  ${timeline}

  <h2>2. Rota e mapa da viatura</h2>
  <table class="meta">
    <tr><td>Ponto A — Origem</td><td>${esc(data.origin || '—')}</td></tr>
    <tr><td>Ponto B — Destino</td><td>${esc(data.destination || '—')}</td></tr>
    <tr><td>KM hodômetro</td><td>Início ${data.startKm ?? '—'} · Fim ${data.endKm ?? '—'} · Rodado ${data.kmRodado != null ? `${data.kmRodado} km` : '—'}${data.traveledDistance != null ? ` · Percorrido ${data.traveledDistance} km` : ''}</td></tr>
    <tr><td>KM cadastrado / trechos GPS</td><td>${data.totalDistance != null ? `${data.totalDistance} km` : '—'} · soma trechos GPS ${data.routeKmEstimado.toFixed(1)} km</td></tr>
    <tr><td>Horários</td><td>Início ${esc(when(data.startTime))} · Fim ${esc(when(data.endTime))} · Duração ${esc(data.durationLabel)}</td></tr>
    <tr><td>Marcos operacionais</td><td>Chegada origem ${esc(when(data.arrivalOrigin))} · Em viagem ${esc(when(data.operationStart))} · Encerramento ${esc(when(data.operationEnd))}</td></tr>
    ${data.estimatedTime ? `<tr><td>Tempo estimado</td><td>${esc(data.estimatedTime)}</td></tr>` : ''}
    ${(data.providerStartKm != null || data.providerEndKm != null || data.providerStartTime || data.providerEndTime) ? `<tr><td>KM / horário fornecedor</td><td>Início ${data.providerStartKm ?? '—'} (${esc(when(data.providerStartTime))}) · Fim ${data.providerEndKm ?? '—'} (${esc(when(data.providerEndTime))})</td></tr>` : ''}
    <tr><td>Última posição</td><td>${esc(data.currentLocation || '—')}</td></tr>
  </table>
  <div class="legend">
    <span><span class="dot" style="background:#16a34a"></span>A Origem</span>
    <span><span class="dot" style="background:#2563eb"></span>Atualizações do percurso</span>
    <span><span class="dot" style="background:#d97706"></span>Paradas</span>
    <span><span class="dot" style="background:#dc2626"></span>B Destino</span>
  </div>
  ${data.mapUrl ? `<div class="map-wrap"><img src="${esc(data.mapUrl)}" alt="Mapa da rota da OS ${esc(data.missionId)}" /></div>` : ''}
  ${data.directionsLink ? `<p class="photo-meta"><a href="${esc(data.directionsLink)}">Abrir rota no Google Maps</a></p>` : ''}
  ${stretchTable}
  ${pointsRows}

  <h2>3. Equipe, viatura e veículos</h2>
  <table class="meta">
    <tr><td>Viatura escolta</td><td>${esc([data.vehiclePlate, data.vehicleModel, data.vehicleType, data.vehicleYear, data.vehicleColor].filter(Boolean).join(' · ') || '—')}</td></tr>
    <tr><td>Motorista 1</td><td>${esc(data.driverName || '—')} · ${esc(data.driverPhone || '—')}</td></tr>
    <tr><td>Motorista 2</td><td>${esc(data.driverName2 || '—')} · ${esc(data.driverPhone2 || '—')}</td></tr>
    <tr><td>Veículo do cliente</td><td>${esc(data.clientVehicle || '—')}</td></tr>
    ${data.clientVehicle2 ? `<tr><td>Veículo do cliente 2</td><td>${esc(data.clientVehicle2)}</td></tr>` : ''}
  </table>
  <table>
    <thead><tr><th>Função</th><th>Agente</th><th>CPF</th><th>Documentos</th></tr></thead>
    <tbody>${agents}</tbody>
  </table>

  <h2>4. Atualizações e ocorrências</h2>
  <table>
    <thead><tr><th>Data/hora</th><th>Quem</th><th>Ocorrência / atualização</th></tr></thead>
    <tbody>${logs}</tbody>
  </table>

  <h2>5. Fotos e evidências</h2>
  ${photos}

  <h2>6. Histórico de alterações da OS</h2>
  <table>
    <thead><tr><th>Quando</th><th>Quem</th><th>Campo</th><th>De → Para</th></tr></thead>
    <tbody>${history}</tbody>
  </table>

  ${options?.omitFinancials ? '' : `
  <h2>7. Valores registrados (não recalculados)</h2>
  <table class="meta">
    <tr><td>Receita gravada</td><td>${esc(fmtBRL(data.revenueStored))}</td></tr>
    <tr><td>Custo gravado</td><td>${esc(fmtBRL(data.costStored))}</td></tr>
    <tr><td>Pedágio cliente gravado</td><td>${esc(fmtBRL(data.tollStored))}</td></tr>
  </table>`}

  <div class="footer">
    Grupo TM SEG · Relatório analítico gerado em ${esc(formatDateTimeBR(data.generatedAt))} · OS ${esc(data.missionId)}
  </div>
  <div class="no-print">Para PDF: Imprimir → Destino “Salvar como PDF”. As fotos e o mapa entram no arquivo.</div>
</body>
</html>`;
}
