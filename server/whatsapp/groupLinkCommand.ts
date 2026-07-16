/**
 * Vincula o grupo atual ao cadastro de cliente/fornecedor via menção ao bot.
 *
 * Exemplos no grupo:
 *   @monitoramento cadastra este grupo no cliente INTERMODAL
 *   @5511926839456 vincula grupo no fornecedor CTS
 */
import { createSupabaseAdminClient } from "../supabaseConfig";
import { OFFICIAL_BOT_PHONE_LOCAL } from "./zapiMobileEnv";
import { whatsappProviderSendText } from "./providerRegistry";
import { assertOfficialBotNumber } from "../zapiGuard";

/** Subconjunto do payload Z-API usado no vínculo de grupo (evita import circular com inboundBot). */
export type GroupLinkPayload = {
  phone?: string;
  from?: string;
  participant?: string;
  participantPhone?: string | null;
  senderPhone?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  senderName?: string;
  chatName?: string;
  text?: { message?: string };
  message?: { text?: string; extendedTextMessage?: { text?: string } };
  eventResponse?: {
    response?: string;
    responseFrom?: string;
    referencedMessage?: { participant?: string };
  };
  body?: string;
  mentioned?: unknown;
  mentionedMe?: boolean;
  mentionedPhones?: unknown;
};

const BOT_PHONE_DIGITS = `55${OFFICIAL_BOT_PHONE_LOCAL.replace(/\D/g, "").replace(/^55/, "")}`;

function extractText(payload: GroupLinkPayload): string {
  return String(
    payload.message?.text
    || payload.message?.extendedTextMessage?.text
    || payload.text?.message
    || payload.body
    || payload.eventResponse?.response
    || "",
  ).trim();
}

export function isWhatsappGroupLinkEnabled(): boolean {
  const raw = (process.env.WHATSAPP_GROUP_LINK_ENABLED || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function looksLikeGroupChatId(value: unknown): boolean {
  const raw = String(value || "");
  return raw.includes("@g.us")
    || raw.endsWith("-group")
    || /^\d+-\d+$/.test(raw)
    || /^120363\d{8,}$/.test(digitsOnly(raw));
}

export function normalizeEntityName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " E ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(LTDA|EIRELI|EPP|ME|SA|S A|S\/A|TRANSPORTES?|LOGISTICA|SEGURANCA|VIGILANCIA|PATRIMONIAL|SERVICOS?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function rowScore(row: { name?: string | null; trading_name?: string | null }, query: string): number {
  const target = normalizeEntityName(query);
  const names = [row.name, row.trading_name].map(normalizeEntityName).filter(Boolean);
  let best = 0;
  for (const name of names) {
    if (!target || !name) continue;
    if (name === target) best = Math.max(best, 100);
    if (name.includes(target) || target.includes(name)) best = Math.max(best, 80);
    const targetTokens = tokenSet(target);
    const nameTokens = tokenSet(name);
    const common = [...targetTokens].filter((t) => nameTokens.has(t)).length;
    if (common > 0) {
      const coverage = common / Math.max(1, targetTokens.size);
      best = Math.max(best, Math.round(coverage * 70));
    }
  }
  return best;
}

/** Detecta intenção de cadastro de grupo (mesmo sem menção — o gate de menção é separado). */
export function parseGroupLinkCommand(text: string): { kind: "client" | "provider"; name: string } | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  // Remove menções tipográficas (@nome / @5511...) para o parse do comando
  const cleaned = raw
    .replace(/@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const direct = cleaned.match(
    /(?:cadastr\w*|vincul\w*|registr\w*|salv\w*)\s+(?:este\s+)?grupo\s+(?:no|na|para|pro|pra|do|da|em)?\s*(cliente|fornecedor)\s+(.+)$/i,
  );
  if (direct) {
    const kind = String(direct[1] || "").toLowerCase().startsWith("forn") ? "provider" : "client";
    const name = String(direct[2] || "").replace(/[.!?]+$/, "").trim();
    if (name.length >= 2) return { kind, name };
  }

  // padrão invertido: "cliente X cadastra grupo"
  const inverted = cleaned.match(
    /^(cliente|fornecedor)\s+(.+?)\s*[,:-]?\s*(?:cadastr\w*|vincul\w*|registr\w*)\s+(?:este\s+)?grupo\b/i,
  );
  if (inverted) {
    const kind = String(inverted[1] || "").toLowerCase().startsWith("forn") ? "provider" : "client";
    const name = String(inverted[2] || "").replace(/[.!?]+$/, "").trim();
    if (name.length >= 2) return { kind, name };
  }

  return null;
}

export function isGroupLinkCommand(text: string): boolean {
  return !!parseGroupLinkCommand(text);
}

export function payloadAddressesBot(payload: GroupLinkPayload, text: string): boolean {
  if (payload.mentionedMe === true) return true;

  const lists = [payload.mentioned, payload.mentionedPhones];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const d = digitsOnly(item);
      if (!d) continue;
      if (d === BOT_PHONE_DIGITS || d.endsWith(OFFICIAL_BOT_PHONE_LOCAL.replace(/\D/g, ""))) return true;
    }
  }

  const t = String(text || "").toLowerCase();
  if (t.includes("@monitoramento")) return true;
  if (t.includes("@5511926839456") || t.includes("5511926839456")) return true;
  if (t.includes("@11926839456") || t.includes("11926839456")) return true;
  return false;
}

