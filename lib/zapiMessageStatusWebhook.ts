/**
 * Processa DeliveryCallback / ReadReceiptCallback da Z-API.
 * Atualiza dhl_supplier_intake_resends (whatsapp_delivered_at / whatsapp_read_at).
 */
import { createSupabaseAdminClient } from "./supabaseAdmin.js";

export async function handleZapiMessageStatusWebhook(
  body: unknown,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  const events: unknown[] = Array.isArray(body) ? body : [body];
  const sb = createSupabaseAdminClient();
  if (!sb) {
    return { ok: false, updated: 0, error: "Supabase admin indisponível" };
  }

  let updated = 0;

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const row = ev as Record<string, unknown>;
    const status = String(row.status || row.messageStatus || row.type || "").toUpperCase();
    const ids: string[] = [];
    if (Array.isArray(row.ids)) ids.push(...row.ids.map((x) => String(x)));
    if (row.messageId) ids.push(String(row.messageId));
    if (row.id) ids.push(String(row.id));
    if (row.zaapId) ids.push(String(row.zaapId));
    const uniqIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqIds.length === 0) continue;

    const momentRaw = row.momment ?? row.moment ?? row.timestamp;
    const momentMs = typeof momentRaw === "number" ? momentRaw : Date.now();
    const whenIso = new Date(momentMs > 1e12 ? momentMs : momentMs * 1000).toISOString();

    // NÃO sobrescrever whatsapp_status (resultado do envio). Só entrega/leitura.
    const patch: Record<string, string> = {};
    if (status.includes("READ") || status === "PLAYED") {
      patch.whatsapp_read_at = whenIso;
      patch.whatsapp_delivered_at = whenIso;
    } else if (
      status.includes("RECEIVED")
      || status.includes("DELIVERED")
      || status === "SENT"
      || status.includes("DELIVERY")
    ) {
      patch.whatsapp_delivered_at = whenIso;
    } else {
      continue;
    }

    const { data: rows, error } = await sb
      .from("dhl_supplier_intake_resends")
      .update(patch)
      .in("whatsapp_message_id", uniqIds)
      .select("id");

    if (error) {
      console.error("[Z-API Webhook] update error:", error.message);
      continue;
    }
    updated += Array.isArray(rows) ? rows.length : 0;
  }

  return { ok: true, updated };
}
