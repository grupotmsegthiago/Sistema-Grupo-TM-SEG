/**
 * E-mail de alerta leve (sem puxar server/emailService + PDF no bundle da Vercel).
 */
import nodemailer from 'nodemailer';

function baseTemplate(contentHtml: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#1a1a1a;padding:20px 28px;text-align:center;">
      <div style="color:#fff;font-size:18px;font-weight:700;">Grupo TM SEG</div>
      <div style="color:#c0392b;font-size:12px;margin-top:4px;">Sistema Operacional</div>
    </div>
    <div style="padding:28px;color:#333;line-height:1.6;font-size:14px;">${contentHtml}</div>
  </div>
</body></html>`;
}

export async function sendOsAnalysisAlertEmail(
  to: string[],
  subject: string,
  contentHtml: string,
): Promise<boolean> {
  const user = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
  if (!pass) {
    console.warn('[os-analysis] SMTP sem senha — e-mail não enviado');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    requireTLS: true,
  });
  await transporter.sendMail({
    from: '"Grupo TM SEG - Sistema" <adm@grupotmseg.com.br>',
    to: to.join(', '),
    subject,
    html: baseTemplate(contentHtml),
  });
  console.log(`[os-analysis] e-mail → ${to.join(', ')} | ${subject}`);
  return true;
}
