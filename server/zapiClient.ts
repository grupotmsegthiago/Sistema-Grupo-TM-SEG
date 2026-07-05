// ── Cliente Z-API — lê credenciais da instância padrão no banco ─────────────

import { getDefaultWhatsappInstance } from "./whatsapp/instanceStore";
import { credsFromInstance, zapiBasePathFor, zapiFetchWith, zapiHeadersFor, type ZapiCredentials } from "./whatsapp/zapiHttp";
import type { ZapiInstanceType } from "./whatsapp/types";

export type { ZapiInstanceType, ZapiCredentials };

async function resolveCreds(): Promise<ZapiCredentials | null> {
  const row = await getDefaultWhatsappInstance();
  if (row) {
    const c = credsFromInstance(row);
    if (c) return c;
  }
  const instance = process.env.ZAPI_INSTANCE_ID || "";
  const token = process.env.ZAPI_TOKEN || "";
  if (!instance || !token) return null;
  return {
    instance,
    token,
    clientToken: process.env.ZAPI_CLIENT_TOKEN || "",
    type: (process.env.ZAPI_INSTANCE_TYPE || "web") === "mobile" ? "mobile" : "web",
  };
}

export async function getZapiCredentials(): Promise<ZapiCredentials | null> {
  return resolveCreds();
}

export function getZapiInstanceType(): ZapiInstanceType {
  return "web";
}

export async function getZapiInstanceTypeAsync(): Promise<ZapiInstanceType> {
  const c = await resolveCreds();
  return c?.type || "web";
}

export async function zapiBasePath(): Promise<string> {
  const c = await resolveCreds();
  if (!c) return "";
  return zapiBasePathFor(c);
}

export async function zapiHeaders(json = false): Promise<Record<string, string>> {
  const c = await resolveCreds();
  if (!c) return json ? { "Content-Type": "application/json" } : {};
  return zapiHeadersFor(c, json);
}

export async function zapiFetch(path: string, init: RequestInit = {}) {
  const c = await resolveCreds();
  if (!c) return { ok: false, status: 0, data: { error: "Z-API não configurada" }, text: "Z-API não configurada" };
  return zapiFetchWith(c, path, init);
}

export async function isZapiConfigured(): Promise<boolean> {
  return !!(await resolveCreds());
}

export function getOfficialPhoneParts() {
  return { ddi: "55", phone: "11926839456", full: "5511926839456" };
}
