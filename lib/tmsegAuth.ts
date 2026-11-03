/** Auth mínimo para handlers serverless leves (sem Express). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { usuarioIdDoToken } from "./sessao/token.js";

const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";
const TMSEG_REF = "ajhmmjuewdsukecaimik";

const WHATSAPP_ADMIN_ROLES = new Set(["diretoria", "administrador", "ceo", "admin"]);
const FINANCE_NF_ROLES = new Set(["diretoria", "administrador", "financeiro", "admin"]);

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

function canAccessFinanceNf(role: string, permissions: string[]): boolean {
  const normalized = normalizeRole(role);
  if (FINANCE_NF_ROLES.has(normalized)) return true;
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
  return usuarioIdDoToken(token);
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
  financeOk: boolean;
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
    return { found: false, active: false, adminOk: false, financeOk: false, principal: null };
  }
  if (!data) return { found: false, active: false, adminOk: false, financeOk: false, principal: null };

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
    financeOk: active && canAccessFinanceNf(role, permissions),
    principal: active ? principal : null,
  };
}

export async function resolveLitePrincipal(token: string, _req?: { headers?: ReqHeaders }): Promise<LitePrincipal | null> {
  if (!token) return null;
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;

  const fromDb = await resolveFromDatabase(userId);
  return fromDb.principal;
}

/** Retorna null se autorizado; mensagem se negado. */
export async function assertWhatsappAdminAccess(
  token: string,
  _req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return "Não autorizado";
  const userId = extractUserIdFromToken(token);
  if (!userId) return "Não autorizado";

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.adminOk && fromDb.principal) return null;
  if (fromDb.found && fromDb.active && !fromDb.adminOk) {
    return "Sem permissão — apenas Diretoria, Administrador ou CEO.";
  }

  return "Sem permissão — apenas Diretoria, Administrador ou CEO.";
}

/** Qualquer usuário autenticado (bot-status popup). */
export async function assertAuthenticatedAccess(
  token: string,
  _req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return "Não autorizado";
  const userId = extractUserIdFromToken(token);
  if (!userId) return "Não autorizado";

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.found && fromDb.active && fromDb.principal) return null;

  return "Sessão inválida";
}

/** Controle de Faturas / NF — espelha requireRole(administrador, diretoria, financeiro). */
export async function assertFinanceNfAccess(
  token: string,
  _req?: { headers?: ReqHeaders },
): Promise<string | null> {
  if (!token) return "Não autorizado";
  const userId = extractUserIdFromToken(token);
  if (!userId) return "Não autorizado";

  const fromDb = await resolveFromDatabase(userId);
  if (fromDb.financeOk && fromDb.principal) return null;
  if (fromDb.found && fromDb.active && !fromDb.financeOk) {
    return "Sem permissão — apenas Diretoria, Administrador ou Financeiro.";
  }

  return "Sem permissão — apenas Diretoria, Administrador ou Financeiro.";
}

export function hasRole(principal: LitePrincipal, ...roles: string[]): boolean {
  const normalized = principal.role.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return roles.map((r) => r.toLowerCase()).includes(normalized)
    || roles.map((r) => r.toLowerCase()).includes(principal.role);
}

export function isWhatsappAdmin(principal: LitePrincipal): boolean {
  return canAccessWhatsapp(principal.role, []);
}
