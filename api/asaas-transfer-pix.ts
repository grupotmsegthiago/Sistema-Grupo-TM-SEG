import { extractUserIdFromToken, resolveUserRoleFromToken } from '../lib/rh/apiEmployeesAuth.js';
import { isKnownAsaasCompany, transferPixFromCompany } from '../server/asaasService.js';

const ALLOWED_ROLES = new Set(['administrador', 'diretoria', 'financeiro', 'ceo']);

function authToken(req: any): string {
  return (
    String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.headers?.['x-auth-token'] || '')
  );
}

/** Repasse Pix Asaas → financeiro@grupotmseg.com.br (reserva R$ 100 por conta). */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const token = authToken(req);
  const userId = extractUserIdFromToken(token);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return;
  }

  const role = await resolveUserRoleFromToken(token);
  if (!role || !ALLOWED_ROLES.has(role)) {
    res.status(403).json({ ok: false, error: 'Permissão negada' });
    return;
  }

  const body = req.body || {};
  const company = String(body.company || '').trim();
  const value = Number(body.value);

  if (!company || !isKnownAsaasCompany(company)) {
    res.status(400).json({ ok: false, error: 'Empresa Asaas inválida.' });
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    res.status(400).json({ ok: false, error: 'Valor inválido.' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const transfer = await transferPixFromCompany({
      company,
      value,
      description: body.description ? String(body.description) : undefined,
    });
    res.status(200).json({
      success: true,
      transfer,
      message: 'Transferência Pix solicitada com sucesso.',
    });
  } catch (e: any) {
    console.error('[asaas-transfer-pix]', e?.message || e);
    res.status(400).json({ ok: false, error: e?.message || 'Falha na transferência Pix' });
  }
}

export const config = { maxDuration: 60 };
