/**
 * GET /api/support-agents — handler leve (rewrite vercel.json).
 * Express /api/index em produção costuma estourar timeout; esta rota
 * precisa de função serverless própria, sem nova entrada em `functions`.
 */
import { extractAuthToken } from '../lib/rh/apiEmployeesAuth.js';
import { handleSupportAgentsList } from '../lib/supportAgents/handleSupportAgentsList.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const token = extractAuthToken(req);
    const status = String(req.query?.status || '');
    const result = await handleSupportAgentsList(token, status);
    res.status(result.status).json(result.body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Falha ao listar agentes da Rede de Apoio';
    res.status(500).json({
      ok: false,
      agents: [],
      total: 0,
      completeness: 'ERRO',
      error: message,
    });
  }
}

export const config = { maxDuration: 60 };
