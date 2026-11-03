import { createRequire } from 'node:module';
import { authToken, parseJsonBody } from '../lib/email/missionEmailHelpers.js';

const require = createRequire(import.meta.url);
// Bundle CJS do build. Import de lib/passwordReset.js quebrava na Vercel
// (FUNCTION_INVOCATION_FAILED / ERR_MODULE_NOT_FOUND) por import sem extensão.
const { handlePasswordResetRequest } = require('./_password-reset-core.cjs') as {
  handlePasswordResetRequest: (body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authToken(req)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  try {
    const result = await handlePasswordResetRequest(parseJsonBody(req.body));
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[password-reset/request]', e?.message);
    res.status(500).json({ error: e?.message || 'Erro ao enviar e-mail' });
  }
}
