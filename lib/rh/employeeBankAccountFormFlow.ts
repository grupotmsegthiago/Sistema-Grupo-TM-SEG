import { employeeBankAccountsClient } from './employeeBankAccountsClient';
import type {
  RhEmployeeBankAccount,
  SaveRhEmployeeBankAccountInput,
} from './employeeBankAccountsApiCore';

type EmployeeBankAccountsApi = {
  create: (
    input: SaveRhEmployeeBankAccountInput,
  ) => Promise<RhEmployeeBankAccount>;
  update: (
    id: string,
    input: SaveRhEmployeeBankAccountInput,
  ) => Promise<RhEmployeeBankAccount>;
};

export const GENERIC_BANK_SAVE_ERROR = 'Falha ao salvar dados bancários';

export async function saveEmployeeBankAccount(
  employeeId: string,
  bank: Record<string, any>,
  api: EmployeeBankAccountsApi = employeeBankAccountsClient,
): Promise<void> {
  const input: SaveRhEmployeeBankAccountInput = {
    employeeId,
    bankName: bank.bank_name,
    bankCode: bank.bank_code,
    agency: bank.agency,
    accountNumber: bank.account_number,
    accountType: bank.account_type,
    pixKey: bank.pix_key,
    beneficiaryName: bank.beneficiary_name,
    isPrimary: true,
  };

  try {
    if (bank.id) await api.update(bank.id, input);
    else await api.create(input);
  } catch {
    // Falha bancária não pode vazar detalhes nem permitir falso sucesso no formulário.
    throw new Error(GENERIC_BANK_SAVE_ERROR);
  }
}
