import { authToken, parseJsonBody } from '../lib/email/missionEmailHelpers.js';
import { handleMissionScheduled } from '../lib/email/missionEmailHandlers.js';

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
    const result = await handleMissionScheduled(parseJsonBody(req.body));
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error('[email/mission-scheduled]', e?.message);
    res.status(500).json({ error: e?.message || 'Erro ao enviar e-mail' });
  }
}
