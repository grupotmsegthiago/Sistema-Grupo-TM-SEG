/** GET /api/zapi-health — alias leve (sem martelar request-registration-code). */
import { credsFromRow, getInstance, instanceConfigured, zapiFetch } from "../lib/whatsappLiteApi.js";
import { sanitizeWhatsappError } from "../lib/whatsappDisplayUtils.js";
import { buildMobileConnectionDiagnosis } from "../lib/whatsappMobileDiagnosis.js";

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

    let registration: Record<string, unknown> | null = null;
    if (!connected) {
      const reg = await zapiFetch(creds, "mobile/registration-available", {
        method: "POST",
        body: JSON.stringify({ ddi, phone: phoneLocal }),
      });
      registration = reg.data;
    }

    const diagnosis = buildMobileConnectionDiagnosis({
      instanceType: creds.type,
      connected: !!connected,
      registrationAvailable: registration,
      phoneLinkCode: phoneCodeValue,
    });

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
      error: connected ? null : error,
      diagnosis,
      phone: { ddi, phoneLocal, full, display: phoneDisplay },
      phoneCode: {
        ok: !!phoneCodeValue,
        hasCode: !!phoneCodeValue,
        codePreview: phoneCodeValue ? `${phoneCodeValue.slice(0, 2)}****${phoneCodeValue.slice(-2)}` : null,
        httpStatus: phoneCodeRes.status,
        phoneTried: full,
      },
      registrationAvailable: registration,
      note: "Alias sem probe request-code (evita blocked). Use /api/zapi/health?deep=1 com cuidado.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || "Falha ao consultar Z-API" });
  }
}

export const config = { maxDuration: 30 };
