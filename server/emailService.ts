import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { generateMissionReportPDF, formatOSForFilename } from './pdfReportService';

const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;
// BCC como ARRAY — alguns servidores SMTP rejeitam string com espaço após vírgula
const BCC_RECIPIENTS: string[] = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];
const BCC_WELCOME_ONLY: string[] = ['thiago@grupotmseg.com.br'];

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
  requireTLS: true,
});

console.log(`[Email] SMTP configurado: ${EMAIL_USER} | from: adm@grupotmseg.com.br | senha: ${EMAIL_PASS ? '***configurada***' : '⚠ VAZIA'}`);

// Alerta de sistema genérico (ex.: vigia do WhatsApp/Z-API). Reusa o mesmo
// transporter e template visual dos demais e-mails.
export async function sendSystemAlertEmail(to: string[], subject: string, contentHtml: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: '"Grupo TM SEG - Sistema" <adm@grupotmseg.com.br>',
      to: to.join(', '),
      subject,
      html: baseTemplate(contentHtml),
    });
    console.log(`[Email] Alerta de sistema enviado → ${to.join(', ')} | ${subject}`);
    return true;
  } catch (e: any) {
    console.error(`[Email] Falha ao enviar alerta de sistema: ${e.message}`);
    return false;
  }
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

function baseTemplate(content: string, senderName?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family: 'Segoe UI', Arial, sans-serif; }
  .container { max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  .header { background:#1a1a1a; padding:28px 32px; text-align:center; }
  .header h1 { color:#ffffff; font-size:22px; margin:0 0 4px; letter-spacing:1px; }
  .header .accent { color:#c0392b; font-weight:700; }
  .header .subtitle { color:#999; font-size:12px; margin:0; letter-spacing:2px; text-transform:uppercase; }
  .body-content { padding:32px; color:#333; line-height:1.7; font-size:14px; }
  .body-content h2 { color:#1a1a1a; font-size:18px; border-bottom:3px solid #c0392b; padding-bottom:8px; margin-top:0; }
  .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .info-table td { padding:10px 14px; border-bottom:1px solid #eee; vertical-align:top; }
  .info-table td:first-child { font-weight:600; color:#1a1a1a; width:40%; white-space:nowrap; }
  .info-table td:last-child { color:#555; }
  .badge { display:inline-block; background:#c0392b; color:#fff; padding:4px 12px; border-radius:4px; font-size:12px; font-weight:600; letter-spacing:0.5px; }
  .footer { background:#1a1a1a; padding:24px 32px; text-align:center; border-top:3px solid #c0392b; }
  .footer p { color:#999; font-size:12px; margin:4px 0; }
  .footer .ceo { color:#ffffff; font-weight:600; font-size:13px; }
  .footer .company { color:#c0392b; font-weight:600; }
  .divider { height:3px; background: linear-gradient(90deg, #c0392b, #1a1a1a); margin:0; }
  .highlight-box { background:#fdf2f2; border-left:4px solid #c0392b; padding:12px 16px; margin:16px 0; border-radius:0 4px 4px 0; }
  .highlight-box p { margin:4px 0; font-size:13px; color:#555; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>GRUPO <span class="accent">TM SEG</span></h1>
    <p class="subtitle">Segurança &amp; Escolta Armada</p>
  </div>
  <div class="divider"></div>
  <div class="body-content">
    ${content}
  </div>
  <div class="footer">
    <p class="ceo">${senderName ? toTitleCase(senderName) : 'Equipe Grupo TM SEG'}</p>
    <p class="company">Grupo TM SEG</p>
    <p>Intermediação de Escolta Armada</p>
    <p style="margin-top:8px; font-size:11px; color:#666;">Este é um e-mail automático. Em caso de dúvidas, entre em contato pelo e-mail adm@grupotmseg.com.br</p>
  </div>
</div>
</body>
</html>`;
}

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timePart = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    return `${datePart} — ${timePart}`;
  } catch { return isoStr; }
}

function formatOS(id: string): string {
  const parts = id.split('-');
  if (parts.length >= 3) {
    return parts.slice(0, parts.length - 1).join('-');
  }
  return id;
}

export interface MissionEmailData {
  id: string;
  client: string;
  provider: string;
  origin: string;
  destination: string;
  start_time: string;
  mission_type?: string;
  driver_name?: string;
  driver_phone?: string;
  client_vehicle?: number | null;
  revenue_value?: number;
  cost_value?: number;
}

export async function sendMissionEmailToClient(
  mission: MissionEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string; agent1?: string; agent2?: string; escort_vehicle_plate?: string },
  clientEmail: string,
  vehiclePlate: string,
  grEspelhamento?: string,
  trackerInfo?: string,
  senderName?: string
): Promise<boolean> {
  const alertBanner = (mission as any)._noEmailAlert ? `
    <div style="background:#fef2f2; border:2px solid #dc2626; border-radius:8px; padding:16px; margin-bottom:20px;">
      <p style="margin:0; font-size:14px; font-weight:900; color:#dc2626;">⚠️ ALERTA: ${(mission as any)._alertEntity || 'Cliente'} SEM E-MAIL CADASTRADO</p>
      <p style="margin:8px 0 0; font-size:12px; color:#991b1b;">O ${(mission as any)._alertEntity || 'Cliente'} <strong>"${(mission as any)._alertName || mission.client}"</strong> não possui e-mail registrado no sistema. Este e-mail foi redirecionado para o operacional. Cadastre o e-mail deste ${(mission as any)._alertEntity?.toLowerCase() || 'cliente'} no sistema para que os próximos envios sejam feitos diretamente.</p>
    </div>
  ` : '';

  const html = baseTemplate(`
    ${alertBanner}
    <h2>📋 Confirmação de Escolta — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Segue a confirmação e detalhes completos da missão de escolta registrada para a sua empresa:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Cliente</td><td>${mission.client || '—'}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Viatura (Placa / Modelo)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${mission.mission_type || 'Caracterizada'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${mission.driver_name ? `<tr><td>Motorista</td><td>${mission.driver_name}</td></tr>` : ''}
      ${mission.driver_phone ? `<tr><td>Contato Motorista</td><td>${mission.driver_phone}</td></tr>` : ''}
      ${(mission as any).agent1 ? `<tr><td>Agente 01</td><td>${(mission as any).agent1}</td></tr>` : ''}
      ${(mission as any).agent2 ? `<tr><td>Agente 02</td><td>${(mission as any).agent2}</td></tr>` : ''}
      ${(mission as any).escort_vehicle_plate ? `<tr><td>Viatura de Escolta</td><td>${(mission as any).escort_vehicle_plate}</td></tr>` : ''}
      ${grEspelhamento ? `<tr><td>Espelhamento</td><td>${grEspelhamento}</td></tr>` : ''}
      ${trackerInfo ? `<tr><td>Rastreador</td><td>${trackerInfo}</td></tr>` : ''}
    </table>
    <div class="highlight-box">
      <p><strong>Observação:</strong> Acompanhe o status da missão em tempo real pelo painel do sistema.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';

    const originParts = (mission.origin || '').split(',');
    let originCityUF = '';
    if (originParts.length >= 2) {
      const city = originParts[0].trim();
      const ufMatch = originParts[originParts.length - 1].trim().match(/([A-Z]{2})/);
      const uf = ufMatch ? ufMatch[1] : originParts[originParts.length - 1].trim().replace(/\s*-?\s*Brasil$/i, '').trim();
      originCityUF = `${city}/${uf}`;
    } else {
      const raw = (mission.origin || '').trim();
      const dashParts = raw.split(' - ');
      originCityUF = dashParts.length >= 2 ? `${dashParts[0].trim()}/${dashParts[1].trim()}` : raw;
    }

    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      cc: 'operacional@grupotmseg.com.br',
      replyTo: 'operacional@grupotmseg.com.br',
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Agendamento Confirmado - ${formatOS(mission.id)} - Origem: ${originCityUF || 'S/ORIGEM'}`,
      html,
    };

    const pdfBuffer = await generateMissionReportPDF(String(mission.id));
    if (pdfBuffer) {
      const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'ORIGEM';
      const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'DESTINO';
      mailOptions.attachments = [{
        filename: `TMSEG_-_OS_${formatOSForFilename(mission.id)}_-_${originCity}_x_${destCity}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }];
      console.log(`[Email] PDF do relatório gerado para missão ${mission.id}`);
    } else {
      console.warn(`[Email] Não foi possível gerar PDF para missão ${mission.id}, enviando sem anexo`);
    }

    const info = await transporter.sendMail(mailOptions);
    const messageId = info.messageId || '';
    console.log(`[Email] Missão ${mission.id} → Cliente: ${clientEmail} (com anexo PDF) | Message-ID: ${messageId}`);
    return { success: true, messageId };
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar para cliente ${clientEmail}:`, err.message);
    return { success: false, messageId: '' };
  }
}

export async function sendMissionEmailToProvider(
  mission: MissionEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string },
  providerEmail: string,
  vehiclePlate: string,
  senderName?: string
): Promise<boolean> {
  const escoltaTipo = mission.mission_type || 'Caracterizada';
  const alertBanner = (mission as any)._noEmailAlert ? `
    <div style="background:#fef2f2; border:2px solid #dc2626; border-radius:8px; padding:16px; margin-bottom:20px;">
      <p style="margin:0; font-size:14px; font-weight:900; color:#dc2626;">⚠️ ALERTA: ${(mission as any)._alertEntity || 'Fornecedor'} SEM E-MAIL CADASTRADO</p>
      <p style="margin:8px 0 0; font-size:12px; color:#991b1b;">O ${(mission as any)._alertEntity || 'Fornecedor'} <strong>"${(mission as any)._alertName || mission.provider}"</strong> não possui e-mail registrado no sistema. Este e-mail foi redirecionado para o operacional. Cadastre o e-mail deste ${(mission as any)._alertEntity?.toLowerCase() || 'fornecedor'} no sistema para que os próximos envios sejam feitos diretamente.</p>
    </div>
  ` : '';
  const html = baseTemplate(`
    ${alertBanner}
    <h2>📋 Solicitação de Escolta — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) ${mission.provider || 'Fornecedor'},</p>
    <p>Uma nova ordem de serviço foi atribuída à sua empresa. Seguem os detalhes operacionais:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Veículo / Carga (Placa)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${escoltaTipo}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${mission.driver_name ? `<tr><td>Motorista</td><td>${mission.driver_name}</td></tr>` : ''}
      ${mission.driver_phone ? `<tr><td>Tel. Motorista</td><td>${mission.driver_phone}</td></tr>` : ''}
    </table>

    <div style="background:#ffffff; padding:28px 32px; border-radius:10px; margin:24px 0; border:1px solid #e0e0e0; border-left:4px solid #c0392b;">
      <h3 style="color:#c0392b; font-size:16px; margin:0 0 6px; text-align:center; letter-spacing:1px; font-weight:800;">BRIEFING OPERACIONAL</h3>
      <p style="color:#c0392b; font-size:12px; margin:0 0 20px; text-align:center; font-weight:600; text-transform:uppercase; letter-spacing:2px;">Escolta Armada — Grupo TM SEG</p>
      <p style="color:#555; font-size:13px; margin:0 0 20px; text-align:center; font-style:italic; border-bottom:1px solid #eee; padding-bottom:14px;">A segurança e a excelência da operação dependem da atenção a cada detalhe.</p>

      <h4 style="color:#c0392b; font-size:13px; margin:20px 0 10px; border-bottom:2px solid #f0f0f0; padding-bottom:6px; font-weight:700;">1. VIATURA E PREPARAÇÃO</h4>
      <p style="color:#333; font-size:12px; margin:6px 0;"><strong>Espelhamento Tático:</strong> Viatura espelhada ANTES da chegada na origem. Posição estratégica e discreta.</p>
      <p style="color:#333; font-size:12px; margin:10px 0 6px;"><strong>Checklist Obrigatório:</strong></p>
      <ul style="color:#444; font-size:12px; margin:4px 0 8px 20px; padding:0; list-style:disc;">
        <li style="margin:5px 0;">Comunicação: Teclado e Pânico 100% funcionais.</li>
        <li style="margin:5px 0;">Veículo: Pneus, freios, iluminação e combustível verificados.</li>
        <li style="margin:5px 0;">Equipamentos: Extintor, triângulo, macaco e chave de roda a bordo.</li>
      </ul>
      <p style="color:#c0392b; font-size:12px; margin:8px 0; font-weight:700; background:#fef2f2; padding:8px 12px; border-radius:6px; border:1px solid #fecaca;">PROIBIDO: Estacionar em áreas demarcadas do cliente (exceto pontos de carga/descarga autorizados).</p>

      <h4 style="color:#c0392b; font-size:13px; margin:22px 0 10px; border-bottom:2px solid #f0f0f0; padding-bottom:6px; font-weight:700;">2. AGENTES E CONDUTA</h4>
      <ul style="color:#444; font-size:12px; margin:4px 0 8px 20px; padding:0; list-style:disc;">
        <li style="margin:5px 0;"><strong style="color:#222;">Profissionalismo:</strong> Postura padrão, uniforme impecável, vigilância constante.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Armamento:</strong> SEMPRE armado e com equipamentos táticos em perfeitas condições.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Pontualidade:</strong> Chegar no horário estabelecido.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Contato Prévio:</strong> Fazer contato padrão com o motorista na chegada.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Rota:</strong> Estudar rota principal e alternativas, incluindo pontos críticos.</li>
      </ul>

      <h4 style="color:#c0392b; font-size:13px; margin:22px 0 10px; border-bottom:2px solid #f0f0f0; padding-bottom:6px; font-weight:700;">3. COMUNICAÇÃO E EMERGÊNCIA</h4>
      <ul style="color:#444; font-size:12px; margin:4px 0 8px 20px; padding:0; list-style:disc;">
        <li style="margin:5px 0;"><strong style="color:#222;">Comunicação Ativa:</strong> Manter a base informada (partida, paradas, chegada).</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Emergências:</strong> Comunicar IMEDIATAMENTE a base em caso de anomalia ou incidente.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Protocolos:</strong> Conhecer procedimentos para abordagens hostis, acidentes e falhas mecânicas.</li>
      </ul>

      <h4 style="color:#c0392b; font-size:13px; margin:22px 0 10px; border-bottom:2px solid #f0f0f0; padding-bottom:6px; font-weight:700;">4. ADMINISTRAÇÃO</h4>
      <ul style="color:#444; font-size:12px; margin:4px 0 8px 20px; padding:0; list-style:disc;">
        <li style="margin:5px 0;"><strong style="color:#222;">Documentação:</strong> Portar CNH, CRLV e demais documentos válidos e obrigatórios.</li>
        <li style="margin:5px 0;"><strong style="color:#222;">Relatório Pós-Missão:</strong> Preencher relatório detalhado, mesmo sem ocorrências.</li>
      </ul>

      <p style="color:#c0392b; font-size:13px; margin:22px 0 0; text-align:center; font-weight:700; letter-spacing:0.5px; border-top:2px solid #f0f0f0; padding-top:14px;">Sua atenção a cada detalhe garante a segurança e o sucesso da operação.</p>
    </div>

    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    await transporter.sendMail({
      from: SMTP_FROM,
      to: providerEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Solicitação de Escolta - ${vehiclePlate || 'S/PLACA'} / ${escoltaTipo}`,
      html,
    });
    console.log(`[Email] Missão ${mission.id} → Fornecedor: ${providerEmail}${isAlert ? ' (ALERTA: sem email)' : ''}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar para fornecedor ${providerEmail}:`, err.message);
    return false;
  }
}

export interface MissionEndEmailData {
  id: string;
  client: string;
  provider: string;
  origin: string;
  destination: string;
  scheduled_at?: string | null;
  origin_arrival_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  start_km?: number | null;
  end_km?: number | null;
  map_link?: string | null;
  odometer_print_url?: string | null;
  agent1?: string;
  agent2?: string;
  vehicle_plate?: string;
}

function endMissionContent(
  mission: MissionEndEmailData,
  audience: 'cliente' | 'fornecedor'
): string {
  const startKm = Number(mission.start_km || 0);
  const endKm = Number(mission.end_km || 0);
  const totalKm = endKm > startKm ? endKm - startKm : 0;
  const fmtKm = (n: number) => n > 0 ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km` : '—';
  const printBlock = mission.odometer_print_url ? `
    <div style="margin:20px 0; text-align:center;">
      <p style="font-size:11px; font-weight:700; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">📸 Print do Hodômetro</p>
      <img src="${mission.odometer_print_url}" alt="Hodômetro" style="max-width:100%; max-height:420px; border-radius:8px; border:2px solid #e0e0e0; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
    </div>
  ` : '';
  const saudacao = audience === 'cliente' ? 'Prezado(a) Cliente' : `Prezado(a) ${mission.provider || 'Fornecedor'}`;
  return `
    <h2>✅ Fim de Missão — ${formatOS(mission.id)}</h2>
    <p>${saudacao},</p>
    <p>Informamos a finalização da operação de escolta armada. Seguem os dados oficiais de fechamento:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Cliente</td><td>${mission.client || '—'}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      ${mission.vehicle_plate ? `<tr><td>Viatura</td><td>${mission.vehicle_plate}</td></tr>` : ''}
      <tr><td>Agendamento</td><td>${formatDateTime(mission.scheduled_at)}</td></tr>
      <tr><td>Chegada na Origem</td><td>${formatDateTime(mission.origin_arrival_at)}</td></tr>
      <tr><td>Início da Operação</td><td>${formatDateTime(mission.start_at)}</td></tr>
      <tr><td>Fim de Missão</td><td>${formatDateTime(mission.end_at)}</td></tr>
      <tr><td>KM Inicial</td><td>${fmtKm(startKm)}</td></tr>
      <tr><td>KM Final</td><td>${fmtKm(endKm)}</td></tr>
      <tr><td>Total Rodado</td><td><strong>${fmtKm(totalKm)}</strong></td></tr>
      ${mission.map_link ? `<tr><td>Link do Fim de Missão</td><td><a href="${mission.map_link}" style="color:#c0392b;">Abrir no mapa</a></td></tr>` : ''}
    </table>
    ${printBlock}
    <p>Agradecemos a parceria nesta operação.</p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `;
}

export async function sendMissionEndToClient(
  mission: MissionEndEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string },
  clientEmail: string,
  senderName?: string
): Promise<boolean> {
  const html = baseTemplate(endMissionContent(mission, 'cliente'), senderName);
  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    await transporter.sendMail({
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Fim de Missão - OS ${formatOS(mission.id)}`,
      html,
    });
    console.log(`[Email] Fim de missão ${mission.id} → Cliente: ${clientEmail}${isAlert ? ' (ALERTA: sem email)' : ''}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro fim de missão cliente ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendMissionEndToProvider(
  mission: MissionEndEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string },
  providerEmail: string,
  senderName?: string
): Promise<boolean> {
  const html = baseTemplate(endMissionContent(mission, 'fornecedor'), senderName);
  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    await transporter.sendMail({
      from: SMTP_FROM,
      to: providerEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Fim de Missão - OS ${formatOS(mission.id)}`,
      html,
    });
    console.log(`[Email] Fim de missão ${mission.id} → Fornecedor: ${providerEmail}${isAlert ? ' (ALERTA: sem email)' : ''}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro fim de missão fornecedor ${providerEmail}:`, err.message);
    return false;
  }
}

export interface WelcomeEmailData {
  name: string;
  email: string;
  password: string;
  userType: string;
  profileName?: string;
}

export async function sendMissionResendToClient(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string,
  mirroringEvidenceUrl?: string,
  grEspelhamento?: string,
  trackerInfo?: string,
  threadMessageId?: string,
  senderName?: string
): Promise<boolean> {
  const evidenceBlock = mirroringEvidenceUrl ? `
    <div style="margin:20px 0; text-align:center;">
      <p style="font-size:11px; font-weight:700; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">📸 Evidência de Espelhamento</p>
      <img src="${mirroringEvidenceUrl}" alt="Evidência de Espelhamento" style="max-width:100%; max-height:500px; border-radius:8px; border:2px solid #e0e0e0; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
    </div>
  ` : '';

  const html = baseTemplate(`
    <h2>📋 Confirmação de Escolta — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Segue a confirmação e detalhes completos da missão de escolta registrada para a sua empresa:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Cliente</td><td>${mission.client}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Viatura (Placa / Modelo)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${mission.mission_type || 'Caracterizada'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${grEspelhamento ? `<tr><td>Espelhamento</td><td>${grEspelhamento}</td></tr>` : ''}
      ${trackerInfo ? `<tr><td>Rastreador</td><td>${trackerInfo}</td></tr>` : ''}
      ${mission.driver_name ? `<tr><td>Motorista</td><td>${mission.driver_name}</td></tr>` : ''}
      ${mission.driver_phone ? `<tr><td>Contato Motorista</td><td>${mission.driver_phone}</td></tr>` : ''}
    </table>
    ${evidenceBlock}
    <div class="highlight-box">
      <p><strong>Observação:</strong> Acompanhe o status da missão em tempo real pelo painel do sistema.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    const baseSubject = `Agendamento Confirmado - ${vehiclePlate || 'S/PLACA'} / ${formatOS(mission.id)}`;
    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Re: ${baseSubject}`,
      html,
    };

    if (threadMessageId) {
      mailOptions.inReplyTo = threadMessageId;
      mailOptions.references = threadMessageId;
      console.log(`[Email] Threading reenvio na thread: ${threadMessageId}`);
    }

    const pdfBuffer = await generateMissionReportPDF(String(mission.id));
    if (pdfBuffer) {
      const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'ORIGEM';
      const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'DESTINO';
      if (!mailOptions.attachments) mailOptions.attachments = [];
      mailOptions.attachments.push({
        filename: `TMSEG_-_OS_${formatOSForFilename(mission.id)}_-_${originCity}_x_${destCity}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
      console.log(`[Email] PDF do relatório gerado para reenvio da missão ${mission.id}`);
    }

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Reenvio missão ${mission.id} → Cliente: ${clientEmail} (evidência: ${mirroringEvidenceUrl ? 'SIM' : 'NÃO'})`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao reenviar para cliente ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendMissionChangeNotificationToClient(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string,
  changes: { field: string; oldValue: string; newValue: string }[],
  senderName?: string
): Promise<boolean> {
  const changesRows = changes.map(c => 
    `<tr><td style="font-weight:700;">${c.field}</td><td style="color:#b91c1c; text-decoration:line-through;">${c.oldValue || '—'}</td><td style="color:#15803d; font-weight:700;">${c.newValue || '—'}</td></tr>`
  ).join('');

  const html = baseTemplate(`
    <h2>🔄 Alteração na OS — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Informamos que houve <strong>alteração nos dados</strong> da ordem de serviço abaixo. Confira os detalhes atualizados:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Cliente</td><td>${mission.client || '—'}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Veículo / Carga</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
    </table>
    <div style="margin:20px 0;">
      <h3 style="color:#c0392b; font-size:14px; margin:0 0 10px;">📝 Dados Alterados</h3>
      <table class="info-table">
        <tr style="background:#f8fafc;"><td style="font-weight:800;">Campo</td><td style="font-weight:800; color:#b91c1c;">Anterior</td><td style="font-weight:800; color:#15803d;">Novo</td></tr>
        ${changesRows}
      </table>
    </div>
    <div class="highlight-box">
      <p><strong>Observação:</strong> Esta alteração já está vigente no sistema. Em caso de dúvidas, entre em contato com a equipe operacional.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `🔄 Alteração OS ${formatOS(mission.id)} - ${vehiclePlate || 'S/PLACA'} - Dados Atualizados`,
      html,
    });
    console.log(`[Email] Notificação de alteração OS ${mission.id} → Cliente: ${clientEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar alteração para cliente ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendMissionChangeNotificationToProvider(
  mission: MissionEmailData,
  providerEmail: string,
  vehiclePlate: string,
  changes: { field: string; oldValue: string; newValue: string }[],
  senderName?: string
): Promise<boolean> {
  const changesRows = changes.map(c => 
    `<tr><td style="font-weight:700;">${c.field}</td><td style="color:#b91c1c; text-decoration:line-through;">${c.oldValue || '—'}</td><td style="color:#15803d; font-weight:700;">${c.newValue || '—'}</td></tr>`
  ).join('');

  const html = baseTemplate(`
    <h2>🔄 Alteração na OS — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) ${mission.provider || 'Fornecedor'},</p>
    <p>Informamos que houve <strong>alteração nos dados do motorista/veículo</strong> da ordem de serviço abaixo. Por favor, atualize as informações junto à sua equipe:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Veículo / Carga</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
    </table>
    <div style="margin:20px 0;">
      <h3 style="color:#c0392b; font-size:14px; margin:0 0 10px;">📝 Dados Alterados</h3>
      <table class="info-table">
        <tr style="background:#f8fafc;"><td style="font-weight:800;">Campo</td><td style="font-weight:800; color:#b91c1c;">Anterior</td><td style="font-weight:800; color:#15803d;">Novo</td></tr>
        ${changesRows}
      </table>
    </div>
    <div class="highlight-box">
      <p><strong>Atenção:</strong> Certifique-se de que a equipe em campo está ciente destas alterações antes do início da operação.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: providerEmail,
      bcc: BCC_RECIPIENTS,
      subject: `🔄 Alteração OS ${formatOS(mission.id)} - Dados do Motorista Atualizados`,
      html,
    });
    console.log(`[Email] Notificação de alteração OS ${mission.id} → Fornecedor: ${providerEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar alteração para fornecedor ${providerEmail}:`, err.message);
    return false;
  }
}

export async function sendMirroringEvidenceEmail(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string,
  imageUrl: string,
  grEspelhamento?: string,
  trackerInfo?: string,
  threadMessageId?: string,
  senderName?: string
): Promise<boolean> {
  const isAlert = (mission as any)._noEmailAlert;
  const alertBanner = isAlert ? `
    <div style="background:#dc2626; color:#fff; padding:16px; border-radius:8px; margin-bottom:20px; text-align:center;">
      <strong>⚠️ ATENÇÃO:</strong> O ${(mission as any)._alertEntity || 'Cliente'} <strong>"${(mission as any)._alertName || mission.client}"</strong> não possui e-mail cadastrado. Este é um alerta interno.
    </div>
  ` : '';

  const html = baseTemplate(`
    ${alertBanner}
    <h2>📸 Evidência de Espelhamento — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Segue a evidência do espelhamento tático da viatura para a missão de escolta em andamento:</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Viatura (Placa / Modelo)</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo de Escolta</td><td>${mission.mission_type || 'Caracterizada'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${grEspelhamento ? `<tr><td>Espelhamento</td><td>${grEspelhamento}</td></tr>` : ''}
      ${trackerInfo ? `<tr><td>Rastreador</td><td>${trackerInfo}</td></tr>` : ''}
    </table>
    <div style="margin:20px 0; text-align:center;">
      <p style="font-size:11px; font-weight:700; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Foto do Espelhamento</p>
      <img src="${imageUrl}" alt="Evidência de Espelhamento" style="max-width:100%; max-height:500px; border-radius:8px; border:2px solid #e0e0e0; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
    </div>
    <div class="highlight-box">
      <p><strong>Confirmação:</strong> A viatura foi devidamente espelhada conforme o protocolo operacional do Grupo TM SEG.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, senderName);

  try {
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    const baseSubject = `Agendamento Confirmado - ${vehiclePlate || 'S/PLACA'} / ${formatOS(mission.id)}`;
    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Re: ${baseSubject}`,
      html,
    };

    if (threadMessageId) {
      mailOptions.inReplyTo = threadMessageId;
      mailOptions.references = threadMessageId;
      console.log(`[Email] Threading espelhamento na thread: ${threadMessageId}`);
    }

    const pdfBuffer = await generateMissionReportPDF(String(mission.id));
    if (pdfBuffer) {
      const originCity = mission.origin ? mission.origin.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'ORIGEM';
      const destCity = mission.destination ? mission.destination.split(',')[0].split('-')[0].trim().replace(/\s+/g, '_') : 'DESTINO';
      if (!mailOptions.attachments) mailOptions.attachments = [];
      mailOptions.attachments.push({
        filename: `TMSEG_-_OS_${formatOSForFilename(mission.id)}_-_${originCity}_x_${destCity}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Espelhamento ${mission.id} → ${clientEmail}${isAlert ? ' (alerta interno)' : ''}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar espelhamento para ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendWelcomeEmail(user: WelcomeEmailData, systemUrl: string, verificationCode?: string): Promise<boolean> {
  const typeLabel = user.userType === 'client' ? 'Cliente' : user.userType === 'provider' ? 'Fornecedor' : 'Interno';

  const verificationBlock = verificationCode ? `
    <div style="background:#0f172a; border:2px solid #c0392b; border-radius:12px; padding:24px; text-align:center; margin:20px 0;">
      <p style="color:#94a3b8; font-size:12px; margin:0 0 8px; text-transform:uppercase; letter-spacing:2px;">Código de Confirmação</p>
      <span style="font-size:32px; font-weight:900; color:#c0392b; letter-spacing:10px; font-family:'Courier New',monospace;">${verificationCode}</span>
      <p style="color:#475569; font-size:11px; margin:12px 0 0;">Use este código no primeiro acesso para ativar sua conta.</p>
    </div>
  ` : '';

  const html = baseTemplate(`
    <h2>🎉 Bem-vindo(a) ao Grupo TM SEG</h2>
    <p>Olá, <strong>${user.name}</strong>!</p>
    <p>Sua conta foi criada com sucesso no sistema de gestão do <strong>Grupo TM SEG</strong>. Abaixo estão suas credenciais de acesso:</p>
    <table class="info-table">
      <tr><td>Tipo de Acesso</td><td><span class="badge">${typeLabel}</span></td></tr>
      ${user.profileName ? `<tr><td>Perfil</td><td>${user.profileName}</td></tr>` : ''}
      <tr><td>Link do Sistema</td><td><a href="${systemUrl}" style="color:#c0392b; font-weight:600;">${systemUrl}</a></td></tr>
      <tr><td>Login (E-mail)</td><td>${user.email}</td></tr>
      <tr><td>Senha Temporária</td><td><code style="background:#f0f0f0; padding:2px 8px; border-radius:3px; font-size:14px;">${user.password}</code></td></tr>
    </table>
    ${verificationBlock}
    <div class="highlight-box">
      <p><strong>⚠️ Importante:</strong> No seu primeiro acesso, você será solicitado a <strong>alterar sua senha obrigatoriamente</strong>. Nunca compartilhe suas credenciais com terceiros.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: user.email,
      bcc: BCC_WELCOME_ONLY,
      subject: `Bem-vindo(a) ao Grupo TM SEG — Suas Credenciais de Acesso`,
      html,
    });
    console.log(`[Email] Boas-vindas → ${user.email}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar boas-vindas para ${user.email}:`, err.message);
    return false;
  }
}

export async function sendVerificationCodeEmail(email: string, userName: string, code: string): Promise<boolean> {
  const html = baseTemplate(`
    <h2>🔐 Código de Verificação</h2>
    <p>Olá, <strong>${userName}</strong>!</p>
    <p>Use o código abaixo para confirmar a criação da sua conta no sistema <strong>Grupo TM SEG</strong>:</p>
    <div style="background:#0f172a; border:2px solid #c0392b; border-radius:12px; padding:24px; text-align:center; margin:20px 0;">
      <span style="font-size:36px; font-weight:900; color:#c0392b; letter-spacing:12px; font-family:'Courier New',monospace;">${code}</span>
    </div>
    <p style="font-size:12px; color:#666;">Este código expira em <strong>10 minutos</strong>. Se você não solicitou este código, ignore este e-mail.</p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      bcc: BCC_WELCOME_ONLY,
      subject: `🔐 Código de Verificação — Grupo TM SEG`,
      html,
    });
    console.log(`[Email] Código de verificação → ${email}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar código para ${email}:`, err.message);
    return false;
  }
}

export async function sendTestEmail(to: string): Promise<boolean> {
  const html = baseTemplate(`
    <h2>✅ E-mail de Teste</h2>
    <p>Este é um e-mail de teste do sistema de automação do <strong>Grupo TM SEG</strong>.</p>
    <p>Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente.</p>
    <table class="info-table">
      <tr><td>Remetente</td><td>${EMAIL_USER}</td></tr>
      <tr><td>Destinatário</td><td>${to}</td></tr>
      <tr><td>Data/Hora</td><td>${formatDateTime(new Date().toISOString())}</td></tr>
    </table>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      bcc: BCC_RECIPIENTS,
      subject: `Teste — Sistema de E-mails Grupo TM SEG`,
      html,
    });
    console.log(`[Email] Teste enviado → ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro no teste:`, err.message);
    return false;
  }
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetLink: string,
  senderName?: string
): Promise<boolean> {
  try {
    const html = baseTemplate(`
    <h2 style="color:#111827; font-size:18px; font-weight:800; margin:0 0 12px 0;">Redefinição de Senha</h2>
    <p style="color:#374151; font-size:14px; line-height:1.6; margin:0 0 16px 0;">
      Olá <strong>${toTitleCase(name)}</strong>,
    </p>
    <p style="color:#374151; font-size:14px; line-height:1.6; margin:0 0 16px 0;">
      Uma nova senha foi solicitada para o seu acesso ao sistema <strong>Grupo TM SEG</strong>.
    </p>
    <p style="color:#374151; font-size:14px; line-height:1.6; margin:0 0 20px 0;">
      Clique no botão abaixo para definir sua nova senha de acesso:
    </p>
    <div style="text-align:center; margin:24px 0;">
      <a href="${resetLink}" style="display:inline-block; background-color:#dc2626; color:#ffffff; font-size:14px; font-weight:800; text-decoration:none; padding:14px 40px; border-radius:8px; letter-spacing:0.5px; text-transform:uppercase;">
        Definir Nova Senha
      </a>
    </div>
    <p style="color:#6b7280; font-size:12px; line-height:1.5; margin:20px 0 0 0;">
      ⚠️ Este link é válido por <strong>24 horas</strong>. Se você não solicitou essa alteração, ignore este e-mail.
    </p>
    <p style="color:#9ca3af; font-size:11px; line-height:1.5; margin:12px 0 0 0;">
      Caso o botão não funcione, copie e cole o link abaixo no seu navegador:<br/>
      <span style="color:#2563eb; word-break:break-all;">${resetLink}</span>
    </p>
    `, senderName);

    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: '🔐 Redefinição de Senha — Grupo TM SEG',
      html,
    });
    console.log(`[Email] Reset de senha enviado → ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar reset de senha:`, err.message);
    return false;
  }
}

export interface BillingEmailData {
  clientName: string;
  clientCnpj: string;
  clientEmail: string;
  invoiceNumber?: string;
  issuerCompany: string;
  value: number;
  dueDate: string;
  description?: string;
  paymentId?: string;
  boletoUrl?: string;
  pixPayload?: string;
  pixQrCodeBase64?: string;
  boletoBarcode?: string;
  boletoDigitableLine?: string;
  nfPdfUrl?: string;
  nfNumber?: string;
}

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDueDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateStr; }
}

export async function sendBillingEmail(data: BillingEmailData): Promise<{ success: boolean; messageId?: string }> {
  const boletoBlock = data.boletoUrl ? `
    <div style="background:#f0fdf4; border:2px solid #16a34a; border-radius:8px; padding:16px; margin:16px 0; text-align:center;">
      <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#16a34a;">📄 BOLETO BANCÁRIO</p>
      <a href="${data.boletoUrl}" target="_blank" style="display:inline-block; background:#16a34a; color:#fff; padding:10px 24px; border-radius:6px; text-decoration:none; font-weight:700; font-size:14px;">Visualizar / Imprimir Boleto</a>
      ${data.boletoDigitableLine ? `<p style="margin:12px 0 0; font-size:11px; color:#555; word-break:break-all;"><strong>Linha Digitável:</strong> ${data.boletoDigitableLine}</p>` : ''}
      ${data.boletoBarcode ? `<p style="margin:4px 0 0; font-size:11px; color:#555;"><strong>Código de Barras:</strong> ${data.boletoBarcode}</p>` : ''}
    </div>
  ` : '';

  const pixBlock = (data.pixPayload || data.pixQrCodeBase64) ? `
    <div style="background:#f0f9ff; border:2px solid #0284c7; border-radius:8px; padding:16px; margin:16px 0; text-align:center;">
      <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#0284c7;">📱 PAGAMENTO VIA PIX</p>
      ${data.pixQrCodeBase64 ? `<img src="data:image/png;base64,${data.pixQrCodeBase64}" alt="QR Code PIX" style="width:200px; height:200px; margin:8px auto; display:block; border-radius:8px;" />` : ''}
      ${data.pixPayload ? `<p style="margin:8px 0 0; font-size:11px; color:#555; word-break:break-all;"><strong>Pix Copia e Cola:</strong> ${data.pixPayload}</p>` : ''}
    </div>
  ` : '';

  const nfBlock = data.nfPdfUrl ? `
    <div style="background:#fefce8; border:2px solid #ca8a04; border-radius:8px; padding:16px; margin:16px 0; text-align:center;">
      <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#ca8a04;">📋 NOTA FISCAL DE SERVIÇO${data.nfNumber ? ` Nº ${data.nfNumber}` : ''}</p>
      <a href="${data.nfPdfUrl}" target="_blank" style="display:inline-block; background:#ca8a04; color:#fff; padding:10px 24px; border-radius:6px; text-decoration:none; font-weight:700; font-size:14px;">Baixar NF em PDF</a>
    </div>
  ` : '';

  const html = baseTemplate(`
    <h2>💰 Cobrança — ${data.issuerCompany}</h2>
    <p>Prezado(a) <strong>${data.clientName}</strong>,</p>
    <p>Segue a cobrança referente aos serviços prestados conforme detalhamento abaixo:</p>
    <table class="info-table">
      <tr><td>Empresa Emissora</td><td><strong>${data.issuerCompany}</strong></td></tr>
      <tr><td>Cliente</td><td>${data.clientName}</td></tr>
      <tr><td>CNPJ</td><td>${data.clientCnpj}</td></tr>
      ${data.invoiceNumber ? `<tr><td>Referência NF</td><td><span class="badge">${data.invoiceNumber}</span></td></tr>` : ''}
      <tr><td>Descrição</td><td>${data.description || 'Intermediação de Escolta Armada e Fiscal de Rota'}</td></tr>
      <tr><td>Valor</td><td style="font-size:18px; font-weight:900; color:#c0392b;">${formatCurrency(data.value)}</td></tr>
      <tr><td>Vencimento</td><td><strong>${formatDueDate(data.dueDate)}</strong></td></tr>
    </table>

    ${boletoBlock}
    ${pixBlock}
    ${nfBlock}

    <div class="highlight-box">
      <p><strong>Observação:</strong> Em caso de dúvidas sobre esta cobrança, entre em contato pelo e-mail <a href="mailto:adm@grupotmseg.com.br">adm@grupotmseg.com.br</a>.</p>
    </div>
    <p>Atenciosamente,<br><strong>${data.issuerCompany}</strong></p>
  `);

  try {
    const mailOptions: any = {
      from: SMTP_FROM,
      to: data.clientEmail,
      cc: ['financeiro@grupotmseg.com.br'],
      bcc: ['thiago@grupotmseg.com.br'],
      subject: `Cobrança ${data.invoiceNumber ? `NF ${data.invoiceNumber} — ` : ''}${formatCurrency(data.value)} — Venc. ${formatDueDate(data.dueDate)} — ${data.issuerCompany}`,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    const messageId = info.messageId || '';
    console.log(`[Email] Cobrança enviada → ${data.clientEmail} | ${data.clientName} | R$ ${data.value} | Venc: ${data.dueDate} | Message-ID: ${messageId}`);
    return { success: true, messageId };
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar cobrança para ${data.clientEmail}:`, err.message);
    return { success: false };
  }
}

export async function sendLegalReportEmail(to: string, processos: any[], searchDate: string): Promise<boolean> {
  const processosHtml = processos.length === 0
    ? '<p style="color:#999; font-style:italic; text-align:center; padding:20px;">Nenhum processo novo encontrado.</p>'
    : processos.map((p: any, idx: number) => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 14px; font-weight:600; color:#1a1a1a; font-size:13px;">${p.numeroProcesso || '—'}</td>
        <td style="padding:10px 14px; color:#555; font-size:12px;">${p.tribunal || '—'}</td>
        <td style="padding:10px 14px; color:#555; font-size:12px;">${p.classe || '—'}</td>
        <td style="padding:10px 14px; color:#555; font-size:12px;">${p.orgaoJulgador || '—'}</td>
        <td style="padding:10px 14px; color:#555; font-size:12px;">${p.dataAjuizamento ? new Date(p.dataAjuizamento).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:10px 14px; color:#555; font-size:12px;">${(p.movimentos || []).length} mov.</td>
      </tr>
    `).join('');

  const html = baseTemplate(`
    <h2>Relatório Jurídico Diário</h2>
    <div class="highlight-box">
      <p><strong>Data da Consulta:</strong> ${searchDate}</p>
      <p><strong>Empresa:</strong> TM SEGURANÇA CONSULTORIA & TECNOLOGIA INTEGRADA LTDA</p>
      <p><strong>CNPJ:</strong> 28.804.378/0001-67</p>
      <p><strong>Processos Encontrados:</strong> <span class="badge">${processos.length}</span></p>
    </div>
    ${processos.length > 0 ? `
    <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:12px;">
      <thead>
        <tr style="background:#f8f9fa; border-bottom:2px solid #c0392b;">
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Nº Processo</th>
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Tribunal</th>
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Classe</th>
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Órgão Julgador</th>
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Ajuizamento</th>
          <th style="padding:10px 14px; text-align:left; font-weight:700; color:#1a1a1a;">Mov.</th>
        </tr>
      </thead>
      <tbody>${processosHtml}</tbody>
    </table>
    ${processos.map((p: any) => `
      <div style="margin:16px 0; padding:12px 16px; background:#fafafa; border:1px solid #eee; border-radius:6px;">
        <p style="margin:0 0 6px; font-weight:700; color:#1a1a1a; font-size:14px;">${p.numeroProcesso} — ${p.tribunal}</p>
        <p style="margin:0 0 4px; font-size:12px; color:#555;"><strong>Classe:</strong> ${p.classe || '—'}</p>
        <p style="margin:0 0 4px; font-size:12px; color:#555;"><strong>Assuntos:</strong> ${(p.assuntos || []).join(', ') || '—'}</p>
        <p style="margin:0 0 4px; font-size:12px; color:#555;"><strong>Órgão Julgador:</strong> ${p.orgaoJulgador || '—'}</p>
        ${(p.movimentos || []).length > 0 ? `
          <p style="margin:8px 0 4px; font-size:11px; font-weight:600; color:#1a1a1a; text-transform:uppercase;">Últimas Movimentações:</p>
          ${(p.movimentos || []).slice(0, 5).map((m: any) => `
            <p style="margin:2px 0; font-size:11px; color:#666; padding-left:8px; border-left:2px solid #c0392b;">
              ${m.data ? new Date(m.data).toLocaleDateString('pt-BR') : '—'} — ${m.nome || 'Movimentação'}
            </p>
          `).join('')}
        ` : ''}
      </div>
    `).join('')}
    ` : ''}
    <p style="font-size:12px; color:#999; margin-top:24px;">Este relatório é gerado automaticamente pelo sistema TMSEGo. Para consultar detalhes completos, acesse o menu Jurídico no painel.</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `Relatório Jurídico — ${processos.length} processo(s) — ${searchDate}`,
      html,
    });
    console.log(`[Email] Relatório jurídico enviado → ${to} | ${processos.length} processos`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar relatório jurídico:`, err.message);
    return false;
  }
}

export async function sendPendingInfoReport(to: string, missions: any[], reportDate: string): Promise<boolean> {
  const missionsHtml = missions.length === 0
    ? '<p style="color:#27ae60; font-style:italic; text-align:center; padding:20px; font-weight:600;">Nenhuma OS com pendências encontrada. Parabéns!</p>'
    : missions.map((m: any, idx: number) => {
      const pendencias: string[] = [];
      if (!m.start_km && m.start_km !== 0) pendencias.push('KM Inicial');
      if (!m.end_km && m.end_km !== 0) pendencias.push('KM Final');
      if (!m.start_time) pendencias.push('Hora Início');
      if (!m.end_time) pendencias.push('Hora Fim');
      if (!m.origin) pendencias.push('Origem');
      if (!m.destination) pendencias.push('Destino');
      if (!m.driver_name) pendencias.push('Motorista');
      if (!m.client_vehicle) pendencias.push('Veículo Escoltado');
      if (!m.agent1) pendencias.push('Agente 1');
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      return `
        <tr style="background:${bgColor}; border-bottom:1px solid #eee;">
          <td style="padding:8px 12px; font-weight:700; color:#7f1d1d; font-size:13px; white-space:nowrap;">${m.id || '—'}</td>
          <td style="padding:8px 12px; color:#333; font-size:12px;">${m.client || '—'}</td>
          <td style="padding:8px 12px; color:#333; font-size:12px;">${m.provider || '—'}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px;">${(m.origin || '—').substring(0, 40)}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px;">${(m.destination || '—').substring(0, 40)}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px;">${m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td>
          <td style="padding:8px 12px;">
            ${pendencias.map(p => `<span style="display:inline-block; background:#fef2f2; color:#dc2626; font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; margin:1px 2px; border:1px solid #fecaca;">${p}</span>`).join('')}
          </td>
        </tr>
      `;
    }).join('');

  const html = baseTemplate(`
    <h2 style="color:#7f1d1d;">Relatório de OS Concluídas com Pendências</h2>
    <div class="highlight-box">
      <p><strong>Data do Relatório:</strong> ${reportDate}</p>
      <p><strong>Total de OS com Pendências:</strong> <span class="badge" style="background:#dc2626;">${missions.length}</span></p>
    </div>
    <p style="font-size:13px; color:#333; margin:16px 0; line-height:1.6;">
      Prezada Michelle,<br><br>
      Segue abaixo a relação de <strong>Ordens de Serviço concluídas</strong> que estão com <strong>informações pendentes</strong> no sistema.
      Por favor, providencie a regularização dos dados faltantes o mais breve possível para garantir o correto faturamento e fechamento das OS.
    </p>
    ${missions.length > 0 ? `
    <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:12px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
      <thead>
        <tr style="background:#7f1d1d;">
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">OS</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Cliente</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Fornecedor</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Origem</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Destino</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Criada</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Pendências</th>
        </tr>
      </thead>
      <tbody>${missionsHtml}</tbody>
    </table>
    ` : ''}
    <p style="font-size:12px; color:#999; margin-top:24px;">Este relatório é gerado automaticamente pelo sistema TMSEGo todos os dias às 07:30 (horário de Brasília).</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `Pendências em OS Concluídas — ${missions.length} OS — ${reportDate}`,
      html,
    });
    console.log(`[Email] Relatório de pendências enviado → ${to} | ${missions.length} OS`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar relatório de pendências:`, err.message);
    return false;
  }
}

export async function sendApprovalPendingReport(to: string, missions: any[], reportDate: string): Promise<boolean> {
  const missionsHtml = missions.length === 0
    ? '<p style="color:#27ae60; font-style:italic; text-align:center; padding:20px; font-weight:600;">Nenhuma OS pendente de aprovação. Tudo em dia!</p>'
    : missions.map((m: any, idx: number) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      const createdDate = m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
      const startDate = m.start_time ? new Date(m.start_time).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
      return `
        <tr style="background:${bgColor}; border-bottom:1px solid #eee;">
          <td style="padding:8px 12px; font-weight:700; color:#7f1d1d; font-size:13px; white-space:nowrap;">${m.id || '—'}</td>
          <td style="padding:8px 12px; color:#333; font-size:12px;">${m.client || '—'}</td>
          <td style="padding:8px 12px; color:#333; font-size:12px;">${m.provider || '—'}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px;">${(m.origin || '—').substring(0, 35)}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px;">${(m.destination || '—').substring(0, 35)}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px; white-space:nowrap;">${startDate}</td>
          <td style="padding:8px 12px; color:#555; font-size:11px; white-space:nowrap;">${createdDate}</td>
          <td style="padding:8px 12px; text-align:center;">
            <span style="display:inline-block; background:#fef3c7; color:#b45309; font-size:10px; font-weight:700; padding:2px 10px; border-radius:10px; border:1px solid #fde68a;">${m.status || 'Concluída'}</span>
          </td>
        </tr>
      `;
    }).join('');

  const html = baseTemplate(`
    <h2 style="color:#7f1d1d;">OS Pendentes de Aprovação</h2>
    <div class="highlight-box">
      <p><strong>Data do Relatório:</strong> ${reportDate}</p>
      <p><strong>Total de OS Aguardando Aprovação:</strong> <span class="badge" style="background:#b45309;">${missions.length}</span></p>
    </div>
    <p style="font-size:13px; color:#333; margin:16px 0; line-height:1.6;">
      Prezado Daniel,<br><br>
      Segue abaixo a relação de <strong>Ordens de Serviço concluídas</strong> que estão aguardando a sua <strong>aprovação</strong> no sistema.
      Por favor, analise e aprove as OS listadas para que possam seguir para o faturamento.
    </p>
    ${missions.length > 0 ? `
    <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:12px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
      <thead>
        <tr style="background:#7f1d1d;">
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">OS</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Cliente</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Fornecedor</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Origem</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Destino</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Data Viagem</th>
          <th style="padding:10px 12px; text-align:left; font-weight:700; color:#fff; font-size:11px;">Criada</th>
          <th style="padding:10px 12px; text-align:center; font-weight:700; color:#fff; font-size:11px;">Status</th>
        </tr>
      </thead>
      <tbody>${missionsHtml}</tbody>
    </table>
    ` : ''}
    <p style="font-size:12px; color:#999; margin-top:24px;">Este relatório é gerado automaticamente pelo sistema TMSEGo todos os dias às 07:30 (horário de Brasília).</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `OS Pendentes de Aprovação — ${missions.length} OS — ${reportDate}`,
      html,
    });
    console.log(`[Email] Relatório de aprovações enviado → ${to} | ${missions.length} OS`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar relatório de aprovações:`, err.message);
    return false;
  }
}

export async function sendCancelledMissingInfoEmail(to: string, mission: any, missingFields: string[]): Promise<boolean> {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const fieldsHtml = missingFields.map(f => `<li style="padding:4px 0; color:#c0392b; font-weight:600;">${f}</li>`).join('');

  const html = baseTemplate(`
    <h2>⚠️ OS Cancelada com Dados Incompletos</h2>
    <div class="highlight-box">
      <p><strong>A missão abaixo foi cancelada, mas está com informações cruciais faltando para o cálculo financeiro.</strong></p>
    </div>
    <table class="info-table">
      <tr><td>OS</td><td><strong>${mission.id || '—'}</strong></td></tr>
      <tr><td>Cliente</td><td>${mission.client || '—'}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Data Agendamento</td><td>${mission.scheduledDate || mission.scheduled_date || '—'}</td></tr>
      <tr><td>Status</td><td><span class="badge">CANCELADA</span></td></tr>
      <tr><td>Cancelada em</td><td>${now}</td></tr>
    </table>
    <h3 style="color:#c0392b; margin-top:20px;">Campos Faltantes:</h3>
    <ul style="list-style:none; padding-left:0;">
      ${fieldsHtml}
    </ul>
    <p style="margin-top:16px; font-size:13px; color:#555;">Por favor, verifique e preencha os dados faltantes no sistema para garantir o correto faturamento.</p>
    <p style="font-size:12px; color:#999; margin-top:24px;">Este alerta é gerado automaticamente pelo sistema TMSEGo.</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `⚠️ OS ${mission.id} Cancelada — Dados Incompletos para Cálculo`,
      html,
    });
    console.log(`[Email] Alerta de OS cancelada com dados faltantes enviado → ${to} | OS: ${mission.id}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar alerta de cancelamento:`, err.message);
    return false;
  }
}

export async function sendDailyMissingInfoReport(to: string, missions: any[], reportDate: string): Promise<boolean> {
  const missionsHtml = missions.map((m: any) => {
    const missing: string[] = [];
    if (!m.start_km && m.start_km !== 0) missing.push('KM Inicial');
    if (!m.end_km && m.end_km !== 0) missing.push('KM Final');
    if (!m.start_time) missing.push('Hora Inicial');
    if (!m.end_time) missing.push('Hora Final');
    if (!m.agent1 || m.agent1 === '---' || m.agent1 === 'N/A') missing.push('Agente');
    if (!m.provider || m.provider === '---') missing.push('Fornecedor');
    if (!m.origin) missing.push('Origem');
    if (!m.destination) missing.push('Destino');
    if (!m.driver_name) missing.push('Motorista');
    if (!m.client_vehicle) missing.push('Veículo');
    return `<tr>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-weight:600;">${m.id}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${m.client || '—'}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${m.status || '—'}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${m.scheduled_date || m.created_at?.split('T')[0] || '—'}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#c0392b; font-weight:600;">${missing.join(', ')}</td>
    </tr>`;
  }).join('');

  const html = baseTemplate(`
    <h2>Relatório Diário — Missões com Dados Incompletos</h2>
    <div class="highlight-box">
      <p><strong>${missions.length} missão(ões)</strong> encontrada(s) com informações faltantes que impedem o cálculo financeiro correto.</p>
    </div>
    <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:13px;">
      <thead>
        <tr style="background:#1a1a1a; color:#fff;">
          <th style="padding:10px 12px; text-align:left;">OS</th>
          <th style="padding:10px 12px; text-align:left;">Cliente</th>
          <th style="padding:10px 12px; text-align:left;">Status</th>
          <th style="padding:10px 12px; text-align:left;">Data</th>
          <th style="padding:10px 12px; text-align:left;">Campos Faltantes</th>
        </tr>
      </thead>
      <tbody>${missionsHtml}</tbody>
    </table>
    <p style="font-size:12px; color:#999; margin-top:24px;">Este relatório é gerado automaticamente pelo sistema TMSEGo todos os dias às 08:00 (horário de Brasília).</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `📋 Missões com Dados Incompletos — ${missions.length} OS — ${reportDate}`,
      html,
    });
    console.log(`[Email] Relatório diário de dados faltantes enviado → ${to} | ${missions.length} OS`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar relatório de dados faltantes:`, err.message);
    return false;
  }
}

export async function sendStuckNfsReport(to: string, items: any[], reportDate: string): Promise<boolean> {
  if (!items || items.length === 0) return false;
  const byCompany: Record<string, any[]> = {};
  items.forEach(it => {
    const k = it.issuer_company || '(sem emissora)';
    if (!byCompany[k]) byCompany[k] = [];
    byCompany[k].push(it);
  });
  const fmtBRL = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const blocks = Object.entries(byCompany).map(([company, list]) => {
    const rows = list.map(it => {
      const provider = (it.nf_provider || 'ASAAS').toUpperCase();
      const provColor = provider === 'PLUGNOTAS' ? '#0e7490' : '#7c3aed';
      const provBg = provider === 'PLUGNOTAS' ? '#cffafe' : '#ede9fe';
      return `<tr>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; font-weight:600;">${it.number || it.id?.substring(0, 8)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${it.client || '—'}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">${fmtBRL(it.amount)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;">${it.hours_stuck || '—'}h</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;"><span style="display:inline-block; padding:2px 8px; background:${provBg}; color:${provColor}; border-radius:10px; font-size:10px; font-weight:700;">${provider}</span></td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#c0392b; font-weight:600;">${it.nf_status || '—'}</td>
    </tr>`;
    }).join('');
    return `<h3 style="margin-top:20px; color:#c0392b;">${company} — ${list.length} NF(s) travada(s)</h3>
      <table style="width:100%; border-collapse:collapse; margin:8px 0; font-size:13px;">
        <thead><tr style="background:#1a1a1a; color:#fff;">
          <th style="padding:10px 12px; text-align:left;">NF</th>
          <th style="padding:10px 12px; text-align:left;">Cliente</th>
          <th style="padding:10px 12px; text-align:right;">Valor</th>
          <th style="padding:10px 12px; text-align:center;">Tempo travada</th>
          <th style="padding:10px 12px; text-align:center;">Emissora</th>
          <th style="padding:10px 12px; text-align:left;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  const html = baseTemplate(`
    <h2>NFs Travadas — Verificação Necessária na Emissora</h2>
    <div class="highlight-box">
      <p><strong>${items.length} NF(s)</strong> permanecem em andamento há mais de 24 horas sem autorização da Prefeitura.</p>
      <p style="margin-top:8px;">Causa provável: configuração da empresa emissora junto ao provider de NF (Asaas ou PlugNotas) ou na Prefeitura — Inscrição Municipal, certificado digital ou habilitação. Verifique a coluna <strong>Emissora</strong> abaixo para identificar o provider de cada NF e tomar a ação correspondente no painel certo.</p>
    </div>
    ${blocks}
    <p style="font-size:12px; color:#999; margin-top:24px;">Relatório gerado automaticamente pelo TMSEGo. Faturas listadas estão pausadas para retentativas até o problema ser resolvido. Use o botão "Reemitir NF" no controle financeiro após corrigir a configuração.</p>
  `);

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: `🚨 NFs travadas — ${items.length} pendente(s) — ${reportDate}`,
      html,
    });
    console.log(`[Email] Relatório de NFs travadas enviado → ${to} | ${items.length} NF(s)`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar relatório de NFs travadas:`, err.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DHL Supplier Intake — e-mails (paleta DHL amarelo/vermelho + logo TM SEG)
// ──────────────────────────────────────────────────────────────────────────
function dhlTemplate(content: string, isDhl: boolean = true): string {
  // A identidade amarela (#FFCC00) é exclusiva da DHL. Para os demais clientes
  // o template usa a paleta neutra TM SEG (vermelho/preto), sem barras amarelas.
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const subColor = isDhl ? '#FFCC00' : '#bbb';
  const topBars = isDhl
    ? `<div class="dhl-bar"></div>\n  <div class="dhl-red-bar"></div>`
    : `<div style="background:#D40511; height:8px;"></div>`;
  // A barra amarela (#FFCC00) só existe no CSS quando o e-mail é da DHL. Para os
  // demais clientes nem a definição da classe é emitida — evita que a identidade
  // amarela "vaze" no HTML (mesmo que invisível) para fornecedores de outros clientes.
  const dhlBarStyles = isDhl
    ? `\n  .dhl-bar { background:#FFCC00; height:8px; }\n  .dhl-red-bar { background:#D40511; height:4px; }`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',Arial,sans-serif; }
  .container { max-width:640px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }${dhlBarStyles}
  .header { background:#1a1a1a; padding:24px 32px; text-align:center; }
  .header h1 { color:#fff; font-size:22px; margin:0 0 4px; letter-spacing:1px; }
  .header h1 .red { color:#D40511; font-weight:700; }
  .header .sub { color:${subColor}; font-size:11px; margin:0; letter-spacing:2px; text-transform:uppercase; font-weight:700; }
  .body-content { padding:32px; color:#333; line-height:1.65; font-size:14px; }
  .body-content h2 { color:#D40511; font-size:18px; border-bottom:3px solid ${accent}; padding-bottom:8px; margin:0 0 16px; }
  .cta { display:inline-block; background:#D40511; color:#fff !important; padding:14px 26px; border-radius:6px; text-decoration:none; font-weight:700; letter-spacing:0.5px; margin:8px 0; }
  .info-table { width:100%; border-collapse:collapse; margin:14px 0; font-size:13px; }
  .info-table td { padding:8px 12px; border-bottom:1px solid #eee; vertical-align:top; }
  .info-table td:first-child { font-weight:600; width:38%; color:#1a1a1a; }
  .highlight { background:${isDhl ? '#FFFBE6' : '#fbeaec'}; border-left:4px solid ${accent}; padding:12px 16px; margin:14px 0; border-radius:0 4px 4px 0; font-size:13px; }
  .tech-block { background:#fafafa; border:1px solid #eee; border-radius:6px; padding:14px 16px; margin:10px 0; font-size:13px; }
  .tech-title { color:#D40511; font-weight:700; margin:0 0 6px; font-size:14px; }
  .footer { background:#1a1a1a; padding:18px 32px; text-align:center; border-top:4px solid ${accent}; }
  .footer p { color:#999; font-size:11px; margin:3px 0; }
  .footer .company { color:#fff; font-weight:700; }
</style></head>
<body>
<div class="container">
  ${topBars}
  <div class="header">
    <h1>GRUPO <span class="red">TM SEG</span></h1>
    <p class="sub">Intermediação de Escolta Armada</p>
  </div>
  <div class="body-content">${content}</div>
  <div class="footer">
    <p class="company">Grupo TM SEG</p>
    <p>Intermediação de Escolta Armada</p>
    <p style="margin-top:6px; color:#666;">E-mail automático. Dúvidas: operacional@grupotmseg.com.br</p>
  </div>
</div>
</body></html>`;
}

function dhlTechBlocksHtml(): string {
  return `
  <div class="tech-block">
    <p class="tech-title">OMNILINK</p>
    <p style="margin:0;">DHL SUPPLY CHAIN — CNPJ 00.233.065/0001-87 — IP <strong>131.255.103.146</strong> — Porta <strong>9001</strong>.<br/>
    <strong>Obrigatório anexar a ficha de ativação</strong> quando o veículo possuir rastreador Omnilink instalado.</p>
  </div>
  <div class="tech-block">
    <p class="tech-title">SASCAR</p>
    <p style="margin:0;">Portal Sascar → Serviços → <em>Direcionamento de Sinal</em>. No campo <strong>Gerenciadora</strong>, inserir conta: <strong>DHL LOGISTICS (BRASIL) LTDA (FILIAL) – RASTREAMENTO</strong>.</p>
  </div>
  <div class="tech-block">
    <p class="tech-title">ONIXSAT / JABURSAT</p>
    <p style="margin:0;">Espelhar sinal para <strong>Central Unidocks/DHL — CNPJ 00.233.065/0001-87</strong>. Onixsat → Menu ADM → Espelhamento → Espelhamento de Equipamento. Alternativa: telefone <strong>(43) 3371-3700</strong>.</p>
  </div>
  <div class="tech-block">
    <p class="tech-title">SIGHRA</p>
    <p style="margin:0;">Se possuir o software Sighra: opção <em>Filas do Veículo</em>. Se não, enviar e-mail para <strong>suporte@sighra.com.br</strong> com placa + ID do veículo + conta <strong>DHL LOGISTICS (BRASIL)</strong>.</p>
  </div>
  <div class="tech-block">
    <p class="tech-title">AUTOTRAC</p>
    <p style="margin:0;">Supervisor Web → botão direito no veículo → Roteamento → <em>Inserir roteamento express</em>. Companhia: <strong>DHL</strong> (validar companhia). Perfil: <strong>(Perfil Normal) Retorno Completo (sem cópia)</strong>.</p>
  </div>`;
}

export async function sendDhlSupplierIntakeEmail(opts: {
  to: string;
  providerName: string;
  osNumber: string;
  seNumber: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  link: string;
  isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const seRow = isDhl ? `<tr><td>Nº S.E.</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  // Instruções técnicas de espelhamento (IPs/portas/contas) são exclusivas da DHL.
  // Para os demais clientes, pedimos apenas o espelhamento e o comprovante.
  const espelhamentoBloco = isDhl
    ? `
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:24px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Instruções de Espelhamento — por tecnologia</h3>
    <p style="font-size:13px; color:#555;">Realize o espelhamento conforme a tecnologia do veículo cadastrado:</p>
    ${dhlTechBlocksHtml()}`
    : `
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:24px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Espelhamento do sinal</h3>
    <p style="font-size:13px; color:#555;">Realize o espelhamento do sinal de rastreamento conforme orientação do Operacional TM Seg e anexe o comprovante (print) ao preencher o veículo.</p>`;
  const html = dhlTemplate(`
    <h2>Solicitação de Escolta — Preencher Dados</h2>
    <p>Olá, <strong>${opts.providerName}</strong>.</p>
    <p>Foi gerada uma nova Ordem de Serviço pelo Grupo TM SEG. Para prosseguir, é necessário preencher os dados dos <strong>2 escoltistas e do veículo</strong> através do link abaixo:</p>
    <p style="text-align:center; margin:20px 0;">
      <a class="cta" href="${opts.link}">Preencher dados da escolta</a>
    </p>
    <p style="font-size:12px; color:#888; text-align:center;">Ou copie e cole no navegador:<br/><span style="word-break:break-all;">${opts.link}</span></p>

    <h3 style="color:#1a1a1a; font-size:15px; margin-top:24px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Dados da OS</h3>
    <table class="info-table">
      <tr><td>OS TM SEG</td><td>${opts.osNumber}</td></tr>
      ${seRow}
      <tr><td>Origem</td><td>${opts.origin}</td></tr>
      <tr><td>Destino</td><td>${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
    </table>

    <div class="highlight">
      <strong>Ordem de preenchimento:</strong> Escoltista 1 → Escoltista 2 → Veículo.<br/>
      Se o escoltista ou o veículo já tiver sido cadastrado anteriormente, é possível selecioná-lo na lista para reaproveitamento.
    </div>
    ${espelhamentoBloco}

    <p style="margin-top:20px; font-size:12px; color:#888;">Após o preenchimento, nossa equipe operacional será notificada automaticamente.</p>
  `, isDhl);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    bcc: ['operacional@grupotmseg.com.br'],
    subject: isDhl
      ? `[TM SEG] Preencher dados de escolta — OS ${opts.osNumber} — S.E. ${opts.seNumber}`
      : `[TM SEG] Preencher dados de escolta — OS ${opts.osNumber}`,
    html,
  });
  console.log(`[Email] Intake fornecedor enviado → ${opts.to} | OS ${opts.osNumber}`);
}

export async function sendDhlIntakeSubmittedEmail(opts: {
  to: string;
  providerName: string;
  osNumber: string;
  seNumber: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  agent1: any;
  agent2: any;
  vehicle: any;
  mirrorProofUrl?: string | null;
  mirrorProofFilename?: string | null;
  isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const accent = isDhl ? '#FFCC00' : '#D40511';
  const a = (x: any) => x || {};
  const fmt = (v: any) => v ? String(v) : '—';
  const escoltistaHtml = (label: string, x: any) => {
    const e = a(x);
    return `
      <h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">${label}</h3>
      <table class="info-table">
        <tr><td>Nome</td><td>${fmt(e.nome)}</td></tr>
        <tr><td>CPF</td><td>${fmt(e.cpf)}</td></tr>
        <tr><td>RG</td><td>${fmt(e.rg)}</td></tr>
        <tr><td>Órgão emissor / UF</td><td>${fmt(e.orgao_emissor)}</td></tr>
        <tr><td>CNH</td><td>${fmt(e.cnh)}</td></tr>
        <tr><td>Categoria CNH</td><td>${fmt(e.cnh_categoria)}</td></tr>
        <tr><td>Vencimento CNH</td><td>${fmt(e.cnh_vencimento)}</td></tr>
        <tr><td>CNV Número</td><td>${fmt(e.cnv_numero)}</td></tr>
        <tr><td>Validade CNV</td><td>${fmt(e.cnv_validade)}</td></tr>
        <tr><td>Rua</td><td>${fmt(e.rua)}</td></tr>
        <tr><td>Número</td><td>${fmt(e.numero)}</td></tr>
        <tr><td>Complemento</td><td>${fmt(e.complemento)}</td></tr>
        <tr><td>Bairro</td><td>${fmt(e.bairro)}</td></tr>
        <tr><td>Cidade</td><td>${fmt(e.cidade)}</td></tr>
        <tr><td>UF</td><td>${fmt(e.uf)}</td></tr>
        <tr><td>CEP</td><td>${fmt(e.cep)}</td></tr>
        <tr><td>Celular</td><td>${fmt(e.celular)}</td></tr>
        <tr><td>Admissão</td><td>${fmt(e.admissao)}</td></tr>
      </table>`;
  };
  const v = a(opts.vehicle);
  const veicHtml = `
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Veículo</h3>
    <table class="info-table">
      <tr><td>Placa</td><td><strong>${fmt(v.placa)}</strong></td></tr>
      <tr><td>Renavam</td><td>${fmt(v.renavam)}</td></tr>
      <tr><td>Marca</td><td>${fmt(v.marca)}</td></tr>
      <tr><td>Modelo</td><td>${fmt(v.modelo)}</td></tr>
      <tr><td>Ano</td><td>${fmt(v.ano)}</td></tr>
      <tr><td>Cor</td><td>${fmt(v.cor)}</td></tr>
      <tr><td>Tecnologia</td><td><strong>${fmt(v.tecnologia)}</strong></td></tr>
      <tr><td>ID Rastreador</td><td>${fmt(v.id_rastreador)}</td></tr>
      <tr><td>Comunicação</td><td>${fmt(v.comunicacao)}</td></tr>
    </table>`;

  const seRow = isDhl ? `<tr><td>Nº S.E. DHL</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  const html = dhlTemplate(`
    <h2>OS — Dados Preenchidos pelo Fornecedor</h2>
    <p>O fornecedor <strong>${opts.providerName}</strong> concluiu o preenchimento dos dados da escolta:</p>
    <table class="info-table">
      <tr><td>OS</td><td>${opts.osNumber}</td></tr>
      ${seRow}
      <tr><td>Trajeto</td><td>${opts.origin} → ${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
    </table>
    ${escoltistaHtml('Escoltista 1', opts.agent1)}
    ${escoltistaHtml('Escoltista 2', opts.agent2)}
    ${veicHtml}
    ${opts.mirrorProofUrl ? `
    <h3 style="color:#1a1a1a; font-size:15px; margin-top:20px; border-bottom:2px solid ${accent}; padding-bottom:6px;">Comprovante de Espelhamento</h3>
    <p style="margin:8px 0;">O fornecedor anexou o print confirmando que o espelhamento foi realizado.</p>
    <p style="margin:8px 0;"><a href="${opts.mirrorProofUrl}" target="_blank" style="display:inline-block; background:#D40511; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; font-weight:bold;">Abrir comprovante${opts.mirrorProofFilename ? ' — ' + opts.mirrorProofFilename : ''}</a></p>
    ` : `
    <div class="highlight" style="margin-top:20px; background:${isDhl ? '#fff3cd' : '#fbeaec'}; border-left:4px solid ${accent};">
      <strong>Atenção:</strong> o fornecedor não anexou comprovante do espelhamento.
    </div>
    `}
    <div class="highlight" style="margin-top:20px;">
      <strong>Próximo passo:</strong> conferir os dados acima e o comprovante de espelhamento.
    </div>
  `, isDhl);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: isDhl
      ? `[DHL] Dados recebidos — OS ${opts.osNumber} — S.E. ${opts.seNumber} — ${opts.providerName}`
      : `[TM SEG] Dados recebidos — OS ${opts.osNumber} — ${opts.providerName}`,
    html,
  });
  console.log(`[Email] DHL intake recebido → ${opts.to} | OS ${opts.osNumber}`);
}

export async function sendDhlIntakeExpiredEmail(opts: {
  to: string;
  expired: Array<{
    osNumber: string;
    seNumber: string;
    providerName: string;
    sentAt: string;
    sentTo: string;
    expiredAt: string;
    origin: string;
    destination: string;
    scheduledAt: string;
  }>;
}): Promise<void> {
  if (!opts.expired || opts.expired.length === 0) return;

  const rows = opts.expired.map(item => `
    <tr>
      <td><strong>${item.osNumber}</strong></td>
      <td>${item.seNumber || '—'}</td>
      <td>${item.providerName}</td>
      <td>${item.sentTo || '—'}<br/><span style="color:#888; font-size:11px;">enviado em ${item.sentAt}</span></td>
      <td>${item.origin} → ${item.destination}<br/><span style="color:#888; font-size:11px;">início ${item.scheduledAt}</span></td>
      <td style="color:#D40511;"><strong>${item.expiredAt}</strong></td>
    </tr>`).join('');

  const html = dhlTemplate(`
    <h2>Atenção — Link(s) DHL Expirado(s) sem Preenchimento</h2>
    <p>O(s) link(s) abaixo de coleta de dados do fornecedor (Escoltistas + Veículo) <strong>expirou(aram)</strong> sem que o fornecedor concluísse o preenchimento. A OS pode chegar ao início sem os dados necessários para o espelhamento e a operação.</p>
    <p><strong>Total de links expirados nesta verificação:</strong> ${opts.expired.length}</p>
    <table class="info-table" style="width:100%;">
      <thead>
        <tr style="background:#fff3cd;">
          <th style="text-align:left; padding:8px;">OS</th>
          <th style="text-align:left; padding:8px;">S.E.</th>
          <th style="text-align:left; padding:8px;">Fornecedor</th>
          <th style="text-align:left; padding:8px;">Envio</th>
          <th style="text-align:left; padding:8px;">Trajeto / Início</th>
          <th style="text-align:left; padding:8px;">Expirou em</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="highlight" style="margin-top:20px; background:#fff3cd; border-left:4px solid #FFCC00;">
      <strong>Ação recomendada:</strong> entrar em contato com o fornecedor e/ou gerar um novo link para preenchimento direto no painel da OS.
    </div>
    <p style="margin-top:14px; font-size:12px; color:#888;">No painel da OS o status do link aparece como <strong>Expirado</strong>.</p>
  `);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: `[DHL] ${opts.expired.length} link(s) de fornecedor expirado(s) sem preenchimento`,
    html,
  });
  console.log(`[Email] DHL intake expirado → ${opts.to} | ${opts.expired.length} link(s)`);
}

export async function sendDhlIntakeReminderProviderEmail(opts: {
  to: string;
  providerName: string;
  osNumber: string;
  seNumber: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  expiresAt: string;
  link: string;
  firstOpenedAt: string | null;
  reason: 'opened_abandoned' | 'expiry_approaching';
  isDhl?: boolean;
}): Promise<void> {
  const isDhl = opts.isDhl !== false;
  const seRow = isDhl ? `<tr><td>Nº S.E.</td><td><strong>${opts.seNumber}</strong></td></tr>` : '';
  const motivoTxt = opts.reason === 'opened_abandoned'
    ? `Notamos que o link foi aberto em <strong>${opts.firstOpenedAt}</strong>, mas o preenchimento ainda não foi concluído.`
    : `O link de preenchimento <strong>expira em ${opts.expiresAt}</strong> e ainda não foi concluído.`;

  const html = dhlTemplate(`
    <h2>Lembrete — Preenchimento Pendente</h2>
    <p>Olá, <strong>${opts.providerName}</strong>.</p>
    <p>${motivoTxt}</p>
    <p>Para que a OS possa começar com todos os dados necessários para o espelhamento e a operação, pedimos que conclua o preenchimento dos <strong>2 escoltistas e do veículo</strong> através do link abaixo:</p>
    <p style="text-align:center; margin:20px 0;">
      <a class="cta" href="${opts.link}">Concluir preenchimento</a>
    </p>
    <p style="font-size:12px; color:#888; text-align:center;">Ou copie e cole no navegador:<br/><span style="word-break:break-all;">${opts.link}</span></p>

    <table class="info-table">
      <tr><td>OS TM SEG</td><td>${opts.osNumber}</td></tr>
      ${seRow}
      <tr><td>Origem</td><td>${opts.origin}</td></tr>
      <tr><td>Destino</td><td>${opts.destination}</td></tr>
      <tr><td>Início previsto</td><td>${opts.scheduledAt}</td></tr>
      <tr><td>Link expira em</td><td>${opts.expiresAt}</td></tr>
    </table>

    <div class="highlight" style="margin-top:20px; background:${isDhl ? '#fff3cd' : '#fbeaec'}; border-left:4px solid ${isDhl ? '#FFCC00' : '#D40511'};">
      <strong>Importante:</strong> sem o preenchimento, a operação não consegue prosseguir com o espelhamento. Em caso de dúvida, responda este e-mail ou fale com o Operacional TM Seg.
    </div>
  `, isDhl);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    bcc: ['operacional@grupotmseg.com.br'],
    subject: isDhl
      ? `[TM SEG] Lembrete: concluir preenchimento — OS ${opts.osNumber} — S.E. ${opts.seNumber}`
      : `[TM SEG] Lembrete: concluir preenchimento — OS ${opts.osNumber}`,
    html,
  });
  console.log(`[Email] DHL intake reminder (fornecedor) → ${opts.to} | OS ${opts.osNumber}`);
}

export async function sendDhlIntakeReminderOperacionalEmail(opts: {
  to: string;
  pending: Array<{
    osNumber: string;
    seNumber: string;
    providerName: string;
    sentAt: string;
    sentTo: string;
    firstOpenedAt: string | null;
    expiresAt: string;
    origin: string;
    destination: string;
    scheduledAt: string;
    reason: 'opened_abandoned' | 'expiry_approaching';
  }>;
}): Promise<void> {
  if (!opts.pending || opts.pending.length === 0) return;

  const rows = opts.pending.map(item => {
    const motivo = item.reason === 'opened_abandoned'
      ? `<span style="color:#D40511;">Abriu mas não concluiu</span><br/><span style="color:#888; font-size:11px;">abertura: ${item.firstOpenedAt || '—'}</span>`
      : `<span style="color:#D40511;">Link expira em breve sem preenchimento</span><br/><span style="color:#888; font-size:11px;">expira: ${item.expiresAt}</span>`;
    return `
    <tr>
      <td><strong>${item.osNumber}</strong></td>
      <td>${item.seNumber || '—'}</td>
      <td>${item.providerName}</td>
      <td>${item.sentTo || '—'}<br/><span style="color:#888; font-size:11px;">enviado em ${item.sentAt}</span></td>
      <td>${item.origin} → ${item.destination}<br/><span style="color:#888; font-size:11px;">início ${item.scheduledAt}</span></td>
      <td>${motivo}</td>
      <td>${item.expiresAt}</td>
    </tr>`;
  }).join('');

  const html = dhlTemplate(`
    <h2>Atenção — Link(s) DHL aguardando preenchimento</h2>
    <p>O(s) fornecedor(es) abaixo <strong>ainda não concluiu(ram)</strong> o preenchimento do link DHL. Um lembrete automático foi enviado por e-mail ao fornecedor; recomenda-se também contato direto.</p>
    <p><strong>Total nesta verificação:</strong> ${opts.pending.length}</p>
    <table class="info-table" style="width:100%;">
      <thead>
        <tr style="background:#fff3cd;">
          <th style="text-align:left; padding:8px;">OS</th>
          <th style="text-align:left; padding:8px;">S.E.</th>
          <th style="text-align:left; padding:8px;">Fornecedor</th>
          <th style="text-align:left; padding:8px;">Envio</th>
          <th style="text-align:left; padding:8px;">Trajeto / Início</th>
          <th style="text-align:left; padding:8px;">Motivo</th>
          <th style="text-align:left; padding:8px;">Expira em</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="highlight" style="margin-top:20px; background:#fff3cd; border-left:4px solid #FFCC00;">
      <strong>Ação recomendada:</strong> contatar o fornecedor pelo WhatsApp/telefone para garantir que o preenchimento seja concluído antes do início da OS.
    </div>
    <p style="margin-top:14px; font-size:12px; color:#888;">Este lembrete é enviado apenas uma vez por link (não há duplicidade).</p>
  `);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: `[DHL] ${opts.pending.length} link(s) de fornecedor aguardando preenchimento`,
    html,
  });
  console.log(`[Email] DHL intake reminder (operacional) → ${opts.to} | ${opts.pending.length} link(s)`);
}

export async function sendDhlIntakeOperationalFollowupEmail(opts: {
  to: string;
  thresholdHours: number;
  pending: Array<{
    osNumber: string;
    seNumber: string;
    providerName: string;
    sentTo: string;
    reminderSentAt: string;
    hoursSinceReminder: number;
    firstOpenedAt: string | null;
    expiresAt: string;
    origin: string;
    destination: string;
    scheduledAt: string;
  }>;
}): Promise<void> {
  if (!opts.pending || opts.pending.length === 0) return;

  const rows = opts.pending.map(item => {
    const aberto = item.firstOpenedAt
      ? `<span style="color:#888; font-size:11px;">abriu em ${item.firstOpenedAt}</span>`
      : `<span style="color:#D40511; font-size:11px;">não abriu o link</span>`;
    return `
    <tr>
      <td><strong>${item.osNumber}</strong></td>
      <td>${item.seNumber || '—'}</td>
      <td>${item.providerName}</td>
      <td>${item.sentTo || '—'}</td>
      <td>${item.reminderSentAt}<br/><span style="color:#888; font-size:11px;">há ~${item.hoursSinceReminder}h</span></td>
      <td>${aberto}</td>
      <td>${item.origin} → ${item.destination}<br/><span style="color:#888; font-size:11px;">início ${item.scheduledAt}</span></td>
      <td>${item.expiresAt}</td>
    </tr>`;
  }).join('');

  const html = dhlTemplate(`
    <h2>Atenção — Fornecedor(es) sem resposta ao lembrete DHL</h2>
    <p>Já se passaram <strong>mais de ${opts.thresholdHours} hora(s)</strong> desde o lembrete automático e o(s) fornecedor(es) abaixo <strong>ainda não preencheu(ram)</strong> o link DHL. Recomenda-se contato manual imediato (ligação/WhatsApp) para evitar que o link expire.</p>
    <p><strong>Total nesta verificação:</strong> ${opts.pending.length}</p>
    <table class="info-table" style="width:100%;">
      <thead>
        <tr style="background:#fde2e1;">
          <th style="text-align:left; padding:8px;">OS</th>
          <th style="text-align:left; padding:8px;">S.E.</th>
          <th style="text-align:left; padding:8px;">Fornecedor</th>
          <th style="text-align:left; padding:8px;">Enviado para</th>
          <th style="text-align:left; padding:8px;">Lembrete em</th>
          <th style="text-align:left; padding:8px;">Status link</th>
          <th style="text-align:left; padding:8px;">Trajeto / Início</th>
          <th style="text-align:left; padding:8px;">Expira em</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="highlight" style="margin-top:20px; background:#fde2e1; border-left:4px solid #D40511;">
      <strong>Ação imediata:</strong> ligar para o fornecedor para confirmar recebimento e desbloquear o preenchimento antes da OS começar.
    </div>
    <p style="margin-top:14px; font-size:12px; color:#888;">Este alerta de acompanhamento é enviado apenas uma vez por link (não há duplicidade).</p>
  `);

  await transporter.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: `[DHL] ${opts.pending.length} fornecedor(es) sem resposta após o lembrete (>${opts.thresholdHours}h)`,
    html,
  });
  console.log(`[Email] DHL intake operational follow-up → ${opts.to} | ${opts.pending.length} link(s)`);
}

export { transporter };