export function resolveInboundGroupId(payload: GroupLinkPayload): string | null {
  const candidates = [payload.phone, payload.from];
  for (const c of candidates) {
    const raw = String(c || "").trim();
    if (!raw || !looksLikeGroupChatId(raw)) continue;
    if (raw.endsWith("@g.us")) return raw.replace(/@g\.us$/i, "") + "-group";
    if (raw.endsWith("-group")) return raw;
    const digits = digitsOnly(raw);
    if (/^120363\d{8,}$/.test(digits)) return `${digits}-group`;
    return raw;
  }
  return null;
}

function resolvePrivatePhone(payload: GroupLinkPayload): string | null {
  const phone = String(payload.phone || "");
  const from = String(payload.from || "");
  const isGroup = payload.isGroup === true || looksLikeGroupChatId(phone) || looksLikeGroupChatId(from);
  const candidates = isGroup
    ? [payload.participantPhone, payload.participant, payload.senderPhone, payload.eventResponse?.responseFrom, payload.from]
    : [phone || from];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw || raw.includes("@lid") || looksLikeGroupChatId(raw)) continue;
    const d = digitsOnly(raw);
    if (d.length < 10 || looksLikeGroupChatId(d)) continue;
    return d.length <= 11 ? `55${d}` : d;
  }
  return null;
}

