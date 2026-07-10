import {
  extractUserIdFromToken,
  resolveUserRoleFromToken,
} from '../rh/apiEmployeesAuth';

export function roleCanGenerateDhlOccurrenceReport(
  role: string | null | undefined,
  _userName?: string | null,
): boolean {
  return String(role || '').trim().toLowerCase() === 'diretoria';
}

export function extractAuthToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  return String(raw || '').replace(/^Bearer\s+/i, '').trim();
}

/** Retorna null se autorizado; mensagem de erro se negado. */
export async function assertDhlOccurrenceReportAccess(token: string): Promise<string | null> {
  if (!token) return 'Não autorizado';

  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Não autorizado';

  const role = await resolveUserRoleFromToken(token);
  const directorName = await resolveDirectorNameFromToken(token);
  if (!roleCanGenerateDhlOccurrenceReport(role, directorName)) {
    return 'Permissão negada — apenas Diretoria pode gerar este relatório';
  }

  return null;
}

export async function resolveDirectorNameFromToken(token: string): Promise<string> {
  const userId = extractUserIdFromToken(token);
  if (!userId) return 'Diretoria — Grupo TM SEG';

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    if (!url || !key) return 'Diretoria — Grupo TM SEG';

    const sb = createClient(url, key.trim());
    const { data } = await sb.from('system_users').select('name').eq('id', userId).maybeSingle();
    return data?.name ? String(data.name) : 'Diretoria — Grupo TM SEG';
  } catch {
    return 'Diretoria — Grupo TM SEG';
  }
}
