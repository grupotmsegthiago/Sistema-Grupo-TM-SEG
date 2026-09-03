/**
 * Envio de e-mail do Boletim de Medição (Excel + PDF).
 * Módulo leve para API serverless — não importa pdfReportService.
 */
import nodemailer from 'nodemailer';
import {
  parseEmailRecipients,
  rejectedRequestedRecipients,
} from '../email/recipientList.js';

const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
const SMTP_FROM = `"Grupo TM SEG" <adm@grupotmseg.com.br>`;

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDueDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}

function baseTemplate(content: string, senderName?: string): string {
  const sender = senderName ? `<p style="margin:0;font-size:12px;color:#6b7280;">Enviado por ${senderName}</p>` : '';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#7f1d1d;color:#fff;padding:16px 20px;font-weight:900;letter-spacing:.04em;">GRUPO TM SEG</div>
    <div style="padding:20px;color:#111827;font-size:14px;line-height:1.5;">${content}</div>
    <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;">${sender}
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">financeiro@grupotmseg.com.br</p>
    </div>
  </div></body></html>`;
}

export type MedicaoEmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
};

export type MedicaoEmailData = {
  clientName: string;
  clientEmail: string;
  periodLabel: string;
  amount: number;
  dueDate: string;
  dueDays: number;
  osCount: number;
  senderName?: string;
  attachments: MedicaoEmailAttachment[];
};

export async function sendMedicaoEmailLite(
  data: MedicaoEmailData,
): Promise<{
  success: boolean;
  messageId?: string;
  recipients?: string[];
  rejected?: string[];
  error?: string;
}> {
  const html = baseTemplate(`
    <h2 style="margin:0 0 12px;font-size:18px;">Boletim de Medição — ${data.clientName}</h2>
    <p>Prezado(a) Cliente,</p>
    <p>Segue em anexo o <strong>Boletim de Medição</strong> (Excel e PDF) referente ao período abaixo:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Cliente</td><td style="padding:8px;border:1px solid #e5e7eb;"><strong>${data.clientName}</strong></td></tr>
      <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Período</td><td style="padding:8px;border:1px solid #e5e7eb;">${data.periodLabel}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Qtd. OS</td><td style="padding:8px;border:1px solid #e5e7eb;">${data.osCount}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Valor total</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:900;color:#b91c1c;">${formatCurrency(data.amount)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Vencimento (Contas a Receber)</td><td style="padding:8px;border:1px solid #e5e7eb;"><strong>${formatDueDate(data.dueDate)}</strong> (${data.dueDays} dias)</td></tr>
    </table>
    <p>Em caso de dúvidas, responda este e-mail ou fale com <a href="mailto:financeiro@grupotmseg.com.br">financeiro@grupotmseg.com.br</a>.</p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  `, data.senderName);

  try {
    const recipients = parseEmailRecipients(data.clientEmail);
    if (recipients.length === 0) {
      return { success: false, error: 'Nenhum destinatário válido informado.' };
    }
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      tls: { rejectUnauthorized: false },
      requireTLS: true,
    });

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: recipients,
      cc: ['financeiro@grupotmseg.com.br'],
      bcc: ['thiago@grupotmseg.com.br'],
      replyTo: 'financeiro@grupotmseg.com.br',
      subject: `Boletim de Medição — ${data.clientName} — ${data.periodLabel} — ${formatCurrency(data.amount)}`,
      html,
      attachments: (data.attachments || []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      })),
    });
    const messageId = info.messageId || '';
    const rejected = (Array.isArray(info.accepted) || Array.isArray(info.rejected))
      ? rejectedRequestedRecipients(recipients, info.accepted, info.rejected)
      : [];
    if (rejected.length > 0) {
      return {
        success: false,
        messageId,
        recipients,
        rejected,
        error: `Servidor SMTP não aceitou: ${rejected.join(', ')}`,
      };
    }
    console.log(`[Email] Medição aceita para ${recipients.join(', ')} | Message-ID: ${messageId}`);
    return { success: true, messageId, recipients, rejected: [] };
  } catch (err: any) {
    console.error('[Email] Medição falhou:', err?.message);
    return { success: false, error: err?.message || 'smtp_error' };
  }
}
