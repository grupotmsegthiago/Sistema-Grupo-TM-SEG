import nodemailer from "nodemailer";

export type EmailChannelStatus = {
  id: string;
  name: string;
  configured: boolean;
  notes?: string;
};

export type EmailHealthResult = {
  ok: boolean;
  smtp: {
    host: string;
    user: string;
    passwordConfigured: boolean;
    verifyOk: boolean;
    verifyError: string | null;
  };
  channels: EmailChannelStatus[];
  testSend?: { attempted: boolean; success: boolean; to?: string; error?: string };
  checkedAt: string;
};

const SMTP_HOST = "smtp.office365.com";

function hasSmtpPassword(): boolean {
  return !!(process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || "").trim();
}

function buildTransporter(): nodemailer.Transporter {
  const user = process.env.EMAIL_USER || "adm@grupotmseg.com.br";
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || "";
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    requireTLS: true,
  });
}

export function listEmailChannels(): EmailChannelStatus[] {
  const smtpOk = hasSmtpPassword();
  return [
    { id: "smtp", name: "SMTP Office 365 (base)", configured: smtpOk, notes: "Todos os envios passam por adm@grupotmseg.com.br" },
    { id: "system_alert", name: "Alertas de sistema / vigia Z-API", configured: smtpOk },
    { id: "mission_client", name: "OS agendada/solicitada → cliente", configured: smtpOk },
    { id: "mission_provider", name: "OS agendada/solicitada → fornecedor", configured: smtpOk },
    { id: "mission_end", name: "Encerramento de OS", configured: smtpOk },
    { id: "mission_change", name: "Alteração de OS (cliente/fornecedor)", configured: smtpOk },
    { id: "mirroring", name: "Evidência de espelhamento", configured: smtpOk },
    { id: "welcome", name: "Boas-vindas / novo usuário", configured: smtpOk },
    { id: "verification", name: "Código de verificação de e-mail", configured: smtpOk },
    { id: "password_reset", name: "Redefinição de senha", configured: smtpOk },
    { id: "billing", name: "Cobrança Asaas (boleto/NF)", configured: smtpOk },
    { id: "legal_report", name: "Relatório jurídico (cron)", configured: smtpOk },
    { id: "pending_info", name: "OS com informações pendentes", configured: smtpOk },
    { id: "approval_pending", name: "OS aguardando aprovação", configured: smtpOk },
    { id: "missing_info", name: "Cancelamento por falta de info", configured: smtpOk },
    { id: "stuck_nf", name: "NFs travadas", configured: smtpOk },
    { id: "dhl_intake", name: "DHL intake (fornecedor/operacional)", configured: smtpOk },
    { id: "financial_report", name: "Relatório financeiro agendado", configured: smtpOk },
    { id: "whatsapp_disconnect", name: "Alerta queda WhatsApp + código extensão", configured: smtpOk },
  ];
}

export async function runEmailHealthCheck(opts?: { sendTestTo?: string }): Promise<EmailHealthResult> {
  const user = process.env.EMAIL_USER || "adm@grupotmseg.com.br";
  const passwordConfigured = hasSmtpPassword();
  const channels = listEmailChannels();

  let verifyOk = false;
  let verifyError: string | null = null;

  if (passwordConfigured) {
    try {
      await buildTransporter().verify();
      verifyOk = true;
    } catch (e: any) {
      verifyError = e?.message || String(e);
    }
  } else {
    verifyError = "EMAIL_PASS / SMTP_PASSWORD não configurada";
  }

  const result: EmailHealthResult = {
    ok: passwordConfigured && verifyOk,
    smtp: {
      host: SMTP_HOST,
      user,
      passwordConfigured,
      verifyOk,
      verifyError,
    },
    channels,
    checkedAt: new Date().toISOString(),
  };

  const testTo = String(opts?.sendTestTo || "").trim();
  if (testTo && passwordConfigured && verifyOk) {
    try {
      const { sendTestEmail } = await import("./emailService.js");
      const success = await sendTestEmail(testTo);
      result.testSend = { attempted: true, success, to: testTo, error: success ? undefined : "sendTestEmail retornou false" };
      if (!success) result.ok = false;
    } catch (e: any) {
      result.testSend = { attempted: true, success: false, to: testTo, error: e?.message || String(e) };
      result.ok = false;
    }
  }

  return result;
}
