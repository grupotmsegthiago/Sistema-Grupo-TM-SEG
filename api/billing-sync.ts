export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const { extractAuthToken } = await import('../lib/services/systemAccess.js');
    const { safeResolveUserRoleFromToken } = await import('../lib/rh/apiEmployeesAuth.js');
    const token = extractAuthToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: 'Não autorizado' });
      return;
    }
    const role = await safeResolveUserRoleFromToken(token);
    const allowed = new Set(['diretoria', 'administrador', 'ceo']);
    if (!role || !allowed.has(role.toLowerCase())) {
      res.status(403).json({ ok: false, error: 'Permissão negada' });
      return;
    }

    const { syncBillingUsage } = await import('../lib/billing/billingService.js');
    const result = await syncBillingUsage();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: message });
  }
}

export const config = { maxDuration: 120 };
