/**
 * GET /api/support-agents — handler leve (rewrite vercel.json).
 * Uma página por request (from/to). O browser monta o universo.
 */
import { extractAuthToken } from '../lib/rh/apiEmployeesAuth.js';
import { handleSupportAgentsList } from '../lib/supportAgents/handleSupportAgentsList.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const token = extractAuthToken(req);
    const result = await handleSupportAgentsList(
      token,
      req.query?.status,
      req.query?.from,
      req.query?.to,
    );
    res.status(result.status).json(result.body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Falha ao listar agentes da Rede de Apoio';
    console.error('[support-agents]', message);
    res.status(500).json({
      ok: false,
      agents: [],
      total: 0,
      hasMore: false,
      completeness: 'ERRO',
      error: message,
    });
  }
}

export const config = { maxDuration: 60 };
