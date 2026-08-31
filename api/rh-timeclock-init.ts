import { ensureTimeClockAndLinkCltUsers } from '../lib/timeclock/ensureTimeClock.js';
import {
  authorizeRhApiRequest,
  type RhApiAccessDeps,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

export type RhTimeclockInitDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  accessDeps?: RhApiAccessDeps;
  ensure?: typeof ensureTimeClockAndLinkCltUsers;
};

type RhTimeclockInitResult = Awaited<
  ReturnType<typeof ensureTimeClockAndLinkCltUsers>
>;

let initInFlight: Promise<RhTimeclockInitResult> | null = null;

function ensureTimeClockOnce(
  ensure: typeof ensureTimeClockAndLinkCltUsers,
): Promise<RhTimeclockInitResult> {
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

export async function handleRhTimeclockInitRequest(
  req: any,
  res: any,
  deps: RhTimeclockInitDeps = {},
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
    const result = await ensureTimeClockOnce(
      deps.ensure || ensureTimeClockAndLinkCltUsers,
    );
    if (result.method === 'unavailable') {
      res.status(500).json({
        ok: false,
        error:
          'Falha ao preparar ponto CLT. Execute migrations/2026_07_08_timeclock_fix_user_id.sql no Supabase SQL Editor ou node scripts/link-clt-system-users.mjs',
      });
      return;
    }
    res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[rh-timeclock-init]', e?.message);
    res.status(500).json({ ok: false, error: e?.message || 'Falha ao preparar ponto CLT' });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhTimeclockInitRequest(req, res);
}

export const config = { maxDuration: 120 };
