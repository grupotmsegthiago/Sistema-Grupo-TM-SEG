import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';
import type {
  RhEmployeeBankAccount,
  SaveRhEmployeeBankAccountInput,
} from './employeeBankAccountsApiCore';

const ENDPOINT = '/api/rh/employees/bank-account';
const GENERIC_BANK_ERROR = 'Falha ao salvar dados bancários';

async function requireOk(response: Response): Promise<any> {
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(GENERIC_BANK_ERROR);
  }
  return payload;
}

export const employeeBankAccountsClient = {
  async get(employeeId: string): Promise<RhEmployeeBankAccount | null> {
    const response = await authFetch(
      `${ENDPOINT}?employeeId=${encodeURIComponent(employeeId)}`,
    );
    const payload = await requireOk(response);
    return payload?.bankAccount || null;
  },

  async create(
    input: SaveRhEmployeeBankAccountInput,
  ): Promise<RhEmployeeBankAccount> {
    const response = await authFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.bankAccount as RhEmployeeBankAccount;
  },

  async update(
    id: string,
    input: SaveRhEmployeeBankAccountInput,
  ): Promise<RhEmployeeBankAccount> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.bankAccount as RhEmployeeBankAccount;
  },
};
