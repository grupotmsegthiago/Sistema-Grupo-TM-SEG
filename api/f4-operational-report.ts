import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  authorizeF4ApiRequest,
  F4_OPERATIONAL_REPORT_WRITE_ROLES,
} from '../lib/auth/f4ApiAccess.js';
import { canAccessF4MissionScope } from '../lib/auth/f4ClientScope.js';
import { resolvePrincipalFromToken } from '../lib/auth/resolvePrincipal.js';
import { runF4OperationalReportOperation } from '../lib/f4ApiOperations.js';
import {
  f4QueryValue,
  sendF4MethodNotAllowed,
  sendF4Result,
  type F4Request,
  type F4Response,
} from '../lib/f4HandlerUtils.js';

type Dependencies = {
  authorize: typeof authorizeF4ApiRequest;
  resolvePrincipal: typeof resolvePrincipalFromToken;
  createAdmin: typeof createSupabaseAdminClient;
  canAccessMission: typeof canAccessF4MissionScope;
  runOperation: typeof runF4OperationalReportOperation;
};

const defaults: Dependencies = {
  authorize: authorizeF4ApiRequest,
  resolvePrincipal: resolvePrincipalFromToken,
  createAdmin: createSupabaseAdminClient,
  canAccessMission: canAccessF4MissionScope,
  runOperation: runF4OperationalReportOperation,
};

export async function handleF4OperationalReportRequest(
  req: F4Request,
  res: F4Response,
  deps: Dependencies = defaults,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    sendF4MethodNotAllowed(res, 'GET, PATCH');
    return;
  }

  const allowedRoles =
    req.method === 'PATCH' ? F4_OPERATIONAL_REPORT_WRITE_ROLES : ['*'];
  const auth = await deps.authorize(req, allowedRoles, deps.resolvePrincipal);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const missionId = f4QueryValue(req, 'missionId');
  if (!missionId) {
    res.status(400).json({ error: 'missionId obrigatório' });
    return;
  }

  const admin = deps.createAdmin();
  if (!admin) {
    res.status(503).json({ error: 'Supabase admin indisponível' });
    return;
  }

  if (
    req.method === 'GET'
    && !(await deps.canAccessMission(admin, auth.principal, missionId))
  ) {
    res.status(403).json({ error: 'Acesso negado a esta missão' });
    return;
  }

  sendF4Result(
    res,
    await deps.runOperation(req.method, missionId, req.body, admin),
  );
}

export default async function handler(req: F4Request, res: F4Response) {
  await handleF4OperationalReportRequest(req, res);
}
