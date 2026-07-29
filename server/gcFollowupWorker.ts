import { createSupabaseAdminClient } from './supabaseConfig';
import { sendSystemAlertEmail } from './emailService';

/**
 * Cobrança automática de retornos da agenda comercial.
 * - Atrasado: e-mail + marca reminder_sent_at
 * - Prazo supervisor: notifica supervisor (se houver)
 * - Prazo crítico: notifica Diretoria
 *
 * Configurações vêm de gestor_settings (nunca hardcode de prazos).
 */
export async function runGcFollowupCycle(): Promise<{ processed: number; emails: number }> {
  const sb = createSupabaseAdminClient();
  if (!sb) return { processed: 0, emails: 0 };

  let processed = 0;
  let emails = 0;

  try {
    const { data: settingsRows } = await sb
      .from('gestor_settings')
      .select('setting_key, setting_value')
      .eq('gestor_key', 'comercial');

    const cfg: Record<string, any> = {
      days_followup_overdue: 1,
      days_supervisor_alert: 3,
      days_diretoria_alert: 7,
      alert_emails_diretoria: ['thiago@grupotmseg.com.br'],
    };
    for (const row of settingsRows || []) {
      cfg[row.setting_key] = row.setting_value;
    }

    const now = Date.now();
    const { data: items, error } = await sb
      .from('gc_agenda_items')
      .select('*, gc_reps:rep_id(full_name, supervisor_rep_id)')
      .in('status', ['pendente', 'atrasado'])
      .is('deleted_at', null)
      .lte('due_at', new Date().toISOString())
      .limit(100);

    if (error || !items?.length) return { processed: 0, emails: 0 };

    const diretoriaEmails = Array.isArray(cfg.alert_emails_diretoria)
      ? cfg.alert_emails_diretoria.map(String)
      : (() => {
          try { return JSON.parse(String(cfg.alert_emails_diretoria)); } catch { return ['thiago@grupotmseg.com.br']; }
        })();

    for (const item of items) {
      const due = new Date(item.due_at).getTime();
      const daysLate = Math.floor((now - due) / 86400000);
      processed += 1;

      if (item.status === 'pendente') {
        await sb.from('gc_agenda_items').update({ status: 'atrasado', updated_at: new Date().toISOString() }).eq('id', item.id);
      }

      if (!item.reminder_sent_at && daysLate >= Number(cfg.days_followup_overdue || 1)) {
        const to = diretoriaEmails.slice(0, 1);
        const ok = await sendSystemAlertEmail(
          to,
          `[GC] Retorno atrasado: ${item.title}`,
          `<p>O retorno <strong>${item.title}</strong> (${item.client_name || 'sem cliente'}) venceu em ${new Date(item.due_at).toLocaleString('pt-BR')}.</p>
           <p>Responsável: ${item.responsible_name || '—'}</p>
           <p>Prioridade: ${item.priority}</p>`,
        );
        if (ok) emails += 1;
        await sb.from('gc_agenda_items').update({ reminder_sent_at: new Date().toISOString() }).eq('id', item.id);
      }

      if (!item.supervisor_notified_at && daysLate >= Number(cfg.days_supervisor_alert || 3)) {
        await sendSystemAlertEmail(
          diretoriaEmails,
          `[GC] Supervisor — retorno atrasado ${daysLate}d: ${item.title}`,
          `<p>Follow-up ultrapassou o prazo de supervisor.</p><p>${item.title} · ${item.responsible_name || ''}</p>`,
        );
        emails += 1;
        await sb.from('gc_agenda_items').update({ supervisor_notified_at: new Date().toISOString() }).eq('id', item.id);
      }

      if (!item.diretoria_notified_at && daysLate >= Number(cfg.days_diretoria_alert || 7)) {
        await sendSystemAlertEmail(
          diretoriaEmails,
          `[GC] CRÍTICO Diretoria — retorno ${daysLate}d: ${item.title}`,
          `<p>Prazo crítico ultrapassado no Gestor Comercial.</p><p>${item.title} · Cliente: ${item.client_name || '—'}</p>`,
        );
        emails += 1;
        await sb.from('gc_agenda_items').update({ diretoria_notified_at: new Date().toISOString() }).eq('id', item.id);
      }
    }
  } catch (e: any) {
    console.warn('[GC Followup] ciclo falhou:', e?.message?.slice(0, 160));
  }

  return { processed, emails };
}
