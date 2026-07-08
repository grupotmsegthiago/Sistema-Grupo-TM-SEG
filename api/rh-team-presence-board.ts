import { extractAuthToken, assertSystemDiagnosticsAccess } from '../lib/services/systemAccess.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = extractAuthToken(req);
  const denied = await assertSystemDiagnosticsAccess(token);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const { createRhAdminClient } = await import('../lib/rh/adminSupabase.js');
    const { loadTeamPresenceBoardData } = await import('../lib/services/teamPresenceBoardService.js');
    const sb = createRhAdminClient();
    const payload = await loadTeamPresenceBoardData(sb);
    res.status(200).json({ ok: true, ...payload });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[rh-team-presence-board]', message);
    res.status(500).json({ ok: false, error: message || 'Falha ao carregar quadro de presença' });
  }
}

export const config = { maxDuration: 60 };
