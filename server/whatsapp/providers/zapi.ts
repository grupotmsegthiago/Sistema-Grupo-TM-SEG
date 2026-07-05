import { throttleZapiSend } from "../../zapiThrottle";
import { invalidateBotPhoneCache } from "../../zapiGuard";
import {
  credsFromInstance,
  officialPhoneParts,
  zapiBasePathFor,
  zapiFetchWith,
  zapiHeadersFor,
  type ZapiCredentials,
} from "../zapiHttp";
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
import { expectedOfficialPhone, fullOfficialPhone } from "../types";

export class ZapiWhatsappProvider implements WhatsappProvider {
  readonly providerId = "zapi" as const;
  readonly instance: WhatsappInstanceRecord;

  constructor(instance: WhatsappInstanceRecord) {
    this.instance = instance;
  }

  private creds(): ZapiCredentials {
    const c = credsFromInstance(this.instance);
    if (!c) throw new Error("Credenciais Z-API incompletas na instância");
    return c;
  }

  async getStatus(): Promise<ConnectionStatus> {
    const { ok, data } = await zapiFetchWith(this.creds(), "status", { method: "GET" });
    if (!ok && !data) return { connected: false, error: "Falha ao consultar status" };
    return {
      connected: data?.connected === true && data?.smartphoneConnected !== false,
      smartphoneConnected: data?.smartphoneConnected,
      session: data?.session,
      error: data?.error,
      raw: data,
    };
  }

  async getConnectedPhone(): Promise<string | null> {
    const { ok, data } = await zapiFetchWith(this.creds(), "device", { method: "GET" });
    if (!ok || !data) return null;
    return String(data.phone || data?.device?.phone || data?.wid || "").replace(/\D/g, "") || null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const expected = expectedOfficialPhone(this.instance);
    const checkedAt = new Date().toISOString();
    let apiReachable = false;
    let status: ConnectionStatus = { connected: false };
    let connectedPhone: string | null = null;

    try {
      status = await this.getStatus();
      apiReachable = true;
      connectedPhone = status.connected ? await this.getConnectedPhone() : null;
    } catch (e: any) {
      status = { connected: false, error: e?.message || "Erro de rede" };
    }

    const phoneMatchesOfficial = connectedPhone === expected;
    const ok = apiReachable && status.connected === true && phoneMatchesOfficial;

    let message = "";
    if (!apiReachable) message = "Z-API não respondeu.";
    else if (!status.connected) message = `Desconectado${status.error ? `: ${status.error}` : ""}.`;
    else if (!phoneMatchesOfficial) {
      message = `Conectado em ${connectedPhone}, esperado ${expected}.`;
    } else {
      message = `Conectado no número oficial (${expected}).`;
    }

    await saveConnectionHealth(this.instance.id, {
      connected: !!status.connected,
      connectedPhone,
      phoneMatchesOfficial,
      error: ok ? null : message,
      statusRaw: status.raw,
    });

    return {
      ok,
      instanceId: this.instance.id,
      slug: this.instance.slug,
      provider: "zapi",
      apiReachable,
      connected: !!status.connected,
      connectedPhone,
      expectedPhone: expected,
      phoneMatchesOfficial,
      message,
      status,
      checkedAt,
    };
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    const creds = this.creds();
    const queueMeta = { queueWaitMs: 0, queueDepth: 0 };
    const label = params.queueLabel || "send-text";
    const r = await throttleZapiSend(label, () => fetch(`${zapiBasePathFor(creds)}/send-text`, {
      method: "POST",
      headers: { ...zapiHeadersFor(creds, true) },
      body: JSON.stringify({ phone: params.phone, message: params.message }),
    }), queueMeta);
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return {
      ok: r.ok,
      httpStatus: r.status,
      data,
      error: r.ok ? undefined : String(data?.error || text),
      queueWaitMs: queueMeta.queueWaitMs,
      queueDepth: queueMeta.queueDepth,
    };
  }

  async sendImage(params: SendImageParams): Promise<SendResult> {
    const creds = this.creds();
    const queueMeta = { queueWaitMs: 0, queueDepth: 0 };
    const label = params.queueLabel || "send-image";
    const r = await throttleZapiSend(label, () => fetch(`${zapiBasePathFor(creds)}/send-image`, {
      method: "POST",
      headers: { ...zapiHeadersFor(creds, true) },
      body: JSON.stringify({
        phone: params.phone,
        image: params.imageBase64.trim(),
        caption: params.caption,
        viewOnce: false,
      }),
    }), queueMeta);
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return {
      ok: r.ok,
      httpStatus: r.status,
      data,
      error: r.ok ? undefined : String(data?.error || text),
      queueWaitMs: queueMeta.queueWaitMs,
      queueDepth: queueMeta.queueDepth,
    };
  }

