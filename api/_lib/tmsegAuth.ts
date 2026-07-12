/** Auth mínimo para handlers serverless leves (sem Express). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://ajhmmjuewdsukecaimik.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk";

export type LitePrincipal = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export function readBearer(req: any): string {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim()
    || String(req.headers?.["x-auth-token"] || "").trim();
}

export function extractUserIdFromToken(token: string): string | null {
  const match = token.match(/(?:tmseg-token|impersonation-token)-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

export function supabaseLite(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_ANON_KEY,
  );
  return createClient(url.includes("ajhmmjuewdsukecaimik") ? url : DEFAULT_SUPABASE_URL, key);
}

export async function resolveLitePrincipal(token: string): Promise<LitePrincipal | null> {
  if (!token) return null;
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  const sb = supabaseLite();
  const { data } = await sb
    .from("system_users")
    .select("id, name, email, status, profiles:profile_id ( name )")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.status !== "Ativo") return null;
  return {
    id: String(data.id),
    name: (data as any).name || null,
    email: (data as any).email || null,
    role: String((data as any).profiles?.name || "").toLowerCase(),
  };
}

export function hasRole(principal: LitePrincipal, ...roles: string[]): boolean {
  return roles.map((r) => r.toLowerCase()).includes(principal.role);
}
