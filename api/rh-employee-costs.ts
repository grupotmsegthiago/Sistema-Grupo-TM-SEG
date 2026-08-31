/**
 * GET /api/rh/employees/cost-summary — handler leve (rewrite vercel.json).
 * Usa a RH API Foundation: principal confiável + service_role fail-closed.
 */
import {
  authorizeRhApiRequest,
  createRhServiceRoleClient,
  type RhApiAccessDeps,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

export type RhEmployeeCostsDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  accessDeps?: RhApiAccessDeps;
  load?: (month: string) => Promise<unknown>;
};

export async function handleRhEmployeeCostsRequest(
  req: any,
  res: any,
  deps: RhEmployeeCostsDeps = {},
) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const authorization = await (
    deps.authorize
    || ((request: any) => authorizeRhApiRequest(request, deps.accessDeps))
  )(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ ok: false, error: authorization.error });
    return;
  }

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const month = String(req.query?.month || new Date().toISOString().slice(0, 7));
    let result: unknown;
    if (deps.load) {
      result = await deps.load(month);
    } else {
      const sb = createRhServiceRoleClient();
      if (!sb) {
        res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
        return;
      }
      const { loadEmployeeCostSummary } = await import('../lib/rh/loadEmployeeCostSummary.js');
      result = await loadEmployeeCostSummary(sb, month);
    }
    res.status(200).json(result);
  } catch (e: any) {
    console.error('[rh-employees-cost-summary]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao calcular custos' });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhEmployeeCostsRequest(req, res);
}

export const config = { maxDuration: 60 };
