import type { ZapiInstanceType } from "./types";

export type ZapiCredentials = {
  instance: string;
  token: string;
  clientToken: string;
  type: ZapiInstanceType;
};

export function zapiBasePathFor(creds: Pick<ZapiCredentials, "instance" | "token">): string {
  return `https://api.z-api.io/instances/${creds.instance}/token/${creds.token}`;
}

export function zapiHeadersFor(creds: Pick<ZapiCredentials, "clientToken">, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export async function zapiFetchWith(
  creds: ZapiCredentials,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const url = `${zapiBasePathFor(creds)}/${path.replace(/^\//, "")}`;
  const headers = { ...zapiHeadersFor(creds, !!init.body), ...(init.headers as Record<string, string> || {}) };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);
  try {
    const r = await fetch(url, { ...init, headers, signal: ac.signal });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || "network" }, text: e?.message || "" };
  } finally {
    clearTimeout(timer);
  }
}

export function credsFromInstance(row: {
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  instance_type: ZapiInstanceType | null;
}): ZapiCredentials | null {
  if (!row.zapi_instance_id || !row.zapi_token) return null;
  const dbClient = String(row.zapi_client_token || "").trim();
  const envClient = String(process.env.ZAPI_CLIENT_TOKEN || "").trim();
  return {
    instance: row.zapi_instance_id,
    token: row.zapi_token,
    clientToken: dbClient || envClient,
    type: row.instance_type === "mobile" ? "mobile" : "web",
  };
}

export function officialPhoneParts(row: { official_ddi: string; official_phone: string }) {
  const ddi = String(row.official_ddi || "55").replace(/\D/g, "");
  const local = String(row.official_phone || "").replace(/\D/g, "");
  return { ddi, phone: local, full: local.startsWith(ddi) ? local : `${ddi}${local}` };
}
