import { assertAsaasApiAccess, extractAuthToken } from '../lib/asaasApiAuth.js';
import {
  isKnownAsaasCompany,
  transferPixFromCompanyCore,
} from '../server/asaasTransferPixCore.js';

/** Repasse Pix Asaas → financeiro@grupotmseg.com.br (reserva R$ 100 por conta). */
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const token = extractAuthToken(req);
    const denied = await assertAsaasApiAccess(token, req);
    if (denied) {
      res.status(denied === 'Não autorizado' ? 401 : 403).json({ ok: false, error: denied });
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

    const transfer = await transferPixFromCompanyCore({
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
    if (!res.headersSent) {
      res.status(400).json({ ok: false, error: e?.message || 'Falha na transferência Pix' });
    }
  }
}

export const config = { maxDuration: 60 };
