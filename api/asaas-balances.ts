import { extractUserIdFromToken, resolveUserRoleFromToken } from '../lib/rh/apiEmployeesAuth.js';
import { getAllBalances } from '../server/asaasService.js';

const ALLOWED_ROLES = new Set(['administrador', 'diretoria', 'financeiro', 'ceo']);

function authToken(req: any): string {
  return (
    String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.headers?.['x-auth-token'] || '')
  );
}

/** Saldos Asaas (TM Gestão, TM Seg, TM Security) — rota leve sem cold start do Express. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  const userId = extractUserIdFromToken(token);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  const role = await resolveUserRoleFromToken(token);
  if (!role || !ALLOWED_ROLES.has(role)) {
    res.status(403).json({ ok: false, error: 'Permissão negada' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const balances = await getAllBalances();
    res.status(200).json({ success: true, balances });
  } catch (e: any) {
    console.error('[asaas-balances]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao consultar saldos Asaas' });
  }
}

export const config = { maxDuration: 60 };
