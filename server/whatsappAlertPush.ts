// ── Push notification — alertas críticos do bot WhatsApp ─────────────────────
import webpush from "web-push";
import { createSupabaseAdminClient } from "./supabaseConfig";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

let vapidReady = false;

function ensureVapid() {
  if (vapidReady || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webpush.setVapidDetails("mailto:contato@grupotmseg.com.br", VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
}

async function loadAllSubscriptions(): Promise<Array<{ key: string; subscription: webpush.PushSubscription }>> {
  const sb = createSupabaseAdminClient();
  if (!sb) return [];
  try {
    const { data } = await sb.from("push_subscriptions").select("user_key, subscription");
    if (!data) return [];
    return data
      .filter((r: any) => r?.subscription)
      .map((r: any) => ({ key: String(r.user_key), subscription: r.subscription }));
  } catch {
    return [];
  }
}

async function deleteSubscription(key: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  try {
    await sb.from("push_subscriptions").delete().eq("user_key", key);
  } catch { /* ignore */ }
}

/** Envia push para todos os dispositivos inscritos (diretoria/operacional com app aberto). */
export async function broadcastWhatsappAlert(title: string, body: string, tag: string): Promise<number> {
  ensureVapid();
  if (!vapidReady) {
    console.warn("[WhatsApp Push] VAPID não configurado — push ignorado.");
    return 0;
  }

  const subs = await loadAllSubscriptions();
  if (!subs.length) return 0;

  const payload = JSON.stringify({ title, body, tag, icon: "/favicon.png" });
  let sent = 0;

  for (const { key, subscription } of subs) {
    try {
      await webpush.sendNotification(subscription, payload);
      sent += 1;
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await deleteSubscription(key);
      }
    }
  }

  if (sent > 0) console.log(`[WhatsApp Push] "${title}" → ${sent} dispositivo(s)`);
  return sent;
}

export async function pushWhatsappDisconnected(incidentStartedAt: string, dropsLast24h: number): Promise<void> {
  await broadcastWhatsappAlert(
    "🚨 WhatsApp Bot DESCONECTADO",
    `Bot offline desde ${incidentStartedAt}. ${dropsLast24h} queda(s) em 24h. Reconecte pela extensão Z-API.`,
    "whatsapp-bot-down",
  );
}

export async function pushWhatsappReconnected(): Promise<void> {
  await broadcastWhatsappAlert(
    "✅ WhatsApp Bot reconectado",
    "A sessão do bot voltou. Envios a grupos podem ser retomados.",
    "whatsapp-bot-up",
  );
}
