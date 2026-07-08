// ── Conexão WhatsApp — delega ao provider da instância padrão no banco ───────

import { getDefaultWhatsappProvider } from "./whatsapp/providerRegistry";
import type { BootstrapResult, ConnectionStatus } from "./whatsapp/types";

export type { BootstrapResult as ZapiBootstrapResult };
export type ZapiStatus = ConnectionStatus;

/** @deprecated Use provider.bootstrapConnection() — mantido para compatibilidade. */
export async function bootstrapZapiConnection(force = false): Promise<BootstrapResult> {
  if (!force) {
    return { phase: "skipped", message: "Reconexão automática Z-API desativada por segurança anti-ban. Use ação manual no painel." };
  }
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) {
    return { phase: "error", message: "WhatsApp não configurado — cadastre a instância em Configurações." };
  }
  return provider.bootstrapConnection(force);
}

/** @deprecated Use provider.getStatus() */
export async function getZapiStatus(): Promise<ConnectionStatus> {
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) return { connected: false, error: "WhatsApp não configurado" };
  return provider.getStatus();
}

/** @deprecated Use provider.getConnectedPhone() */
export async function getZapiDevice(): Promise<{ phone: string | null; raw?: unknown }> {
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) return { phone: null };
  const phone = await provider.getConnectedPhone();
  return { phone };
}
