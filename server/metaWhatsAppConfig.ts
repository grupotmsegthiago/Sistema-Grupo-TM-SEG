// Stub Meta Cloud API — migração futura (WHATSAPP_PROVIDER=meta).

export function getWhatsappProvider(): string {
  return (process.env.WHATSAPP_PROVIDER || "zapi").trim().toLowerCase();
}

export function isMetaWhatsAppConfigured(): boolean {
  return !!(
    process.env.META_WHATSAPP_ACCESS_TOKEN
    && process.env.META_WHATSAPP_PHONE_NUMBER_ID
  );
}

export async function pingMetaWhatsApp(): Promise<{
  ok: boolean;
  configured: boolean;
  error?: string;
  displayPhone?: string;
}> {
  const configured = isMetaWhatsAppConfigured();
  if (!configured) {
    return { ok: false, configured: false, error: "META_WHATSAPP_PHONE_NUMBER_ID não configurado" };
  }
  const version = process.env.META_WHATSAPP_API_VERSION || "v21.0";
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, configured: true, error: data?.error?.message || `HTTP ${r.status}` };
    }
    return {
      ok: true,
      configured: true,
      displayPhone: process.env.META_WHATSAPP_DISPLAY_PHONE || data?.display_phone_number,
    };
  } catch (e: any) {
    return { ok: false, configured: true, error: e?.message || "Erro de rede" };
  }
}
