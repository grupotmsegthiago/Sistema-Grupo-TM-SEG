import type { ZapiCredentials } from "./zapiHttp";
import { zapiFetchWith } from "./zapiHttp";

export type ExtensionTokenResult = {
  token: string | null;
  expiresAt: number | null;
  error?: string;
};

/** Gera token para extensão Z-API Conector (validade ~5 min). */
export async function fetchZapiExtensionToken(creds: ZapiCredentials): Promise<ExtensionTokenResult> {
  const { ok, data, text } = await zapiFetchWith(creds, "extension-token", { method: "GET" });
  if (!ok) {
    return { token: null, expiresAt: null, error: data?.error || text || "Falha ao gerar token de extensão" };
  }
  const token = String(data?.token || "").trim() || null;
  const expiresAt = data?.expiresAt != null ? Number(data.expiresAt) : null;
  if (!token) {
    return { token: null, expiresAt: null, error: "Z-API não retornou código de extensão" };
  }
  return { token, expiresAt };
}
