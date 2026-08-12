/**
 * POST /api/migration/add-mission-columns — handler leve (sem Express / api/index).
 * Retorna SQL para execução manual; NÃO executa migration.
 */
import { assertMigrationAdminAccess } from '../lib/migrationApiAuth.js';
import { ADD_MISSION_COLUMNS_RESPONSE } from '../lib/migrationEndpointPayloads.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const denied = await assertMigrationAdminAccess(req);
  if (denied) {
    const status = denied === 'Não autorizado' ? 401 : 403;
    res.status(status).json({ error: denied });
    return;
  }

  res.status(200).json(ADD_MISSION_COLUMNS_RESPONSE);
}

export const config = { maxDuration: 30 };
