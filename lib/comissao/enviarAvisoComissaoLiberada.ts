/**
 * Envio do aviso de comissão liberada. Só o servidor importa este arquivo
 * (nodemailer). A baixa já gravou o status; falha de SMTP não desfaz a liberação.
 */
import { SMTP_FROM, sendMail } from '../email/smtp.js';
import {
  montarEmailComissaoLiberada,
  type ComissaoLiberadaAviso,
} from './avisoComissaoLiberada.js';
import {
  SELECT_COMISSAO_LIBERADA,
  montarAvisosLiberacao,
  type ComissaoDbClient,
} from './comissaoCore.js';

type EnviarHook = (avisos: ComissaoLiberadaAviso[]) => Promise<unknown> | unknown;

const globalAviso = globalThis as typeof globalThis & {
  __tmsegEnviarAvisoComissaoLiberada?: EnviarHook;
};

export async function enviarAvisosComissaoLiberada(
  avisos: ComissaoLiberadaAviso[],
): Promise<{ ok: boolean; error?: string }> {
  const lista = (avisos || []).filter((item) => item?.id);
  if (!lista.length) return { ok: true };
  const torres = lista.filter((item) => String(item.empresa || '').toUpperCase() === 'TORRES');
  const tm = lista.filter((item) => String(item.empresa || '').toUpperCase() !== 'TORRES');
  let ok = true;
  let error = '';
  for (const grupo of [tm, torres]) {
    if (!grupo.length) continue;
    const email = montarEmailComissaoLiberada(grupo);
    try {
      await sendMail({
        from: SMTP_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
      });
    } catch (e: unknown) {
      ok = false;
      const message = e instanceof Error ? e.message : String(e);
      error = message;
      console.warn('[comissao] e-mail de liberação:', message);
    }
  }
  return ok ? { ok: true } : { ok: false, error };
}

export function instalarAvisoComissaoLiberada(): void {
  globalAviso.__tmsegEnviarAvisoComissaoLiberada = enviarAvisosComissaoLiberada;
}

export async function enviarLiberacaoPorIds(
  sb: ComissaoDbClient,
  ids: string[],
): Promise<{ ok: boolean; enviados: number; error?: string }> {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 40);
  if (!unique.length) return { ok: true, enviados: 0 };
  const { data, error } = await sb
    .from('comissoes')
    .select(SELECT_COMISSAO_LIBERADA)
    .in('id', unique)
    .eq('status', 'LIBERADO_PARA_PAGAMENTO');
  if (error) return { ok: false, enviados: 0, error: error.message };
  const avisos = await montarAvisosLiberacao(sb, data);
  if (!avisos.length) return { ok: true, enviados: 0 };
  const sent = await enviarAvisosComissaoLiberada(avisos);
  return { ok: sent.ok, enviados: sent.ok ? avisos.length : 0, error: sent.error };
}

instalarAvisoComissaoLiberada();
