// ── Tipos compartilhados — camada de providers WhatsApp ─────────────────────

export type WhatsappProviderId = "zapi" | "meta" | "mock";
export type ZapiInstanceType = "web" | "mobile";

export type WhatsappInstanceRecord = {
  id: string;
  slug: string;
  label: string;
  provider: WhatsappProviderId;
  instance_type: ZapiInstanceType | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
  official_ddi: string;
  official_phone: string;
  is_default: boolean;
  enabled: boolean;
  last_checked_at: string | null;
  last_connected: boolean | null;
  last_connected_phone: string | null;
  phone_matches_official: boolean | null;
  last_error: string | null;
  last_heartbeat_at: string | null;
  last_qr_base64: string | null;
  last_connected_at: string | null;
  last_status_raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WhatsappInstancePublic = Omit<
  WhatsappInstanceRecord,
  "zapi_token" | "zapi_client_token" | "meta_access_token"
> & {
  has_zapi_token: boolean;
  has_meta_token: boolean;
  zapi_token_masked?: string;
};

export type ConnectionStatus = {
  connected: boolean;
  smartphoneConnected?: boolean;
  session?: boolean;
  error?: string;
  raw?: unknown;
};

export type ConnectionTestResult = {
  ok: boolean;
  instanceId: string;
  slug: string;
  provider: WhatsappProviderId;
  apiReachable: boolean;
  connected: boolean;
  connectedPhone: string | null;
  expectedPhone: string;
  phoneMatchesOfficial: boolean;
  message: string;
  status?: ConnectionStatus;
  checkedAt: string;
};

export type SendTextParams = {
  phone: string;
  message: string;
  queueLabel?: string;
};

export type SendImageParams = {
  phone: string;
  caption: string;
  imageBase64: string;
  queueLabel?: string;
};

export type SendResult = {
  ok: boolean;
  httpStatus: number;
  data?: unknown;
  error?: string;
  queueWaitMs?: number;
  queueDepth?: number;
};

export type BootstrapResult = {
  phase: "connected" | "skipped" | "needs_qr" | "needs_code" | "needs_pin" | "needs_device_confirm" | "error" | "unsupported";
  message: string;
  status?: ConnectionStatus;
  phone?: string | null;
  qrBase64?: string | null;
  phoneLinkCode?: string | null;
  registration?: unknown;
  requestCode?: unknown;
  instanceType?: string;
};

export interface WhatsappProvider {
  readonly providerId: WhatsappProviderId;
  readonly instance: WhatsappInstanceRecord;
  testConnection(): Promise<ConnectionTestResult>;
  getStatus(): Promise<ConnectionStatus>;
  getConnectedPhone(): Promise<string | null>;
  sendText(params: SendTextParams): Promise<SendResult>;
  sendImage(params: SendImageParams): Promise<SendResult>;
  bootstrapConnection(force?: boolean): Promise<BootstrapResult>;
  getQrCode?(): Promise<{ qrBase64: string | null; error?: string }>;
  getPhoneLinkCode?(): Promise<{ code: string | null; error?: string }>;
  mobileRequestCode?(method: "sms" | "voice" | "wa_old"): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  mobileConfirmCode?(code: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  mobileConfirmSecurityCode?(pin: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
}

export function fullOfficialPhone(row: Pick<WhatsappInstanceRecord, "official_ddi" | "official_phone">): string {
  const ddi = String(row.official_ddi || "55").replace(/\D/g, "");
  const local = String(row.official_phone || "").replace(/\D/g, "");
  return local.startsWith(ddi) ? local : `${ddi}${local}`;
}

export function expectedOfficialPhone(row: Pick<WhatsappInstanceRecord, "official_ddi" | "official_phone">): string {
  return fullOfficialPhone(row);
}

export function maskSecret(value: string | null | undefined, visible = 4): string {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= visible) return "*".repeat(s.length);
  return "*".repeat(Math.max(0, s.length - visible)) + s.slice(-visible);
}

export function toPublicInstance(row: WhatsappInstanceRecord): WhatsappInstancePublic {
  const { zapi_token, zapi_client_token, meta_access_token, ...rest } = row;
  return {
    ...rest,
    has_zapi_token: !!zapi_token,
    has_meta_token: !!meta_access_token,
    zapi_token_masked: zapi_token ? maskSecret(zapi_token) : undefined,
  };
}
