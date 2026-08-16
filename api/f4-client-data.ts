import { createSupabaseAdminClient } from '../lib/supabaseAdmin.js';
import {
  authorizeF4ApiRequest,
  canAccessF4ClientScope,
  F4_ADMIN_ROLES,
} from '../lib/auth/f4ApiAccess.js';
import { canAccessF4MissionScope } from '../lib/auth/f4ClientScope.js';
import { resolvePrincipalFromToken } from '../lib/auth/resolvePrincipal.js';
import {
  runF4ClientDataOperation,
  type F4ClientDataOp,
} from '../lib/f4ApiOperations.js';
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
  canAccessClient: typeof canAccessF4ClientScope;
  canAccessMission: typeof canAccessF4MissionScope;
  runOperation: typeof runF4ClientDataOperation;
};

const defaults: Dependencies = {
  authorize: authorizeF4ApiRequest,
  resolvePrincipal: resolvePrincipalFromToken,
  createAdmin: createSupabaseAdminClient,
  canAccessClient: canAccessF4ClientScope,
  canAccessMission: canAccessF4MissionScope,
  runOperation: runF4ClientDataOperation,
};

const METHODS: Record<F4ClientDataOp, string> = {
  'registries-init': 'POST',
  'registries-list': 'GET',
  registries: 'POST',
  'registries-item': 'DELETE',
  'notes-item': 'GET',
  notes: 'POST',
  'notes-bulk': 'GET',
};

export async function handleF4ClientDataRequest(
  req: F4Request,
  res: F4Response,
  deps: Dependencies = defaults,
): Promise<void> {
  const op = f4QueryValue(req, 'op') as F4ClientDataOp;
  const expectedMethod = METHODS[op];
  if (!expectedMethod) {
    res.status(404).json({ error: 'Operação não encontrada' });
    return;
  }
  if (req.method !== expectedMethod) {
    sendF4MethodNotAllowed(res, expectedMethod);
    return;
  }

  const adminOnly = op === 'registries-init' || op === 'registries-item';
  const auth = await deps.authorize(
    req,
    adminOnly ? F4_ADMIN_ROLES : ['*'],
    deps.resolvePrincipal,
  );
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const input: Record<string, any> = { body: req.body };
  if (op === 'registries-list') {
    input.clientId = f4QueryValue(req, 'clientId');
    input.type = f4QueryValue(req, 'type');
    if (!input.clientId || !input.type) {
      res.status(400).json({ error: 'Campos obrigatórios' });
      return;
    }
    if (!deps.canAccessClient(auth.principal, input.clientId)) {
      res.status(403).json({ error: 'Acesso negado aos dados deste cliente' });
      return;
    }
  } else if (op === 'registries') {
    const body = (req.body || {}) as any;
    if (!body.client_id || !body.type || !body.name) {
      res.status(400).json({ error: 'Campos obrigatórios' });
      return;
    }
    if (!deps.canAccessClient(auth.principal, body.client_id)) {
      res.status(403).json({ error: 'Acesso negado aos dados deste cliente' });
      return;
    }
  } else if (op === 'registries-item') {
    input.id = f4QueryValue(req, 'id');
    if (!input.id) {
      res.status(400).json({ error: 'id obrigatório' });
      return;
    }
  } else if (op === 'notes-bulk') {
    input.clientId = f4QueryValue(req, 'clientId');
    if (!input.clientId) {
      res.status(400).json({ error: 'clientId obrigatório' });
      return;
    }
    if (!deps.canAccessClient(auth.principal, input.clientId)) {
      res.status(403).json({ error: 'Acesso negado aos dados deste cliente' });
      return;
    }
  } else if (op === 'notes-item') {
    input.missionId = f4QueryValue(req, 'missionId');
    if (!input.missionId) {
      res.status(400).json({ error: 'missionId obrigatório' });
      return;
    }
  } else if (op === 'notes') {
    const body = (req.body || {}) as any;
    if (!body.mission_id || !body.client_id) {
      res.status(400).json({ error: 'Campos obrigatórios' });
      return;
    }
  }

  const admin = deps.createAdmin();
  if (!admin) {
    res.status(503).json({ error: 'Supabase admin indisponível' });
    return;
  }

  if (
    op === 'notes-item'
    && !(await deps.canAccessMission(admin, auth.principal, input.missionId))
  ) {
    res.status(403).json({ error: 'Acesso negado a esta missão' });
    return;
  }
  if (
    op === 'notes'
    && !(await deps.canAccessMission(
      admin,
      auth.principal,
      (req.body as any).mission_id,
      (req.body as any).client_id,
    ))
  ) {
    res.status(403).json({ error: 'Acesso negado a esta missão/cliente' });
    return;
  }

  sendF4Result(res, await deps.runOperation(op, input, admin));
}

export default async function handler(req: F4Request, res: F4Response) {
  await handleF4ClientDataRequest(req, res);
}
