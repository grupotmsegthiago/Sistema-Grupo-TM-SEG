/**
 * Handler do segundo piloto da RH API Foundation.
 * GET/POST/PATCH /api/rh/employees/bank-account.
 */
import {
  createRhEmployeeBankAccountsOps,
  type SaveRhEmployeeBankAccountInput,
} from '../lib/rh/employeeBankAccountsApiCore.js';
import {
  authorizeRhApiRequest,
  createRhServiceRoleClient,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

type BankAccountsOps = ReturnType<typeof createRhEmployeeBankAccountsOps>;
const GENERIC_OPERATION_ERROR = 'Falha ao operar dados bancários';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RhEmployeeBankAccountHandlerDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  createOps?: () => BankAccountsOps | null;
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
  if (body[key] == null) return null;
  return String(body[key]);
}

function bankInput(body: Record<string, unknown>): SaveRhEmployeeBankAccountInput {
  return {
    employeeId: String(body.employeeId || '').trim(),
    bankName: optionalString(body, 'bankName'),
    bankCode: optionalString(body, 'bankCode'),
    agency: optionalString(body, 'agency'),
    accountNumber: optionalString(body, 'accountNumber'),
    accountType: optionalString(body, 'accountType'),
    pixKey: optionalString(body, 'pixKey'),
    beneficiaryName: optionalString(body, 'beneficiaryName'),
    // O formulário legado sempre grava a conta editada/criada como principal.
    isPrimary: true,
  };
}

function createDefaultOps(): BankAccountsOps | null {
  const client = createRhServiceRoleClient();
  return client ? createRhEmployeeBankAccountsOps(client) : null;
}

export async function handleRhEmployeeBankAccountRequest(
  req: any,
  res: any,
  deps: RhEmployeeBankAccountHandlerDeps = {},
) {
  if (!['GET', 'POST', 'PATCH'].includes(String(req.method || ''))) {
    res.setHeader('Allow', 'GET, POST, PATCH');
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
    res.status(503).json({ error: 'Supabase admin indisponível' });
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
      const account = await ops.get(employeeId);
      res.status(200).json({ ok: true, bankAccount: account });
      return;
    }

    const body = parseBody(req.body);
    const input = bankInput(body);
    if (!input.employeeId || (!input.bankName && !input.pixKey)) {
      res.status(400).json({
        error: 'employeeId e banco ou PIX são obrigatórios',
      });
      return;
    }
    if (!isUuid(input.employeeId)) {
      res.status(400).json({ error: 'employeeId inválido' });
      return;
    }

    if (req.method === 'POST') {
      const account = await ops.create(input);
      res.status(201).json({ ok: true, bankAccount: account });
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
    const account = await ops.update(id, input);
    res.status(200).json({ ok: true, bankAccount: account });
  } catch (error: any) {
    if (error?.message === 'payload_inválido') {
      res.status(400).json({ error: 'payload_inválido' });
      return;
    }
    console.error('[rh-employee-bank-account]', error);
    res.status(500).json({ error: GENERIC_OPERATION_ERROR });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhEmployeeBankAccountRequest(req, res);
}