async function ensureProvidersWhatsappGroupColumn(sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<void> {
  try {
    await sb.rpc("exec_sql", {
      sql: "ALTER TABLE providers ADD COLUMN IF NOT EXISTS whatsapp_group_id TEXT;",
    });
  } catch {
    // Best-effort: se a RPC não existir, o UPDATE falhará com mensagem clara.
  }
}

async function findBestMatch(
  sb: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  table: "clients" | "providers",
  name: string,
): Promise<{ id: string | number; name: string; score: number } | null> {
  const select = "id,name,trading_name,whatsapp_group_id";
  const exact = await sb.from(table).select(select).eq("name", name).limit(1);
  if (exact.data?.[0]) {
    return { id: exact.data[0].id, name: String(exact.data[0].name), score: 100 };
  }
  const byTrading = await sb.from(table).select(select).eq("trading_name", name).limit(1);
  if (byTrading.data?.[0]) {
    return { id: byTrading.data[0].id, name: String(byTrading.data[0].name), score: 100 };
  }

  const token = normalizeEntityName(name).split(" ")[0] || name;
  const { data } = await sb
    .from(table)
    .select(select)
    .or(`name.ilike.*${token}*,trading_name.ilike.*${token}*`)
    .limit(40);

  let rows = data || [];
  if (rows.length === 0) {
    const all = await sb.from(table).select(select).limit(500);
    rows = all.data || [];
  }

  const ranked = rows
    .map((row) => ({ row, score: rowScore(row, name) }))
    .filter((x) => x.score >= 70)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  // Empate ambíguo: dois com score alto e nomes diferentes
  if (ranked[1] && ranked[1].score >= 80 && ranked[1].score === best.score) {
    return null;
  }
  return { id: best.row.id, name: String(best.row.name), score: best.score };
}

export async function handleGroupLinkCommand(payload: GroupLinkPayload): Promise<{
  handled: boolean;
  action?: string;
  error?: string;
  replyPhone?: string | null;
}> {
  if (!isWhatsappGroupLinkEnabled()) {
    return { handled: true, action: "group_link_disabled" };
  }
  if (payload.fromMe) return { handled: false, action: "ignored_from_me" };

  const text = extractText(payload);
  const parsed = parseGroupLinkCommand(text);
  if (!parsed) return { handled: false, action: "not_a_group_link_command" };

  const phone = String(payload.phone || "");
  const from = String(payload.from || "");
  const isGroup = payload.isGroup === true || looksLikeGroupChatId(phone) || looksLikeGroupChatId(from);
  if (!isGroup) {
    return {
      handled: true,
      action: "group_link_not_in_group",
      error: "O comando de vínculo só funciona dentro do grupo de WhatsApp.",
    };
  }

  if (!payloadAddressesBot(payload, text)) {
    return {
      handled: true,
      action: "group_link_missing_mention",
      error: "Mencione @monitoramento (ou o número do bot) junto com o comando.",
    };
  }

  const groupId = resolveInboundGroupId(payload);
  if (!groupId || !/-group$|@g\.us$/i.test(groupId)) {
    return { handled: true, action: "group_link_invalid_group", error: "Não foi possível identificar o ID do grupo." };
  }

  const numGuard = await assertOfficialBotNumber();
  if (!numGuard.ok) {
    return { handled: true, action: "blocked_unofficial_number", error: numGuard.error || "Número não oficial" };
  }

  const sb = createSupabaseAdminClient();
  if (!sb) return { handled: true, action: "no_supabase", error: "Supabase não configurado" };

  if (parsed.kind === "provider") {
    await ensureProvidersWhatsappGroupColumn(sb);
  }

  const table = parsed.kind === "provider" ? "providers" : "clients";
  const match = await findBestMatch(sb, table, parsed.name);
  if (!match) {
    const label = parsed.kind === "provider" ? "fornecedor" : "cliente";
    const msg = `Não encontrei ${label} correspondente a "${parsed.name}". Verifique o nome no cadastro e tente de novo.`;
    await sendGroupLinkAck(groupId, payload, msg);
    return { handled: true, action: "group_link_not_found", error: msg };
  }

  const { error } = await sb
    .from(table)
    .update({ whatsapp_group_id: groupId })
    .eq("id", match.id);

  if (error) {
    const msg = `Falha ao salvar o grupo no cadastro: ${error.message}`;
    await sendGroupLinkAck(groupId, payload, msg);
    return { handled: true, action: "group_link_update_failed", error: msg };
  }

  const kindLabel = parsed.kind === "provider" ? "fornecedor" : "cliente";
  const okMsg = `✅ Grupo vinculado ao ${kindLabel} *${match.name}*.\nAtualizações de OS passarão a ser enviadas aqui (com print + tabela).`;
  await sendGroupLinkAck(groupId, payload, okMsg);
  return {
    handled: true,
    action: "group_linked",
    replyPhone: resolvePrivatePhone(payload),
  };
}

async function sendGroupLinkAck(
  groupId: string,
  payload: GroupLinkPayload,
  message: string,
): Promise<void> {
  // Prefere confirmar no próprio grupo; se falhar, tenta PV do remetente.
  const groupSend = await whatsappProviderSendText(groupId, message, "vínculo grupo WhatsApp");
  if (groupSend.ok) return;
  const pv = resolvePrivatePhone(payload);
  if (!pv) return;
  await whatsappProviderSendText(pv, message, "vínculo grupo WhatsApp PV");
}
