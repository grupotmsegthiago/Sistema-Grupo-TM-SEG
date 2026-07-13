/** GET /api/zapi/health — leve: testa Z-API sem expor tokens */
import { credsFromRow, getInstance, instanceConfigured, zapiFetch } from "../../lib/whatsappLiteApi.js";
import { sanitizeWhatsappError } from "../../lib/whatsappDisplayUtils.js";

export default async function handler(req: { method?: string }, res: {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const row = await getInstance();
    if (!row || !instanceConfigured(row)) {
      res.status(503).json({ ok: false, configured: false, error: "Instância WhatsApp não configurada" });
      return;
    }
    const creds = credsFromRow(row);
    if (!creds) {
      res.status(503).json({ ok: false, configured: false, error: "Credenciais Z-API incompletas" });
      return;
    }

    const { ok, status, data } = await zapiFetch(creds, "status", { method: "GET" });
    const connected = data?.connected === true && data?.smartphoneConnected !== false;
    const rawError = data?.error || data?.message || (!ok ? `HTTP ${status}` : null);
    const error = rawError != null ? sanitizeWhatsappError(String(rawError)) || String(rawError) : null;

    const ddi = "55";
    const rawPhone = String(row.official_phone || "").replace(/\D/g, "");
    const phoneLocal = rawPhone.startsWith("55") && rawPhone.length > 11 ? rawPhone.slice(2) : rawPhone.replace(/^0+/, "");
    const full = `${ddi}${phoneLocal}`;
    const phoneDisplay = phoneLocal.length >= 10
      ? `+${ddi} (${phoneLocal.slice(0, 2)}) ${phoneLocal.slice(2, 7)}-${phoneLocal.slice(7)}`
      : `+${ddi}${phoneLocal}`;

    const phoneCodeRes = await zapiFetch(creds, `phone-code/${full}`, { method: "GET" });
    const phoneCodeValue = String(phoneCodeRes.data?.code || phoneCodeRes.data?.value || "").trim() || null;
    const phoneCodeError = phoneCodeValue
      ? null
      : sanitizeWhatsappError(String(
        phoneCodeRes.data?.error || phoneCodeRes.data?.message || phoneCodeRes.text || `HTTP ${phoneCodeRes.status}`,
      ));

    let registration: Record<string, unknown> | null = null;
    let registrationError: string | null = null;
    let waOldProbe: Record<string, unknown> | null = null;
    let voiceProbe: Record<string, unknown> | null = null;

    if (!connected) {
      const reg = await zapiFetch(creds, "mobile/registration-available", {
        method: "POST",
        body: JSON.stringify({ ddi, phone: phoneLocal }),
      });
      registration = reg.data;
      if (!reg.ok && !reg.data) {
        registrationError = sanitizeWhatsappError(reg.text) || `HTTP ${reg.status}`;
      }

      // Path oficial: mobile/request-registration-code
      const phoneVariants: Array<{ label: string; ddi: string; phone: string }> = [
        { label: "ddi+local", ddi, phone: phoneLocal },
        {
          label: "local-sem-9",
          ddi,
          phone: phoneLocal.length === 11 ? `${phoneLocal.slice(0, 2)}${phoneLocal.slice(3)}` : phoneLocal,
        },
        { label: "full-no-ddi-field", ddi: "", phone: full },
        { label: "full-with-ddi", ddi, phone: full },
      ];
      const variantProbes: Record<string, unknown>[] = [];
      for (const v of phoneVariants) {
        const body: Record<string, string> = { phone: v.phone, method: "wa_old" };
        if (v.ddi) body.ddi = v.ddi;
        const wa = await zapiFetch(creds, "mobile/request-registration-code", {
          method: "POST",
          body: JSON.stringify(body),
        });
        variantProbes.push({
          variant: v.label,
          sent: body,
          httpStatus: wa.status,
          success: wa.data?.success ?? null,
          blocked: wa.data?.blocked ?? null,
          error: wa.data?.error || wa.data?.message || (!wa.ok ? wa.text : null),
          smsWaitSeconds: wa.data?.smsWaitSeconds ?? null,
          voiceWaitSeconds: wa.data?.voiceWaitSeconds ?? null,
          hasCaptcha: typeof wa.data?.captcha === "string",
          keys: wa.data ? Object.keys(wa.data) : [],
        });
      }

      const primary = variantProbes[0] || null;
      waOldProbe = primary
        ? {
            ...primary,
            path: "mobile/request-registration-code",
            variants: variantProbes,
            anySuccess: variantProbes.some((p) => p.success === true),
          }
        : null;

      const voice = await zapiFetch(creds, "mobile/request-registration-code", {
        method: "POST",
        body: JSON.stringify({ ddi, phone: phoneLocal, method: "voice" }),
      });
      voiceProbe = {
        path: "mobile/request-registration-code",
        httpStatus: voice.status,
        ok: voice.ok,
        success: voice.data?.success ?? null,
        blocked: voice.data?.blocked ?? null,
        hasCaptcha: typeof voice.data?.captcha === "string",
        method: voice.data?.method ?? null,
        error: voice.data?.error || voice.data?.message || (!voice.ok ? voice.text : null),
        retryAfter: voice.data?.retryAfter ?? null,
      };
    }

    res.status(connected ? 200 : 502).json({
      ok: !!connected,
      configured: true,
      apiReachable: status > 0 || !!data,
      httpStatus: status,
      connected: data?.connected ?? null,
      smartphoneConnected: data?.smartphoneConnected ?? null,
      session: data?.session ?? null,
      instanceType: creds.type,
      label: row.label,
      hasClientToken: !!creds.clientToken,
      clientTokenLooksLikeInstanceToken: !!(creds.clientToken && creds.token && creds.clientToken === creds.token),
      error: connected ? null : error,
      phone: { ddi, phoneLocal, full, display: phoneDisplay },
      phoneCode: {
        ok: !!phoneCodeValue,
        hasCode: !!phoneCodeValue,
        codePreview: phoneCodeValue ? `${phoneCodeValue.slice(0, 2)}****${phoneCodeValue.slice(-2)}` : null,
        error: phoneCodeError,
        httpStatus: phoneCodeRes.status,
        phoneTried: full,
      },
      registrationAvailable: registration,
      registrationError,
      waOldProbe,
      voiceProbe,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || "Falha ao consultar Z-API" });
  }
}

export const config = { maxDuration: 30 };
