import { parseJsonBody } from '../lib/email/missionEmailHelpers.js';
import { handlePasswordResetValidate } from '../lib/passwordReset.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const result = await handlePasswordResetValidate(parseJsonBody(req.body));
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[password-reset/validate]', e?.message);
    res.status(500).json({ error: e?.message || 'Erro ao validar token' });
  }
}
