import { SMTP_FROM, sendMail } from './smtp.js';

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

function baseTemplate(content: string, senderName?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#1a1a1a;padding:28px 32px;text-align:center;">
    <h1 style="color:#ffffff;font-size:22px;margin:0 0 4px;letter-spacing:1px;">GRUPO <span style="color:#c0392b;font-weight:700;">TM SEG</span></h1>
    <p style="color:#999;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase;">Segurança &amp; Escolta Armada</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#c0392b,#1a1a1a);"></div>
  <div style="padding:32px;color:#333;line-height:1.7;font-size:14px;">${content}</div>
  <div style="background:#1a1a1a;padding:24px 32px;text-align:center;border-top:3px solid #c0392b;">
    <p style="color:#ffffff;font-weight:600;font-size:13px;margin:4px 0;">${senderName ? toTitleCase(senderName) : 'Equipe Grupo TM SEG'}</p>
    <p style="color:#c0392b;font-weight:600;margin:4px 0;">Grupo TM SEG</p>
    <p style="color:#999;font-size:11px;margin:8px 0 0;">E-mail automático. Dúvidas: adm@grupotmseg.com.br</p>
  </div>
</div>
</body></html>`;
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetLink: string,
  senderName?: string
): Promise<boolean> {
  try {
    const html = baseTemplate(`
    <h2 style="color:#111827;font-size:18px;font-weight:800;margin:0 0 12px 0;">Redefinição de Senha</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Olá <strong>${toTitleCase(name)}</strong>,</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Uma nova senha foi solicitada para o seu acesso ao sistema <strong>Grupo TM SEG</strong>.</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px 0;">Clique no botão abaixo para definir sua nova senha de acesso:</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetLink}" style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.5px;text-transform:uppercase;">Definir Nova Senha</a>
    </div>
    <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:20px 0 0 0;">⚠️ Este link é válido por <strong>24 horas</strong>. Se você não solicitou essa alteração, ignore este e-mail.</p>
    <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:12px 0 0 0;">Caso o botão não funcione, copie e cole o link abaixo no seu navegador:<br/><span style="color:#2563eb;word-break:break-all;">${resetLink}</span></p>
    `, senderName);

    await sendMail({
      from: SMTP_FROM,
      to,
      subject: '🔐 Redefinição de Senha — Grupo TM SEG',
      html,
    });
    console.log(`[Email] Reset de senha enviado → ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Erro ao enviar reset de senha:`, err?.message);
    return false;
  }
}
