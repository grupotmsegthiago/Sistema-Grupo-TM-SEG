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
    const { diagnosticoIntegracoes } = await import('../server/integracoesDiagnostics.js');
    const semOpcionais = String(req.query?.semOpcionais || req.query?.core || '') === '1'
      || String(req.query?.semOpcionais || '').toLowerCase() === 'true';

    const result = await diagnosticoIntegracoes({
      incluirOpcionais: !semOpcionais,
    });

    res.status(result.overall === 'down' ? 503 : 200).json({
      ok: result.overall !== 'down',
      ...result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[system-diagnostics]', message);
    res.status(500).json({ ok: false, error: message || 'Falha no diagnóstico de integrações' });
  }
}

export const config = { maxDuration: 120 };
