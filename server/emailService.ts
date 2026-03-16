import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { generateMissionReportPDF, formatOSForFilename } from './pdfReportService';

const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;
const BCC_RECIPIENTS = 'thiago@grupotmseg.com.br, operacional@grupotmseg.com.br';
const BCC_WELCOME_ONLY = 'thiago@grupotmseg.com.br';

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

function baseTemplate(content: string): string {
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
    <p class="ceo">Thiago Moreira — CEO</p>
    <p class="company">Grupo TM SEG</p>
    <p>Segurança Patrimonial &amp; Escolta Armada</p>
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
  mission: MissionEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string },
  clientEmail: string,
  vehiclePlate: string,
  grEspelhamento?: string,
  trackerInfo?: string
): Promise<boolean> {
  const alertBanner = (mission as any)._noEmailAlert ? `
    <div style="background:#fef2f2; border:2px solid #dc2626; border-radius:8px; padding:16px; margin-bottom:20px;">
      <p style="margin:0; font-size:14px; font-weight:900; color:#dc2626;">⚠️ ALERTA: ${(mission as any)._alertEntity || 'Cliente'} SEM E-MAIL CADASTRADO</p>
      <p style="margin:8px 0 0; font-size:12px; color:#991b1b;">O ${(mission as any)._alertEntity || 'Cliente'} <strong>"${(mission as any)._alertName || mission.client}"</strong> não possui e-mail registrado no sistema. Este e-mail foi redirecionado para o operacional. Cadastre o e-mail deste ${(mission as any)._alertEntity?.toLowerCase() || 'cliente'} no sistema para que os próximos envios sejam feitos diretamente.</p>
    </div>
  ` : '';

  const html = baseTemplate(`
    ${alertBanner}
    <h2>📋 Nova Ordem de Serviço</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Informamos que uma nova missão de escolta foi registrada para a sua empresa. Seguem os detalhes:</p>
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
    <div class="highlight-box">
      <p><strong>Observação:</strong> Acompanhe o status da missão em tempo real pelo painel do sistema.</p>
    </div>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `);

  try {
    const isAlert = (mission as any)._noEmailAlert;
    const subjectPrefix = isAlert ? '⚠️ SEM EMAIL — ' : '';
    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${subjectPrefix}Agendamento Confirmado - ${vehiclePlate || 'S/PLACA'} / ${formatOS(mission.id)}`,
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

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Missão ${mission.id} → Cliente: ${clientEmail} (com anexo PDF)`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar para cliente ${clientEmail}:`, err.message);
    return false;
  }
}

export async function sendMissionEmailToProvider(
  mission: MissionEmailData & { _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string },
  providerEmail: string,
  vehiclePlate: string
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
  `);

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
  trackerInfo?: string
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
  `);

  try {
    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `Confirmação de Escolta - ${vehiclePlate || 'S/PLACA'} / ${formatOS(mission.id)}`,
      html,
    };

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

export async function sendMirroringEvidenceEmail(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string,
  imageUrl: string,
  grEspelhamento?: string,
  trackerInfo?: string
): Promise<boolean> {
  const html = baseTemplate(`
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
  `);

  try {
    const mailOptions: any = {
      from: SMTP_FROM,
      to: clientEmail,
      bcc: BCC_RECIPIENTS,
      subject: `Espelhamento Confirmado - ${vehiclePlate || 'S/PLACA'} / ${formatOS(mission.id)}`,
      html,
    };

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
    console.log(`[Email] Espelhamento ${mission.id} → Cliente: ${clientEmail}`);
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

export { transporter };
