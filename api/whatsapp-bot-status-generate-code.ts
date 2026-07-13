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
import { buildMobileConnectionDiagnosis } from "../lib/whatsappMobileDiagnosis.js";

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

    const isMobile = row.instance_type === "mobile";
    let reconnect: Awaited<ReturnType<typeof attemptReconnect>> | null = null;
    let mobilePairing: Awaited<ReturnType<typeof requestMobilePairingCode>> | null = null;
    let phoneLinkCode: string | null = null;
    let lastError: string | null = null;

    // MOBILE: tentar registro real primeiro (não enganar com phone-code).
    if (isMobile) {
      mobilePairing = await requestMobilePairingCode(row, "wa_old");
      if (!mobilePairing.ok) {
        mobilePairing = await requestMobilePairingCode(row, "voice");
      }
      if (!mobilePairing.ok && Number((mobilePairing as any).registration?.smsWaitSeconds) !== -1) {
        mobilePairing = await requestMobilePairingCode(row, "sms");
      }

      const diagnosis = buildMobileConnectionDiagnosis({
        instanceType: "mobile",
        connected: false,
        registrationAvailable: (mobilePairing as any)?.registration || null,
        requestCodeResult: mobilePairing?.data || null,
        phoneLinkCode: null,
      });

      if (mobilePairing?.ok) {
        const lock = await updateReconnectLock(principal.id, {
          phase: "generating",
          phoneLinkCode: null,
          reconnectMessage: mobilePairing.message || "Confirme no WhatsApp Business do eSIM.",
        });
        await clearModalDismiss();
        return res.status(200).json({
          ok: true,
          connected: false,
          phoneLinkCode: null,
          mobilePairing: {
            ok: true,
            method: mobilePairing.method,
            phase: mobilePairing.phase,
            message: mobilePairing.message,
            error: null,
          },
          diagnosis,
          message: mobilePairing.message,
          lock,
        });
      }

      // blocked / falha: NÃO devolver phone-code como se fosse solução MOBILE
      const lock = await updateReconnectLock(principal.id, {
        phase: "claimed",
        phoneLinkCode: null,
        reconnectMessage: diagnosis.summaryPt,
      });
      return res.status(502).json({
        ok: false,
        connected: false,
        phoneLinkCode: null,
        mobilePairing: mobilePairing
          ? {
            ok: false,
            method: mobilePairing.method,
            phase: mobilePairing.phase,
            message: mobilePairing.message,
            error: mobilePairing.error,
          }
          : null,
        diagnosis,
        message: diagnosis.summaryPt,
        steps: diagnosis.stepsPt,
        lock,
      });
    }

    // WEB: phone-code / reconnect
    const phoneDetailed = await fetchPhoneLinkCodeDetailed(row);
    phoneLinkCode = phoneDetailed.code;
    lastError = phoneDetailed.error;

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

    const diagnosis = buildMobileConnectionDiagnosis({
      instanceType: "web",
      connected: false,
      phoneLinkCode,
    });

    const reconnectMessage = phoneLinkCode
      ? `Código WEB: ${phoneLinkCode} — Aparelhos conectados → Vincular com número.`
      : (lastError || reconnect?.message || "Não foi possível gerar código.");

    const lock = await updateReconnectLock(principal.id, {
      phase: phoneLinkCode ? "code_ready" : "claimed",
      phoneLinkCode,
      reconnectMessage,
    });

    if (phoneLinkCode) await clearModalDismiss();

    res.status(phoneLinkCode ? 200 : 502).json({
      ok: !!phoneLinkCode,
      connected: false,
      phoneLinkCode,
      diagnosis,
      phoneCodeError: lastError,
      message: reconnectMessage,
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
