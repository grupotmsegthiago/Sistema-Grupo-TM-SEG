import nodemailer from 'nodemailer';

export const EMAIL_USER = process.env.EMAIL_USER || 'adm@grupotmseg.com.br';
export const SMTP_FROM = '"Grupo TM SEG" <adm@grupotmseg.com.br>';
export const BCC_RECIPIENTS: string[] = ['thiago@grupotmseg.com.br', 'operacional@grupotmseg.com.br'];

let transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
  transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: { user: EMAIL_USER, pass },
    tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    requireTLS: true,
  });
  return transporter;
}

export async function sendMail(opts: nodemailer.SendMailOptions) {
  return getTransporter().sendMail(opts);
}
