/** Credenciais Z-API mobile via ambiente (Vercel / .env). */

/** Nome exibido no painel e na instância padrão do bot WhatsApp. */
export const WHATSAPP_BOT_DISPLAY_NAME = "Monitoramento 24h";

/** Número oficial do bot (sem DDI). */
export const OFFICIAL_BOT_PHONE_LOCAL = "11926839456";

/** Rótulo legado — migrado automaticamente para {@link WHATSAPP_BOT_DISPLAY_NAME}. */
export const LEGACY_BOT_DISPLAY_NAME = "Central TM SEG";

export type ZapiMobileEnvCreds = {
  instanceId: string;
  token: string;
  label: string;
  clientToken: string;
  /** true quando ZAPI_MOBILE_ID + ZAPI_MOBILE_TOKEN estão definidos */
  explicitMobileEnv: boolean;
};

export function hasExplicitZapiMobileEnv(): boolean {
  return !!(
    String(process.env.ZAPI_MOBILE_ID || "").trim()
    && String(process.env.ZAPI_MOBILE_TOKEN || "").trim()
  );
}

/** WEB só é explícito quando não há credenciais MOBILE concorrentes. */
export function hasExplicitZapiWebEnv(): boolean {
  return !hasExplicitZapiMobileEnv()
    && String(process.env.ZAPI_INSTANCE_TYPE || "").trim().toLowerCase() === "web"
    && !!String(process.env.ZAPI_INSTANCE_ID || "").trim()
    && !!String(process.env.ZAPI_TOKEN || "").trim();
}

/**
 * Tipo efetivo da instância resolvida pelo ambiente.
 * ZAPI_MOBILE_* sempre vence sobre variáveis legadas para evitar alternância
 * acidental; WEB exige ZAPI_INSTANCE_TYPE=web explícito.
 */
export function getZapiEnvInstanceType(): "web" | "mobile" {
  if (hasExplicitZapiMobileEnv()) return "mobile";
  return String(process.env.ZAPI_INSTANCE_TYPE || "mobile").trim().toLowerCase() === "web"
    ? "web"
    : "mobile";
}

/** Resolve ID, token e rótulo — prioriza ZAPI_MOBILE_*; fallback legado ZAPI_INSTANCE_ID/ZAPI_TOKEN. */
export function getZapiMobileEnvCreds(): ZapiMobileEnvCreds | null {
  const explicitMobile = hasExplicitZapiMobileEnv();
  const instanceId = String(
    process.env.ZAPI_MOBILE_ID || process.env.ZAPI_INSTANCE_ID || "",
  ).trim();
  const token = String(
    process.env.ZAPI_MOBILE_TOKEN || process.env.ZAPI_TOKEN || "",
  ).trim();
  if (!instanceId || !token) return null;

  const label = String(
    process.env.ZAPI_MOBILE_INSTANCIA || process.env.ZAPI_INSTANCE_LABEL || "",
  ).trim() || WHATSAPP_BOT_DISPLAY_NAME;
  const clientToken = [
    process.env.ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_CLIENTE_TOKEN,
    process.env.VITE_ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_SECURITY_TOKEN,
  ].map((v) => String(v || "").trim()).find(Boolean) || "";

  return { instanceId, token, label, clientToken, explicitMobileEnv: explicitMobile };
}
