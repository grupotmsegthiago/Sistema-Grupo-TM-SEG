import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  authorizeF4ApiRequest,
  F4_ADMIN_ROLES,
} from '../lib/auth/f4ApiAccess.js';
import { resolvePrincipalFromToken } from '../lib/auth/resolvePrincipal.js';
import { runF4PlatformCostsOperation } from '../lib/f4ApiOperations.js';
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
  runOperation: typeof runF4PlatformCostsOperation;
};

const defaults: Dependencies = {
  authorize: authorizeF4ApiRequest,
  resolvePrincipal: resolvePrincipalFromToken,
  createAdmin: createSupabaseAdminClient,
  runOperation: runF4PlatformCostsOperation,
};

export async function handleF4PlatformCostsRequest(
  req: F4Request,
  res: F4Response,
  deps: Dependencies = defaults,
): Promise<void> {
  const op = f4QueryValue(req, 'op');
  const expectedMethod = op === 'costs' ? 'GET' : op === 'overrides' ? 'POST' : '';
  if (!expectedMethod) {
    res.status(404).json({ error: 'Operação não encontrada' });
    return;
  }
  if (req.method !== expectedMethod) {
    sendF4MethodNotAllowed(res, expectedMethod);
    return;
  }

  const auth = await deps.authorize(req, F4_ADMIN_ROLES, deps.resolvePrincipal);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const admin = deps.createAdmin();
  if (!admin) {
    res.status(503).json({ error: 'Supabase admin indisponível' });
    return;
  }

  sendF4Result(
    res,
    await deps.runOperation(op as 'costs' | 'overrides', req.body, admin),
  );
}

export default async function handler(req: F4Request, res: F4Response) {
  await handleF4PlatformCostsRequest(req, res);
}
