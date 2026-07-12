/** Credenciais Z-API mobile via ambiente (Vercel / .env). */

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

  const label = String(process.env.ZAPI_MOBILE_INSTANCIA || "").trim() || "Central TM SEG";
  const clientToken = String(process.env.ZAPI_CLIENT_TOKEN || "").trim();

  return { instanceId, token, label, clientToken, explicitMobileEnv: explicitMobile };
}
