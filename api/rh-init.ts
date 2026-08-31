import { ensureRhTables } from '../lib/rh/ensureRhTables.js';
import {
  authorizeRhApiRequest,
  type RhApiAccessDeps,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

export type RhInitDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  accessDeps?: RhApiAccessDeps;
  ensure?: typeof ensureRhTables;
};

type RhInitResult = Awaited<ReturnType<typeof ensureRhTables>>;

let initInFlight: Promise<RhInitResult> | null = null;

function ensureRhTablesOnce(ensure: typeof ensureRhTables): Promise<RhInitResult> {
  if (initInFlight) return initInFlight;

  const current = Promise.resolve().then(() => ensure());
  initInFlight = current;
  void current.then(
    () => {
      if (initInFlight === current) initInFlight = null;
    },
    () => {
      if (initInFlight === current) initInFlight = null;
    },
  );
  return current;
}

export async function handleRhInitRequest(
  req: any,
  res: any,
  deps: RhInitDeps = {},
) {
  const authorization = await (
    deps.authorize
    || ((request: any) => authorizeRhApiRequest(request, deps.accessDeps))
  )(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const result = await ensureRhTablesOnce(deps.ensure || ensureRhTables);
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[rh-init]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao criar tabelas RH' });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhInitRequest(req, res);
}

export const config = { maxDuration: 120 };
