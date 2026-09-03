/**
 * Envia Boletim de Medição (Excel + PDF) ao e-mail do cliente.
 * Handler leve — não importa emailService/pdfReportService.
 */
import { authToken, parseJsonBody } from '../lib/email/missionEmailHelpers.js';
import { sendMedicaoEmailLite } from '../lib/billing/sendMedicaoEmailServer.js';
import { parseEmailRecipients } from '../lib/email/recipientList.js';

export default async function handler(req: any, res: any) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  try {
    const body = parseJsonBody(req.body);
    const recipients = parseEmailRecipients(body.clientEmail);
    const clientEmail = recipients.join(', ');
    const clientName = String(body.clientName || '').trim();
    const periodLabel = String(body.periodLabel || '').trim();
    const dueDate = String(body.dueDate || '').slice(0, 10);
    const dueDays = Number(body.dueDays) || 30;
    const amount = Number(body.amount) || 0;
    const osCount = Number(body.osCount) || 0;
    const senderName = String(body.senderName || '').trim() || undefined;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (recipients.length === 0) {
      res.status(400).json({ ok: false, error: 'E-mail do cliente inválido' });
      return;
    }
    if (!clientName || !dueDate) {
      res.status(400).json({ ok: false, error: 'Cliente e vencimento são obrigatórios' });
      return;
    }
    if (attachments.length === 0) {
      res.status(400).json({ ok: false, error: 'Anexe Excel e PDF da medição' });
      return;
    }

    const result = await sendMedicaoEmailLite({
      clientName,
      clientEmail,
      periodLabel: periodLabel || dueDate,
      amount,
      dueDate,
      dueDays,
      osCount,
      senderName,
      attachments: attachments.map((a: any) => ({
        filename: String(a.filename || 'anexo.bin'),
        contentBase64: String(a.contentBase64 || ''),
        contentType: String(a.contentType || 'application/octet-stream'),
      })),
    });

    if (!result.success) {
      res.status(502).json({
        ok: false,
        error: result.error || 'Falha ao enviar e-mail',
        messageId: result.messageId,
        recipients: result.recipients || recipients,
        rejected: result.rejected || [],
      });
      return;
    }
    res.status(200).json({
      ok: true,
      messageId: result.messageId,
      recipients: result.recipients || recipients,
      rejected: result.rejected || [],
    });
  } catch (e: any) {
    console.error('[billing-send-medicao]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Erro ao enviar medição' });
  }
}
