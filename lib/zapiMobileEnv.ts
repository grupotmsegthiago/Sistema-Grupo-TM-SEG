/** Credenciais Z-API mobile via ambiente (Vercel / .env) — seguro para handlers serverless. */

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

export function getZapiMobileEnvCreds(): ZapiMobileEnvCreds | null {
  const explicitMobile = hasExplicitZapiMobileEnv();
  const instanceId = String(
    process.env.ZAPI_MOBILE_ID || process.env.ZAPI_INSTANCE_ID || "",
  ).trim();
  const token = String(
    process.env.ZAPI_MOBILE_TOKEN || process.env.ZAPI_TOKEN || "",
  ).trim();
  if (!instanceId || !token) return null;

  const label = safeWhatsappInstanceLabel(
    String(process.env.ZAPI_MOBILE_INSTANCIA || "").trim() || WHATSAPP_BOT_DISPLAY_NAME,
  );
  const clientToken = String(process.env.ZAPI_CLIENT_TOKEN || "").trim();

  return { instanceId, token, label, clientToken, explicitMobileEnv: explicitMobile };
}
