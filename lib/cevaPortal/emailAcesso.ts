import { SMTP_FROM, sendMail } from '../email/smtp.js';

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function systemAppUrl(path: string): string {
  const base = process.env.SYSTEM_URL
    || `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'sistema.grupotmseg.com.br'}`;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Senha do portal CEVA — módulo leve para handler serverless (sem server/emailService). */
export async function sendCevaPortalAccessEmail(input: {
  nome: string;
  email: string;
  senhaTemporaria: string;
  rotulo?: string;
  caminho?: string;
}): Promise<boolean> {
  const rotulo = input.rotulo || 'CEVA';
  const link = systemAppUrl(input.caminho || '/ceva');
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#333;line-height:1.6">
    <h2>Acesso ao Controle de Escolta</h2>
    <p>Olá, <strong>${escapar(input.nome)}</strong>.</p>
    <p>O administrador liberou o seu acesso ao controle de escolta da ${escapar(rotulo)}. Use a senha temporária abaixo, troque-a no primeiro acesso e repita a troca a cada 30 dias. O portal mostra somente este cliente.</p>
    <p><strong>Link:</strong> <a href="${link}">${link}</a><br>
    <strong>E-mail:</strong> ${escapar(input.email)}<br>
    <strong>Senha temporária:</strong> <code>${escapar(input.senhaTemporaria)}</code></p>
    <p>Atenciosamente,<br><strong>Equipe Grupo TM SEG</strong></p>
  </body></html>`;

  try {
    await sendMail({
      from: SMTP_FROM,
      to: input.email,
      subject: `Acesso ao Controle de Escolta ${rotulo}`,
      html,
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Email] Falha no acesso ${rotulo} para ${input.email}:`, message);
    return false;
  }
}
