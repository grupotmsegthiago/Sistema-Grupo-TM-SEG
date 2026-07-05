import { saveConnectionHealth } from "../instanceStore";
import type {
  BootstrapResult,
  ConnectionStatus,
  ConnectionTestResult,
  SendImageParams,
  SendResult,
  SendTextParams,
  WhatsappInstanceRecord,
  WhatsappProvider,
} from "../types";
import { expectedOfficialPhone } from "../types";

export class MetaWhatsappProvider implements WhatsappProvider {
  readonly providerId = "meta" as const;
  readonly instance: WhatsappInstanceRecord;

  constructor(instance: WhatsappInstanceRecord) {
    this.instance = instance;
  }

  private notReady(): Error {
    return new Error("Provider Meta ainda não implementado para envios — configure Z-API ou aguarde migração.");
  }

  async getStatus(): Promise<ConnectionStatus> {
    const version = this.instance.meta_api_version || "v21.0";
    const phoneId = this.instance.meta_phone_number_id;
    const token = this.instance.meta_access_token;
    if (!phoneId || !token) return { connected: false, error: "Meta não configurado" };
    try {
      const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      return { connected: r.ok, error: r.ok ? undefined : data?.error?.message, raw: data };
    } catch (e: any) {
      return { connected: false, error: e?.message };
    }
  }

  async getConnectedPhone(): Promise<string | null> {
    return expectedOfficialPhone(this.instance);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = new Date().toISOString();
    const status = await this.getStatus();
    const ok = status.connected === true;
    const message = ok ? "Meta Cloud API respondeu." : (status.error || "Meta indisponível");
    await saveConnectionHealth(this.instance.id, {
      connected: ok,
      connectedPhone: ok ? expected : null,
      phoneMatchesOfficial: ok,
      error: ok ? null : message,
      statusRaw: status.raw as Record<string, unknown>,
    });
    return {
      ok,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "meta",
      apiReachable: ok,
      connected: ok,
      connectedPhone: ok ? expected : null,
      expectedPhone: expected,
      phoneMatchesOfficial: ok,
      message,
      status,
      checkedAt,
    };
  }

  async sendText(_params: SendTextParams): Promise<SendResult> {
    throw this.notReady();
  }

  async sendImage(_params: SendImageParams): Promise<SendResult> {
    throw this.notReady();
  }

  async bootstrapConnection(): Promise<BootstrapResult> {
    return { phase: "unsupported", message: "Conexão Meta via painel Meta Business — provider de envio em desenvolvimento." };
  }
}
