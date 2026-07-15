/** Credenciais Z-API via ambiente (Vercel / .env) — seguro para handlers serverless. */

import { safeWhatsappInstanceLabel } from "./whatsappDisplayUtils.js";

export const WHATSAPP_BOT_DISPLAY_NAME = "Monitoramento 24h";
export const OFFICIAL_BOT_PHONE_LOCAL = "11926839456";

export type ZapiMobileEnvCreds = {
  instanceId: string;
  token: string;
  label: string;
  clientToken: string;
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
 * ZAPI_MOBILE_* sempre vence sobre variáveis legadas; WEB exige ZAPI_INSTANCE_TYPE=web.
 */
export function getZapiEnvInstanceType(): "web" | "mobile" {
  if (hasExplicitZapiMobileEnv()) return "mobile";
  return String(process.env.ZAPI_INSTANCE_TYPE || "mobile").trim().toLowerCase() === "web"
    ? "web"
    : "mobile";
}

export function getZapiMobileEnvCreds(): ZapiMobileEnvCreds | null {
  const explicitMobile = hasExplicitZapiMobileEnv();
  const instanceId = String(
    process.env.ZAPI_MOBILE_ID || process.env.ZAPI_INSTANCE_ID || "",
  ).trim();
  const token = String(
    process.env.ZAPI_MOBILE_TOKEN || process.env.ZAPI_TOKEN || "",
  ).trim();
  if (!instanceId || !token) return null;

  const rawLabel = String(
    process.env.ZAPI_MOBILE_INSTANCIA || process.env.ZAPI_INSTANCE_LABEL || "",
  ).trim() || WHATSAPP_BOT_DISPLAY_NAME;
  const label = safeWhatsappInstanceLabel(rawLabel);
  const clientToken = [
    process.env.ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_CLIENTE_TOKEN,
    process.env.VITE_ZAPI_CLIENT_TOKEN,
    process.env.ZAPI_SECURITY_TOKEN,
  ].map((v) => String(v || "").trim()).find(Boolean) || "";

  return { instanceId, token, label, clientToken, explicitMobileEnv: explicitMobile };
}
