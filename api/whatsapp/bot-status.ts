/**
 * GET /api/whatsapp/bot-status — leve (sem Express/Z-API live).
 * Usado pelo popup offline em tempo real.
 */
import { readBearer, resolveLitePrincipal, supabaseLite } from "../_lib/tmsegAuth";

type LockRow = {
  holderId: string;
  holderName: string;
  acquiredAt: string;
  expiresAt: string;
  phase: string;
  phoneLinkCode?: string | null;
  reconnectMessage?: string | null;
};

function activeLock(raw: unknown): LockRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as LockRow;
  if (!o.holderId || !o.expiresAt) return null;
  const exp = Date.parse(o.expiresAt);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return o;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  const principal = await resolveLitePrincipal(token);
  if (!principal) {
    res.status(403).json({ error: "Sessão inválida" });
    return;
  }

  try {
    const sb = supabaseLite();
    const [{ data: inst }, { data: lockRow }, { data: watchRow }] = await Promise.all([
      sb.from("whatsapp_instances").select("label,last_connected,last_error,enabled,is_default").eq("is_default", true).maybeSingle(),
      sb.from("system_settings").select("value").eq("key", "zapi_reconnect_lock").maybeSingle(),
      sb.from("system_settings").select("value").eq("key", "zapi_watchdog_state").maybeSingle(),
    ]);

    const online = inst?.enabled !== false && inst?.last_connected === true;
    const watch = watchRow?.value && typeof watchRow.value === "object" ? watchRow.value as { incidentOpen?: boolean } : {};
    const lock = activeLock(lockRow?.value);

    res.status(200).json({
      configured: !!inst,
      online,
      label: inst?.label || null,
      lastError: inst?.last_error || null,
      incidentOpen: watch.incidentOpen === true || !online,
      lock,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message || "Falha ao consultar status" });
  }
}

export const config = { maxDuration: 15 };
