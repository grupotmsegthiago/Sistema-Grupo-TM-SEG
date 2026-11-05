import { BCC_RECIPIENTS, SMTP_FROM, sendMail } from '../email/smtp.js';
import {
  montarAssuntoApresentacao,
  montarCorpoApresentacao,
  type ProspectEmailVars,
} from './emailTemplate.js';

export async function sendPartnerProspectPresentation(opts: {
  to: string;
  vars: ProspectEmailVars;
  subjectOverride?: string;
  bodyOverrideHtml?: string;
}): Promise<{ success: boolean; messageId?: string; subject: string; error?: string }> {
  const to = String(opts.to || '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    return { success: false, subject: '', error: 'E-mail do prospecto inválido' };
  }
  const subject = (opts.subjectOverride || montarAssuntoApresentacao(opts.vars)).trim();
  const { text, html } = montarCorpoApresentacao(opts.vars);
  const finalHtml = opts.bodyOverrideHtml?.trim() || html;
  try {
    const info = await sendMail({
      from: SMTP_FROM,
      to,
      bcc: BCC_RECIPIENTS,
      replyTo: 'operacional@grupotmseg.com.br',
      subject,
      text,
      html: finalHtml,
    });
    return { success: true, messageId: info.messageId || '', subject };
  } catch (e: any) {
    console.error('[Email] Prospecto:', e?.message);
    return { success: false, subject, error: e?.message || 'Falha SMTP' };
  }
}