  async getQrCode() {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "qr-code/image", { method: "GET" });
    if (!ok) return { qrBase64: null, error: data?.error || text };
    const value = data?.value || data?.qrcode;
    if (typeof value === "string" && value.length > 20) {
      return { qrBase64: value.startsWith("data:") ? value : `data:image/png;base64,${value}` };
    }
    return { qrBase64: null, error: "QR indisponível" };
  }

  async getPhoneLinkCode() {
    const { full } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), `phone-code/${full}`, { method: "GET" });
    if (!ok) return { code: null, error: data?.error || text };
    return { code: String(data?.value || "").trim() || null };
  }

  async mobileRegistrationAvailable() {
    const { ddi, phone } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/registration-available", {
      method: "POST",
      body: JSON.stringify({ ddi, phone }),
    });
    return { ok, data, error: ok ? undefined : (data?.error || text) };
  }

  async mobileRequestCode(method: "sms" | "voice" | "wa_old" = "wa_old") {
    const { ddi, phone } = officialPhoneParts(this.instance);
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/request-code", {
      method: "POST",
      body: JSON.stringify({ ddi, phone, method }),
    });
    return { ok, data, error: ok ? undefined : (data?.error || text), method };
  }

  async mobileConfirmCode(code: string) {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/confirm-code", {
      method: "POST",
      body: JSON.stringify({ code: String(code).trim() }),
    });
    if (ok && data?.success) invalidateBotPhoneCache();
    return { ok, data, error: ok ? undefined : (data?.error || text) };
  }

  async mobileConfirmSecurityCode(pin: string) {
    const { ok, data, text } = await zapiFetchWith(this.creds(), "mobile/confirm-security-code", {
      method: "POST",
      body: JSON.stringify({ code: String(pin).trim() }),
    });
    if (ok && data?.success) invalidateBotPhoneCache();
    return { ok, data, error: ok ? undefined : (data?.error || text) };
  }

  async bootstrapConnection(force = false): Promise<BootstrapResult> {
    const type = this.creds().type;
    const status = await this.getStatus();
    if (status.connected) {
      const phone = await this.getConnectedPhone();
      invalidateBotPhoneCache();
      const expected = fullOfficialPhone(this.instance);
      return {
        phase: "connected",
        message: phone === expected
          ? `Conectado no número oficial.`
          : `Conectado em ${phone} (esperado ${expected}).`,
        status,
        phone,
        instanceType: type,
      };
    }

    if (!force) {
      return {
        phase: type === "mobile" ? "needs_code" : "needs_qr",
        message: type === "mobile"
          ? "Desconectado — use Iniciar conexão no painel."
          : "Desconectado — escaneie o QR Code.",
        status,
        instanceType: type,
      };
    }

    if (type === "mobile") {
      const reg = await this.mobileRegistrationAvailable();
      if (!reg.ok || reg.data?.available === false) {
        return { phase: "error", message: reg.data?.blocked ? "Número bloqueado." : (reg.error || "Indisponível"), status, registration: reg.data, instanceType: type };
      }
      const preferWaOld = reg.data?.waOldEligible === true;
      const req = await this.mobileRequestCode(preferWaOld ? "wa_old" : "sms");
      if (!req.ok || req.data?.success === false) {
        return { phase: "error", message: req.error || "Falha ao solicitar código.", status, requestCode: req.data, instanceType: type };
      }
      return {
        phase: "needs_code",
        message: preferWaOld ? "Confirme o pop-up no WhatsApp e informe o código se pedido." : "Código SMS enviado — informe abaixo.",
        status,
        registration: reg.data,
        requestCode: req.data,
        instanceType: type,
      };
    }

    const [qr, link] = await Promise.all([this.getQrCode(), this.getPhoneLinkCode()]);
    if (qr.qrBase64) {
      await saveConnectionHealth(this.instance.id, {
        connected: false,
        connectedPhone: null,
        phoneMatchesOfficial: false,
        error: null,
        qrBase64: qr.qrBase64,
      });
    }
    return {
      phase: qr.qrBase64 ? "needs_qr" : "needs_code",
      message: qr.qrBase64 ? "Escaneie o QR Code." : (qr.error || "QR indisponível"),
      status,
      qrBase64: qr.qrBase64,
      phoneLinkCode: link.code,
      instanceType: type,
    };
  }
}
