/**
 * GET|PUT /api/patrimonio/equipments — leve (sem Express).
 * Evita FUNCTION_INVOCATION_TIMEOUT e ERR_MODULE_NOT_FOUND da tela de Patrimônio.
 */
import { assertAuthenticatedAccess, readBearer, resolveLitePrincipal } from '../../lib/tmsegAuth.js';
import { createSupabaseAdminClient } from '../../lib/supabaseAdmin.js';
import { loadPatrimonioLite, savePatrimonioLite } from '../../lib/patrimonioLiteApi.js';
import type { EquipmentRecord } from '../../lib/equipmentRecovery.js';

type LiteReq = {
  method?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
};

type LiteRes = {
  status: (n: number) => { json: (b: unknown) => void };
  setHeader: (k: string, v: string) => void;
};

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

export default async function handler(req: LiteReq, res: LiteRes) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'PUT') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const token = readBearer(req);
  const denied = await assertAuthenticatedAccess(token, req);
  if (denied) {
    res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
    return;
  }
  if (!(await resolveLitePrincipal(token, req))) {
    res.status(403).json({ ok: false, error: 'Sessão inválida' });
    return;
  }

  const sb = createSupabaseAdminClient();
  if (!sb) {
    res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
    return;
  }

  try {
    if (method === 'GET') {
      const data = await loadPatrimonioLite(sb);
      res.status(200).json({ ok: true, ...data });
      return;
    }

    const body = parseBody(req.body);
    const equipments = (Array.isArray(body.equipments) ? body.equipments : []) as EquipmentRecord[];
    const customTypes = (Array.isArray(body.customTypes) ? body.customTypes : []) as {
      value: string;
      label: string;
    }[];
    await savePatrimonioLite(sb, equipments, customTypes, 'app');
    res.status(200).json({ ok: true, count: equipments.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const missingTable = /does not exist|não existem|Could not find the table/i.test(message);
    res.status(missingTable ? 503 : 500).json({
      ok: false,
      error: missingTable
        ? 'Tabelas patrimonio_* ausentes. Rode scripts/patrimonio-dedicated-tables.sql no Supabase.'
        : message || 'Falha no patrimônio',
    });
  }
}

export const config = { maxDuration: 30 };
