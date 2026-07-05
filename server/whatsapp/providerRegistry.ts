import { getDefaultWhatsappInstance, getWhatsappInstanceById, instanceConfigured } from "./instanceStore";
import { MetaWhatsappProvider } from "./providers/meta";
import { MockWhatsappProvider } from "./providers/mock";
import { ZapiWhatsappProvider } from "./providers/zapi";
import type { WhatsappInstanceRecord, WhatsappProvider } from "./types";

export function createWhatsappProvider(instance: WhatsappInstanceRecord): WhatsappProvider {
  switch (instance.provider) {
    case "meta":
      return new MetaWhatsappProvider(instance);
    case "mock":
      return new MockWhatsappProvider(instance);
    case "zapi":
    default:
      return new ZapiWhatsappProvider(instance);
  }
}

export async function getDefaultWhatsappProvider(force = false): Promise<WhatsappProvider | null> {
  const row = await getDefaultWhatsappInstance(force);
  if (!row || !instanceConfigured(row)) return null;
  return createWhatsappProvider(row);
}

export async function getWhatsappProviderById(id: string): Promise<WhatsappProvider | null> {
  const row = await getWhatsappInstanceById(id);
  if (!row || !instanceConfigured(row)) return null;
  return createWhatsappProvider(row);
}

/** Atalho usado pelo restante do sistema. */
export async function whatsappProviderSendText(phone: string, message: string, queueLabel: string) {
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) throw new Error("Nenhuma instância WhatsApp configurada no banco.");
  return provider.sendText({ phone, message, queueLabel });
}

export async function whatsappProviderSendImage(phone: string, caption: string, imageBase64: string, queueLabel: string) {
  const provider = await getDefaultWhatsappProvider(true);
  if (!provider) throw new Error("Nenhuma instância WhatsApp configurada no banco.");
  return provider.sendImage({ phone, caption, imageBase64, queueLabel });
}

export async function testWhatsappInstanceConnection(instanceId: string) {
  const provider = await getWhatsappProviderById(instanceId);
  if (!provider) throw new Error("Instância não encontrada ou incompleta.");
  return provider.testConnection();
}
