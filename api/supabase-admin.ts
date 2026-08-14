/**
 * Handler Vercel leve para as seis rotas /api/supabase/* (NB-07).
 * Rewrites específicos definem `op`; regras e consultas ficam em lib/.
 */
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from '../lib/supabaseAdmin.js';
import {
  authorizeSupabaseAdminRequest,
  SUPABASE_DIAGNOSTIC_ROLES,
  SUPABASE_INIT_INVOICES_ROLES,
  type SupabaseAdminAuthResult,
} from '../lib/supabaseAdminApiAuth.js';
import {
  executeSupabaseAdminOperation,
  getSupabaseBillingLinks,
  type SupabaseAdminOperation,
} from '../lib/supabaseAdminOperations.js';

export const config = { maxDuration: 30 };

const OPERATIONS: Record<
  SupabaseAdminOperation,
  { method: 'GET' | 'POST'; roles: readonly string[] }
> = {
  'init-invoices': { method: 'POST', roles: SUPABASE_INIT_INVOICES_ROLES },
  status: { method: 'GET', roles: SUPABASE_DIAGNOSTIC_ROLES },
  'db-metrics': { method: 'GET', roles: SUPABASE_DIAGNOSTIC_ROLES },
  'storage-usage': { method: 'GET', roles: SUPABASE_DIAGNOSTIC_ROLES },
  'billing-links': { method: 'GET', roles: SUPABASE_DIAGNOSTIC_ROLES },
  'health-check': { method: 'GET', roles: SUPABASE_DIAGNOSTIC_ROLES },
};

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function isOperation(value: string): value is SupabaseAdminOperation {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, value);
}

type HandlerDependencies = {
  authorize: (
    req: any,
    roles: readonly string[],
  ) => Promise<SupabaseAdminAuthResult>;
  createAdmin: typeof createSupabaseAdminClient;
  execute: typeof executeSupabaseAdminOperation;
};

const DEFAULT_DEPENDENCIES: HandlerDependencies = {
  authorize: authorizeSupabaseAdminRequest,
  createAdmin: createSupabaseAdminClient,
  execute: executeSupabaseAdminOperation,
};

export async function handleSupabaseAdminRequest(
  req: any,
  res: any,
  dependencies: HandlerDependencies = DEFAULT_DEPENDENCIES,
) {
  const op = queryValue(req.query?.op);
  if (!isOperation(op)) {
    res.status(404).json({ error: 'operation_not_found' });
    return;
  }

  const spec = OPERATIONS[op];
  if (String(req.method || '').toUpperCase() !== spec.method) {
    res.setHeader('Allow', spec.method);
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const auth = await dependencies.authorize(req, spec.roles);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (op === 'billing-links') {
      res.status(200).json(getSupabaseBillingLinks());
      return;
    }

    const supabase = dependencies.createAdmin();
    if (!supabase) {
      res.status(503).json({ error: 'Supabase admin indisponível' });
      return;
    }

    const result = await dependencies.execute(op, supabase, {
      supabaseUrl: getSupabaseUrl(),
      anonKey: getSupabaseAnonKey(),
    });

    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  return handleSupabaseAdminRequest(req, res);
}
