import { createRequire } from 'node:module';
import { parseJsonBody } from '../lib/email/missionEmailHelpers.js';

const require = createRequire(import.meta.url);
const { handlePasswordResetValidate } = require('./_password-reset-core.cjs') as {
  handlePasswordResetValidate: (body: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
};

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
