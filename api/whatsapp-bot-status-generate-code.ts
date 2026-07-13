/** POST /api/whatsapp/bot-status/generate-code — leve */
import { assertAuthenticatedAccess, readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import {
  attemptReconnect,
  fetchPhoneLinkCode,
  getInstance,
  instanceConfigured,
  loadReconnectLock,
  updateReconnectLock,
} from "../lib/whatsappLiteApi.js";

export default async function handler(req: { method?: string; headers?: Record<string, unknown> }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const token = readBearer(req);
  const denied = await assertAuthenticatedAccess(token, req);
  if (denied) {
    res.status(denied === "Não autorizado" ? 401 : 403).json({ error: denied });
    return;
  }
  const principal = await resolveLitePrincipal(token, req);
  if (!principal) return res.status(403).json({ error: "Usuário não encontrado" });

  try {
    const current = await loadReconnectLock();
    if (!current || current.holderId !== principal.id) {
      return res.status(409).json({
        ok: false,
        error: current
          ? `${current.holderName} já está reconectando o bot.`
          : "Assuma a reconexão antes de gerar o código.",
        lock: current,
      });
    }

    await updateReconnectLock(principal.id, { phase: "generating", phoneLinkCode: null, reconnectMessage: null });

    const row = await getInstance();
    let phoneLinkCode = row && instanceConfigured(row) ? await fetchPhoneLinkCode(row) : null;
    let reconnect: Awaited<ReturnType<typeof attemptReconnect>> | null = null;

    if (!phoneLinkCode) {
      reconnect = await attemptReconnect(true);
      phoneLinkCode = typeof reconnect.details?.phoneLinkCode === "string"
        ? reconnect.details.phoneLinkCode
        : null;
      if (!phoneLinkCode && !reconnect.connectedAfter && row && instanceConfigured(row)) {
        phoneLinkCode = await fetchPhoneLinkCode(row);
      }
    }

    const lock = await updateReconnectLock(principal.id, {
      phase: phoneLinkCode ? "code_ready" : "claimed",
      phoneLinkCode,
      reconnectMessage: reconnect?.message || (phoneLinkCode ? "Novo código gerado — use no eSIM em até 2 min." : null),
    });

    res.status(200).json({
      ok: !!phoneLinkCode || reconnect?.connectedAfter === true,
      connected: reconnect?.connectedAfter === true,
      phoneLinkCode,
      message: phoneLinkCode
        ? `Novo código: ${phoneLinkCode} — vincule no eSIM ${row?.official_phone ? `(11) ${row.official_phone}` : ""} agora.`
        : (reconnect?.message || "Não foi possível gerar código — tente de novo."),
      lock,
      reconnect,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 90 };
