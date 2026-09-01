/**
 * Handler específico do quarto piloto da RH API Foundation.
 * GET/POST/PATCH/DELETE /api/rh/employees/warnings.
 */
import {
  createRhWarningsOps,
  type SaveRhWarningInput,
} from '../lib/rh/warningsApiCore.js';
import {
  authorizeRhApiRequest,
  createRhServiceRoleClient,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

type WarningsOps = ReturnType<typeof createRhWarningsOps>;
const GENERIC_OPERATION_ERROR = 'Falha ao operar advertências';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RhEmployeeWarningsHandlerDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  createOps?: () => WarningsOps | null;
};

function queryValue(req: any, key: string): string {
  const raw = req?.query?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return (body as Record<string, unknown>) || {};
  if (!body.trim()) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error('payload_inválido');
  }
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in body)) return undefined;
  if (body[key] == null || body[key] === '') return null;
  return String(body[key]);
}

function warningInput(body: Record<string, unknown>): SaveRhWarningInput {
  const warningDate = String(body.warningDate || body.warning_date || '').trim()
    || new Date().toISOString().slice(0, 10);
  return {
    employeeId: String(body.employeeId || '').trim(),
    warningDate,
    warningType: String(body.warningType || body.warning_type || '').trim(),
    reason: String(body.reason || '').trim(),
    responsible: optionalString(body, 'responsible'),
  };
}

function createDefaultOps(): WarningsOps | null {
  const client = createRhServiceRoleClient();
  return client ? createRhWarningsOps(client) : null;
}

export async function handleRhEmployeeWarningsRequest(
  req: any,
  res: any,
  deps: RhEmployeeWarningsHandlerDeps = {},
) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(String(req.method || ''))) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const authorization = await (deps.authorize || authorizeRhApiRequest)(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const ops = deps.createOps ? deps.createOps() : createDefaultOps();
  if (!ops) {
    res.status(503).json({ error: 'Serviço RH indisponível' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    if (req.method === 'GET') {
      const employeeId = queryValue(req, 'employeeId');
      if (!employeeId) {
        res.status(400).json({ error: 'employeeId é obrigatório' });
        return;
      }
      if (!isUuid(employeeId)) {
        res.status(400).json({ error: 'employeeId inválido' });
        return;
      }
      const warnings = await ops.list(employeeId);
      res.status(200).json({ ok: true, warnings });
      return;
    }

    if (req.method === 'DELETE') {
      const body = parseBody(req.body);
      const id = queryValue(req, 'id') || String(body.id || '').trim();
      if (!id) {
        res.status(400).json({ error: 'id é obrigatório' });
        return;
      }
      if (!isUuid(id)) {
        res.status(400).json({ error: 'id inválido' });
        return;
      }
      await ops.remove(id, authorization.principal);
      res.status(200).json({ ok: true });
      return;
    }

    const body = parseBody(req.body);
    const input = warningInput(body);
    if (!input.employeeId || !input.warningType || !input.reason) {
      res.status(400).json({
        error: 'employeeId, warningType e reason são obrigatórios',
      });
      return;
    }
    if (!isUuid(input.employeeId)) {
      res.status(400).json({ error: 'employeeId inválido' });
      return;
    }

    if (req.method === 'POST') {
      const warning = await ops.create(input, authorization.principal);
      res.status(201).json({ ok: true, warning });
      return;
    }

    const id = queryValue(req, 'id') || String(body.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'id é obrigatório' });
      return;
    }
    if (!isUuid(id)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }
    const warning = await ops.update(id, input, authorization.principal);
    res.status(200).json({ ok: true, warning });
  } catch (error: any) {
    if (error?.message === 'payload_inválido') {
      res.status(400).json({ error: 'payload_inválido' });
      return;
    }
    console.error('[rh-employee-warnings]', error);
    res.status(500).json({ error: GENERIC_OPERATION_ERROR });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhEmployeeWarningsRequest(req, res);
}
