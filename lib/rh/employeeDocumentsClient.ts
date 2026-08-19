import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';
import type {
  CreateRhEmployeeDocumentInput,
  RhEmployeeDocument,
} from './employeeDocumentsApiCore';

const ENDPOINT = '/api/rh/employees/documents';

async function requireOk(response: Response): Promise<any> {
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || `Falha na API RH (${response.status})`);
  }
  return payload;
}

export const employeeDocumentsClient = {
  async list(employeeId: string): Promise<RhEmployeeDocument[]> {
    const response = await authFetch(
      `${ENDPOINT}?employeeId=${encodeURIComponent(employeeId)}`,
    );
    const payload = await requireOk(response);
    return Array.isArray(payload?.documents) ? payload.documents : [];
  },

  async create(input: CreateRhEmployeeDocumentInput): Promise<RhEmployeeDocument> {
    const response = await authFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.document as RhEmployeeDocument;
  },

  async remove(id: string): Promise<void> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await requireOk(response);
  },
};
