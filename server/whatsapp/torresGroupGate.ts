/**
 * Gate operacional: o bot só responde comandos conversacionais
 * (resumo / reinício / status) no grupo Torres.
 *
 * Demais grupos de cliente/fornecedor NÃO recebem resposta do bot —
 * só atualizações de OS pelo sistema (formulário + print) via
 * `/api/whatsapp/send-group`.
 *
 * Identificação do grupo Torres (qualquer um basta):
 * 1. Env `WHATSAPP_TORRES_GROUP_ID` (IDs separados por vírgula)
 * 2. `chatName` do payload contendo "Torres"
 * 3. `providers.whatsapp_group_id` de fornecedor cujo nome contém Torres
 *
 * Importante: helpers síncronos não importam Supabase no topo do módulo
 * (testes unitários e cold start do webhook).
 */

export function normalizeWhatsappGroupId(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.endsWith("@g.us")) return raw.replace(/@g\.us$/i, "") + "-group";
  if (raw.endsWith("-group")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (/^120363\d{8,}$/.test(digits)) return `${digits}-group`;
  if (/^\d+-\d+$/.test(raw)) return raw;
  return raw;
}

export function parseTorresGroupIdsFromEnv(envValue?: string | null): string[] {
  const raw = String(envValue ?? process.env.WHATSAPP_TORRES_GROUP_ID ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => normalizeWhatsappGroupId(part))
    .filter(Boolean);
}

export function chatNameLooksLikeTorres(chatName: unknown): boolean {
  const normalized = String(chatName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return /\bTORRES\b/.test(normalized);
}

function looksLikeGroupChatId(value: unknown): boolean {
  const raw = String(value || "");
  return raw.includes("@g.us")
    || raw.endsWith("-group")
    || /^\d+-\d+$/.test(raw)
    || /^120363\d{8,}$/.test(String(value || "").replace(/\D/g, ""));
}

export function resolveInboundGroupIdForGate(payload: {
  phone?: string;
  from?: string;
  isGroup?: boolean;
}): string | null {
  const candidates = [payload.phone, payload.from];
  for (const c of candidates) {
    const raw = String(c || "").trim();
    if (!raw || !looksLikeGroupChatId(raw)) continue;
    return normalizeWhatsappGroupId(raw) || null;
  }
  return null;
}

export function isTorresOperationalGroupSync(opts: {
  isGroup: boolean;
  groupId?: string | null;
  chatName?: string | null;
  allowedGroupIds?: string[];
  envGroupIds?: string[];
}): boolean {
  if (!opts.isGroup) return false;

  const groupId = normalizeWhatsappGroupId(opts.groupId);
  const allowed = [
    ...(opts.envGroupIds ?? parseTorresGroupIdsFromEnv()),
    ...(opts.allowedGroupIds || []).map(normalizeWhatsappGroupId),
  ].filter(Boolean);

  if (groupId && allowed.some((id) => id === groupId)) return true;
  if (chatNameLooksLikeTorres(opts.chatName)) return true;
  return false;
}

/** Carrega IDs de grupo WhatsApp do fornecedor Torres (cadastro). */
export async function loadTorresGroupIdsFromProviders(): Promise<string[]> {
  try {
    const { createSupabaseAdminClient } = await import("../supabaseConfig");
    const sb = createSupabaseAdminClient();
    if (!sb) return [];

    const { data, error } = await sb
      .from("providers")
      .select("name,trading_name,whatsapp_group_id")
      .or("name.ilike.%TORRES%,trading_name.ilike.%TORRES%")
      .limit(40);

    if (error || !data?.length) return [];

    return data
      .filter((row) => chatNameLooksLikeTorres(row.name) || chatNameLooksLikeTorres(row.trading_name))
      .map((row) => normalizeWhatsappGroupId(row.whatsapp_group_id))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function isTorresOperationalGroup(payload: {
  phone?: string;
  from?: string;
  isGroup?: boolean;
  chatName?: string;
}): Promise<{ allowed: boolean; reason: string; groupId: string | null }> {
  const phone = String(payload.phone || "");
  const from = String(payload.from || "");
  const isGroup = payload.isGroup === true || looksLikeGroupChatId(phone) || looksLikeGroupChatId(from);

  if (!isGroup) {
    return {
      allowed: false,
      reason: "Bot só responde no grupo Torres (mensagens privadas são ignoradas)",
      groupId: null,
    };
  }

  const groupId = resolveInboundGroupIdForGate(payload);
  const fromDb = await loadTorresGroupIdsFromProviders();
  const allowed = isTorresOperationalGroupSync({
    isGroup: true,
    groupId,
    chatName: payload.chatName,
    allowedGroupIds: fromDb,
  });

  return {
    allowed,
    reason: allowed
      ? "grupo_torres"
      : "Bot só responde no grupo Torres; demais grupos só recebem atualizações do sistema com print (formulário + foto)",
    groupId,
  };
}
