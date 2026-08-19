/**
 * Handler leve do piloto F4-RH-API-FOUNDATION.
 * GET/POST/DELETE /api/rh/employees/documents.
 */
import {
  createRhEmployeeDocumentsOps,
  type CreateRhEmployeeDocumentInput,
} from '../lib/rh/employeeDocumentsApiCore.js';
import {
  authorizeRhApiRequest,
  createRhServiceRoleClient,
  type RhApiAccessResult,
} from '../lib/rh/rhApiAccess.js';

type DocumentsOps = ReturnType<typeof createRhEmployeeDocumentsOps>;

export type RhEmployeeDocumentsHandlerDeps = {
  authorize?: (req: any) => Promise<RhApiAccessResult>;
  createOps?: () => DocumentsOps | null;
};

function queryValue(req: any, key: string): string {
  const raw = req?.query?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return (body as Record<string, unknown>) || {};
  if (!body.trim()) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error('payload_inválido');
  }
}

function createDefaultOps(): DocumentsOps | null {
  const client = createRhServiceRoleClient();
  return client ? createRhEmployeeDocumentsOps(client) : null;
}

export async function handleRhEmployeeDocumentsRequest(
  req: any,
  res: any,
  deps: RhEmployeeDocumentsHandlerDeps = {},
) {
  if (!['GET', 'POST', 'DELETE'].includes(String(req.method || ''))) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const authorization = await (deps.authorize || authorizeRhApiRequest)(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const ops = deps.createOps ? deps.createOps() : createDefaultOps();
  if (!ops) {
    res.status(503).json({ error: 'Supabase admin indisponível' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    if (req.method === 'GET') {
      const employeeId = queryValue(req, 'employeeId');
      if (!employeeId) {
        res.status(400).json({ error: 'employeeId é obrigatório' });
        return;
      }
      const documents = await ops.list(employeeId);
      res.status(200).json({ ok: true, documents });
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const input: CreateRhEmployeeDocumentInput = {
        employeeId: String(body.employeeId || '').trim(),
        docType: String(body.docType || '').trim(),
        fileName: String(body.fileName || '').trim(),
        fileUrl: String(body.fileUrl || '').trim(),
        mimeType: String(body.mimeType || ''),
        notes: body.notes == null ? null : String(body.notes),
      };
      if (!input.employeeId || !input.docType || !input.fileName || !input.fileUrl) {
        res.status(400).json({
          error: 'employeeId, docType, fileName e fileUrl são obrigatórios',
        });
        return;
      }
      const document = await ops.create(input, authorization.principal);
      res.status(201).json({ ok: true, document });
      return;
    }

    const body = parseBody(req.body);
    const id = queryValue(req, 'id') || String(body.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'id é obrigatório' });
      return;
    }
    await ops.remove(id, authorization.principal);
    res.status(200).json({ ok: true });
  } catch (error: any) {
    const message = error?.message || 'Falha ao operar documentos do funcionário';
    if (message === 'payload_inválido') {
      res.status(400).json({ error: message });
      return;
    }
    console.error('[rh-employee-documents]', message);
    res.status(500).json({ error: message });
  }
}

export default async function handler(req: any, res: any) {
  await handleRhEmployeeDocumentsRequest(req, res);
}
