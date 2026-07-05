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

export class MockWhatsappProvider implements WhatsappProvider {
  readonly providerId = "mock" as const;
  readonly instance: WhatsappInstanceRecord;

  constructor(instance: WhatsappInstanceRecord) {
    this.instance = instance;
  }

  async getStatus(): Promise<ConnectionStatus> {
    return { connected: true, raw: { mock: true } };
  }

  async getConnectedPhone(): Promise<string | null> {
    return expectedOfficialPhone(this.instance);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = new Date().toISOString();
    await saveConnectionHealth(this.instance.id, {
      connected: true,
      connectedPhone: expected,
      phoneMatchesOfficial: true,
      error: null,
      statusRaw: { mock: true },
    });
    return {
      ok: true,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "mock",
      apiReachable: true,
      connected: true,
      connectedPhone: expected,
      expectedPhone: expected,
      phoneMatchesOfficial: true,
      message: "Mock — sempre conectado.",
      checkedAt,
    };
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    console.log(`[WhatsApp Mock] sendText → ${params.phone}: ${params.message.slice(0, 80)}…`);
    return { ok: true, httpStatus: 200, data: { mock: true, id: `mock-${Date.now()}` } };
  }

  async sendImage(params: SendImageParams): Promise<SendResult> {
    console.log(`[WhatsApp Mock] sendImage → ${params.phone}`);
    return { ok: true, httpStatus: 200, data: { mock: true } };
  }

  async bootstrapConnection(): Promise<BootstrapResult> {
    return { phase: "connected", message: "Mock conectado." };
  }
}
