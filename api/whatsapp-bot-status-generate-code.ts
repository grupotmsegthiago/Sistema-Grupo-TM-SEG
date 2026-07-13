/** POST /api/whatsapp/bot-status/generate-code — leve */
import { assertAuthenticatedAccess, readBearer, resolveLitePrincipal } from "../lib/tmsegAuth.js";
import {
  attemptReconnect,
  clearModalDismiss,
  fetchPhoneLinkCodeDetailed,
  getInstance,
  instanceConfigured,
  loadReconnectLock,
  requestMobilePairingCode,
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
    if (!row || !instanceConfigured(row)) {
      return res.status(503).json({ ok: false, error: "Instância WhatsApp não configurada", lock: current });
    }

    const phoneDetailed = await fetchPhoneLinkCodeDetailed(row);
    let phoneLinkCode = phoneDetailed.code;
    let reconnect: Awaited<ReturnType<typeof attemptReconnect>> | null = null;
    let mobilePairing: Awaited<ReturnType<typeof requestMobilePairingCode>> | null = null;
    let lastError = phoneDetailed.error;

    if (!phoneLinkCode) {
      reconnect = await attemptReconnect(true);
      phoneLinkCode = typeof reconnect.details?.phoneLinkCode === "string"
        ? reconnect.details.phoneLinkCode
        : null;
      if (reconnect.connectedAfter) {
        const lock = await updateReconnectLock(principal.id, {
          phase: "done",
          phoneLinkCode: null,
          reconnectMessage: "Bot reconectado.",
        });
        return res.status(200).json({
          ok: true,
          connected: true,
          phoneLinkCode: null,
          message: "Bot reconectado com sucesso!",
          lock,
          reconnect,
        });
      }
      if (!phoneLinkCode) {
        const again = await fetchPhoneLinkCodeDetailed(row);
        phoneLinkCode = again.code;
        lastError = again.error || lastError;
      }
    }

    // Mobile desconectado: phone-code costuma falhar — tenta request-code (wa_old → sms).
    if (!phoneLinkCode && (row.instance_type === "mobile" || true)) {
      mobilePairing = await requestMobilePairingCode(row, "wa_old");
      if (!mobilePairing.ok) {
        mobilePairing = await requestMobilePairingCode(row, "sms");
      }
      if (!mobilePairing.ok) {
        lastError = mobilePairing.error || lastError;
      }
    }

    const reconnectMessage = phoneLinkCode
      ? "Novo código gerado — use no eSIM em até 2 min."
      : mobilePairing?.ok
        ? (mobilePairing.message || "Código mobile solicitado — confirme no eSIM.")
        : (lastError || reconnect?.message || "Não foi possível gerar código.");

    const lock = await updateReconnectLock(principal.id, {
      phase: phoneLinkCode ? "code_ready" : (mobilePairing?.ok ? "generating" : "claimed"),
      phoneLinkCode,
      reconnectMessage,
    });

    if (phoneLinkCode || mobilePairing?.ok) {
      await clearModalDismiss();
    }

    const ok = !!phoneLinkCode || mobilePairing?.ok === true;
    res.status(ok ? 200 : 502).json({
      ok,
      connected: false,
      phoneLinkCode,
      mobilePairing: mobilePairing
        ? {
          ok: mobilePairing.ok,
          method: mobilePairing.method,
          phase: mobilePairing.phase,
          message: mobilePairing.message,
          error: mobilePairing.error,
        }
        : null,
      phoneCodeError: phoneDetailed.error,
      message: phoneLinkCode
        ? `Novo código: ${phoneLinkCode} — no eSIM, Aparelhos conectados → Vincular com número.`
        : mobilePairing?.ok
          ? (mobilePairing.message || reconnectMessage)
          : (lastError || "Não foi possível gerar código — confira o número no painel Z-API e tente de novo."),
      lock,
      reconnect,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate-code]", message);
    res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 90 };
