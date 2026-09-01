import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';
import type {
  RhWarning,
  SaveRhWarningInput,
} from './warningsApiCore';

const ENDPOINT = '/api/rh/employees/warnings';
export const GENERIC_WARNING_ERROR = 'Falha ao operar advertências';

async function requireOk(response: Response): Promise<any> {
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(GENERIC_WARNING_ERROR);
  }
  return payload;
}

export const warningsClient = {
  async list(employeeId: string): Promise<RhWarning[]> {
    const response = await authFetch(
      `${ENDPOINT}?employeeId=${encodeURIComponent(employeeId)}`,
    );
    const payload = await requireOk(response);
    return (payload?.warnings || []) as RhWarning[];
  },

  async create(input: SaveRhWarningInput): Promise<RhWarning> {
    const response = await authFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.warning as RhWarning;
  },

  async update(
    id: string,
    input: SaveRhWarningInput,
  ): Promise<RhWarning> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.warning as RhWarning;
  },

  async remove(id: string): Promise<void> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await requireOk(response);
  },
};
