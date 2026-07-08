import { BCC_RECIPIENTS, SMTP_FROM, sendMail } from './smtp.js';

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
  } catch { return String(isoStr); }
}

function formatOS(id: string): string {
  const parts = id.split('-');
  return parts.length >= 3 ? parts.slice(0, parts.length - 1).join('-') : id;
}

function baseTemplate(content: string, senderName?: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>body{margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}.header{background:#1a1a1a;padding:28px 32px;text-align:center;color:#fff}.body-content{padding:32px;color:#333;line-height:1.7;font-size:14px}.info-table{width:100%;border-collapse:collapse;margin:16px 0}.info-table td{padding:10px 14px;border-bottom:1px solid #eee}.info-table td:first-child{font-weight:600;width:40%}.badge{display:inline-block;background:#c0392b;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600}.footer{background:#1a1a1a;padding:24px;text-align:center;color:#999;font-size:12px}</style></head>
<body><div class="container"><div class="header"><h1>GRUPO TM SEG</h1><p>Segurança & Escolta Armada</p></div><div class="body-content">${content}</div>
<div class="footer"><p>${senderName || 'Equipe Grupo TM SEG'}</p><p>Grupo TM SEG — Intermediação de Escolta Armada</p></div></div></body></html>`;
}

export type MissionEmailData = {
  id: string; client: string; provider: string; origin: string; destination: string;
  start_time: string; mission_type?: string; driver_name?: string; driver_phone?: string;
  agent1?: string; agent2?: string; escort_vehicle_plate?: string;
  _noEmailAlert?: boolean; _alertEntity?: string; _alertName?: string;
};

export async function sendMissionEmailToClient(
  mission: MissionEmailData,
  clientEmail: string,
  vehiclePlate: string,
  grEspelhamento?: string,
  trackerInfo?: string,
  senderName?: string,
): Promise<{ success: boolean; messageId: string }> {
  const alertBanner = mission._noEmailAlert ? `<p style="color:#dc2626;font-weight:bold;">⚠️ ${mission._alertEntity || 'Cliente'} sem e-mail cadastrado (${mission._alertName || mission.client})</p>` : '';
  const html = baseTemplate(`
    ${alertBanner}
    <h2>📋 Confirmação de Escolta — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) Cliente,</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Cliente</td><td>${mission.client || '—'}</td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Viatura</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${mission.agent1 ? `<tr><td>Agente 01</td><td>${mission.agent1}</td></tr>` : ''}
      ${mission.agent2 ? `<tr><td>Agente 02</td><td>${mission.agent2}</td></tr>` : ''}
      ${grEspelhamento ? `<tr><td>Espelhamento</td><td>${grEspelhamento}</td></tr>` : ''}
      ${trackerInfo ? `<tr><td>Rastreador</td><td>${trackerInfo}</td></tr>` : ''}
    </table>
  `, senderName);
  try {
    const originParts = (mission.origin || '').split(',');
    const originCityUF = originParts.length >= 2 ? `${originParts[0].trim()}/${originParts[originParts.length - 1].trim()}` : (mission.origin || 'S/ORIGEM');
    const info = await sendMail({
      from: SMTP_FROM,
      to: clientEmail,
      cc: 'operacional@grupotmseg.com.br',
      replyTo: 'operacional@grupotmseg.com.br',
      bcc: BCC_RECIPIENTS,
      subject: `${mission._noEmailAlert ? '⚠️ SEM EMAIL — ' : ''}Agendamento Confirmado - ${formatOS(mission.id)} - Origem: ${originCityUF}`,
      html,
    });
    return { success: true, messageId: info.messageId || '' };
  } catch (e: any) {
    console.error('[Email] Erro cliente:', e?.message);
    return { success: false, messageId: '' };
  }
}

export async function sendMissionEmailToProvider(
  mission: MissionEmailData,
  providerEmail: string,
  vehiclePlate: string,
  senderName?: string,
): Promise<boolean> {
  const escoltaTipo = mission.mission_type || 'Caracterizada';
  const alertBanner = mission._noEmailAlert ? `<p style="color:#dc2626;font-weight:bold;">⚠️ ${mission._alertEntity || 'Fornecedor'} sem e-mail (${mission._alertName || mission.provider})</p>` : '';
  const html = baseTemplate(`
    ${alertBanner}
    <h2>📋 Solicitação de Escolta — ${formatOS(mission.id)}</h2>
    <p>Prezado(a) ${mission.provider || 'Fornecedor'},</p>
    <table class="info-table">
      <tr><td>Nº da OS</td><td><span class="badge">${formatOS(mission.id)}</span></td></tr>
      <tr><td>Origem</td><td>${mission.origin || '—'}</td></tr>
      <tr><td>Destino</td><td>${mission.destination || '—'}</td></tr>
      <tr><td>Veículo / Carga</td><td>${vehiclePlate || '—'}</td></tr>
      <tr><td>Tipo</td><td>${escoltaTipo}</td></tr>
      <tr><td>Agendamento</td><td>${formatDateTime(mission.start_time)}</td></tr>
      ${mission.driver_name ? `<tr><td>Motorista</td><td>${mission.driver_name}</td></tr>` : ''}
      ${mission.driver_phone ? `<tr><td>Tel. Motorista</td><td>${mission.driver_phone}</td></tr>` : ''}
    </table>
  `, senderName);
  try {
    await sendMail({
      from: SMTP_FROM,
      to: providerEmail,
      bcc: BCC_RECIPIENTS,
      subject: `${mission._noEmailAlert ? '⚠️ SEM EMAIL — ' : ''}Solicitação de Escolta - ${vehiclePlate || 'S/PLACA'} / ${escoltaTipo}`,
      html,
    });
    return true;
  } catch (e: any) {
    console.error('[Email] Erro fornecedor:', e?.message);
    return false;
  }
}
