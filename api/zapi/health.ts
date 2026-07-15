/** GET /api/zapi/health — leve: testa Z-API sem expor tokens.
 * Nunca solicita código de registro: reconexão MOBILE é apenas manual e autenticada.
 */
import { credsFromRow, getInstance, instanceConfigured, zapiFetch } from "../../lib/whatsappLiteApi.js";
import { hasExplicitZapiWebEnv } from "../../lib/zapiMobileEnv.js";
import { sanitizeWhatsappError } from "../../lib/whatsappDisplayUtils.js";
import { buildMobileConnectionDiagnosis, isZapiSessionConnected } from "../../lib/whatsappMobileDiagnosis.js";

export default async function handler(req: { method?: string; url?: string }, res: {
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

    const explicitEnv = hasExplicitZapiWebEnv() || !!process.env.ZAPI_MOBILE_ID;

    const { ok, status, data } = await zapiFetch(creds, "status", { method: "GET" });
    const connected = isZapiSessionConnected(data, creds.type);
    const rawError = data?.error || data?.message || (!ok ? `HTTP ${status}` : null);
    const error = rawError != null ? sanitizeWhatsappError(String(rawError)) || String(rawError) : null;

    const ddi = "55";
    const rawPhone = String(row.official_phone || "").replace(/\D/g, "");
    const phoneLocal = rawPhone.startsWith("55") && rawPhone.length > 11 ? rawPhone.slice(2) : rawPhone.replace(/^0+/, "");
    const full = `${ddi}${phoneLocal}`;
    const phoneDisplay = phoneLocal.length >= 10
      ? `+${ddi} (${phoneLocal.slice(0, 2)}) ${phoneLocal.slice(2, 7)}-${phoneLocal.slice(7)}`
      : `+${ddi}${phoneLocal}`;

    // phone-code é fluxo WEB — só consulta em instância WEB (evita confusão no MOBILE)
    let phoneCodeValue: string | null = null;
    let phoneCodeError: string | null = null;
    let phoneCodeHttp = 0;
    if (creds.type === "web") {
      const phoneCodeRes = await zapiFetch(creds, `phone-code/${full}`, { method: "GET" });
      phoneCodeHttp = phoneCodeRes.status;
      phoneCodeValue = String(phoneCodeRes.data?.code || phoneCodeRes.data?.value || "").trim() || null;
      phoneCodeError = phoneCodeValue
        ? null
        : sanitizeWhatsappError(String(
          phoneCodeRes.data?.error || phoneCodeRes.data?.message || phoneCodeRes.text || `HTTP ${phoneCodeRes.status}`,
        ));
    }

    let registration: Record<string, unknown> | null = null;
    let registrationError: string | null = null;
    if (!connected && creds.type === "mobile") {
      const reg = await zapiFetch(creds, "mobile/registration-available", {
        method: "POST",
        body: JSON.stringify({ ddi, phone: phoneLocal }),
      });
      registration = reg.data;
      if (!reg.ok && !reg.data) {
        registrationError = sanitizeWhatsappError(reg.text) || `HTTP ${reg.status}`;
      }
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
      credentialsSource: explicitEnv ? "env" : "db",
      instanceIdSuffix: creds.instance.slice(-4),
      hasClientToken: !!creds.clientToken,
      clientTokenLooksLikeInstanceToken: !!(creds.clientToken && creds.token && creds.clientToken === creds.token),
      error: connected ? null : error,
      zapiErrorCode: data?.error ?? null,
      diagnosis,
      phone: { ddi, phoneLocal, full, display: phoneDisplay },
      phoneCode: creds.type === "web"
        ? {
          ok: !!phoneCodeValue,
          hasCode: !!phoneCodeValue,
          codePreview: phoneCodeValue ? `${phoneCodeValue.slice(0, 2)}****${phoneCodeValue.slice(-2)}` : null,
          error: phoneCodeError,
          httpStatus: phoneCodeHttp,
          phoneTried: full,
        }
        : {
          ok: false,
          hasCode: false,
          codePreview: null,
          error: null,
          httpStatus: 0,
          phoneTried: full,
          note: "phone-code é fluxo WEB; no MOBILE use pop-up/SMS/voz + Confirmar código.",
        },
      registrationAvailable: registration,
      registrationError,
      note: "Health não solicita request-registration-code; reconexão MOBILE exige ação manual autenticada.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message || "Falha ao consultar Z-API" });
  }
}

export const config = { maxDuration: 30 };
