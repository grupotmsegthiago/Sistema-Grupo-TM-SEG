/** Auth mínimo para handlers serverless leves (sem Express). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_REF = "ajhmmjuewdsukecaimik";

const WHATSAPP_ADMIN_ROLES = new Set(["diretoria", "administrador", "ceo", "admin"]);

export type LitePrincipal = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

type ReqHeaders = Record<string, string | string[] | undefined>;
type ProfileRow = { name?: string; permissions?: string[] };

function cleanEnv(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().replace(/^["']|["']$/g, "");
}

function headerValue(req: { headers?: ReqHeaders } | undefined, name: string): string {
  const raw = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return String(raw || "").trim();
}

function normalizeRole(role: string): string {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parsePermissions(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(",").map((p) => p.trim()).filter(Boolean);
  }
}

function readProfile(data: { profiles?: ProfileRow | ProfileRow[] | null }): ProfileRow | null {
  const raw = data.profiles;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

function canAccessWhatsapp(role: string, permissions: string[]): boolean {
  const normalized = normalizeRole(role);
  if (WHATSAPP_ADMIN_ROLES.has(normalized)) return true;
  if (permissions.includes("*")) return true;
  return false;
}

function pickServiceRoleKey(): string {
  for (const candidate of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.TMSEG_SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const key = cleanEnv(candidate);
    if (key) return key;
  }
  return "";
}

export function readBearer(req: { headers?: ReqHeaders }): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  return String(raw || "").replace(/^Bearer\s+/i, "").trim()
    || headerValue(req, "x-auth-token");
}

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

export function supabaseLite(): SupabaseClient {
  const envUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const service = pickServiceRoleKey();
  const key = service
    || cleanEnv(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
    || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

async function resolveFromDatabase(userId: string): Promise<{
  found: boolean;
  active: boolean;
  adminOk: boolean;
  principal: LitePrincipal | null;
}> {
  const service = pickServiceRoleKey();
  const envUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const url = envUrl.includes(TMSEG_REF) ? envUrl : DEFAULT_SUPABASE_URL;
  const key = service || cleanEnv(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY;
  const sb = createClient(url, key);

  const { data, error } = await sb
    .from("system_users")
    .select("id, name, email, status, permissions, profiles:profile_id ( name, permissions )")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[tmsegAuth] system_users:", error.message);
    return { found: false, active: false, adminOk: false, principal: null };
  }
  if (!data) return { found: false, active: false, adminOk: false, principal: null };

  const profile = readProfile(data as { profiles?: ProfileRow | ProfileRow[] | null });
  const role = normalizeRole(profile?.name || "");
  const profilePerms = Array.isArray(profile?.permissions) ? profile.permissions : [];
  const userPerms = Array.isArray((data as { permissions?: string[] }).permissions)
    ? (data as { permissions?: string[] }).permissions!
    : [];
  const permissions = [...new Set([...profilePerms, ...userPerms])];

  const principal: LitePrincipal = {
    id: String(data.id),
    name: (data as { name?: string }).name || null,
    email: (data as { email?: string }).email || null,
    role,
  };

  const active = (data as { status?: string }).status === "Ativo";
  return {
    found: true,
    active,
    adminOk: active && canAccessWhatsapp(role, permissions),
    principal: active ? principal : null,
  };
}

function resolveFromHeaders(
  token: string,
  req?: { headers?: ReqHeaders },
  options: { adminOnly?: boolean } = {},
): { ok: boolean; principal: LitePrincipal | null } | null {
  if (!req?.headers) return null;
  const userId = extractUserIdFromToken(token);
  const headerUserId = headerValue(req, "x-tmseg-user-id");
  if (!userId || !headerUserId || userId !== headerUserId) return null;

  const role = normalizeRole(headerValue(req, "x-tmseg-role"));
  const permissions = parsePermissions(headerValue(req, "x-tmseg-permissions"));
  const ok = options.adminOnly ? canAccessWhatsapp(role, permissions) : !!userId;
  return {
    ok,
    principal: {
      id: userId,
      name: headerValue(req, "x-tmseg-user-name") || null,
      email: null,
      role,
    },
  };
}

export async function resolveLitePrincipal(token: string, req?: { headers?: ReqHeaders }): Promise<LitePrincipal | null> {
  if (!token) return null;
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.principal) return fromDb.principal;

  const fromHeaders = resolveFromHeaders(token, req, { adminOnly: false });
  return fromHeaders?.principal || null;
}

/** Retorna null se autorizado; mensagem se negado. */
export async function assertWhatsappAdminAccess(
  token: string,
  req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return "Não autorizado";
  const userId = extractUserIdFromToken(token);
  if (!userId) return "Não autorizado";

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.adminOk && fromDb.principal) return null;
  if (fromDb.found && fromDb.active && !fromDb.adminOk) {
    return "Sem permissão — apenas Diretoria, Administrador ou CEO.";
  }

  const fromHeaders = resolveFromHeaders(token, req, { adminOnly: true });
  if (fromHeaders?.ok) return null;

  return "Sem permissão — apenas Diretoria, Administrador ou CEO.";
}

/** Qualquer usuário autenticado (bot-status popup). */
export async function assertAuthenticatedAccess(
  token: string,
  req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return "Não autorizado";
  const userId = extractUserIdFromToken(token);
  if (!userId) return "Não autorizado";

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.found && fromDb.active && fromDb.principal) return null;

  const fromHeaders = resolveFromHeaders(token, req, { adminOnly: false });
  if (fromHeaders?.ok) return null;

  return "Sessão inválida";
}

export function hasRole(principal: LitePrincipal, ...roles: string[]): boolean {
  const normalized = principal.role.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return roles.map((r) => r.toLowerCase()).includes(normalized)
    || roles.map((r) => r.toLowerCase()).includes(principal.role);
}

export function isWhatsappAdmin(principal: LitePrincipal): boolean {
  return canAccessWhatsapp(principal.role, []);
}
