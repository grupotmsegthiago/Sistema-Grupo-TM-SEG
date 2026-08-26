export type RhEmployeeBankAccount = {
  id: string;
  employee_id: string;
  bank_name?: string | null;
  bank_code?: string | null;
  agency?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  pix_key?: string | null;
  beneficiary_name?: string | null;
  is_primary?: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SaveRhEmployeeBankAccountInput = {
  employeeId: string;
  bankName?: string | null;
  bankCode?: string | null;
  agency?: string | null;
  accountNumber?: string | null;
  accountType?: string | null;
  pixKey?: string | null;
  beneficiaryName?: string | null;
  isPrimary?: boolean;
};

export type RhEmployeeBankAccountsClient = {
  from: (table: string) => any;
};

function toRow(input: SaveRhEmployeeBankAccountInput) {
  const row: Record<string, string | boolean | null> = {
    employee_id: input.employeeId,
    is_primary: input.isPrimary ?? true,
  };
  const fields = [
    ['bank_name', input.bankName],
    ['bank_code', input.bankCode],
    ['agency', input.agency],
    ['account_number', input.accountNumber],
    ['account_type', input.accountType],
    ['pix_key', input.pixKey],
    ['beneficiary_name', input.beneficiaryName],
  ] as const;
  fields.forEach(([key, value]) => {
    if (value !== undefined) row[key] = value;
  });
  return row;
}

/** SSOT backend das operações existentes no segundo piloto RH bancário. */
export function createRhEmployeeBankAccountsOps(client: RhEmployeeBankAccountsClient) {
  return {
    async get(employeeId: string): Promise<RhEmployeeBankAccount | null> {
      const { data, error } = await client
        .from('rh_employee_bank_accounts')
        .select('*')
        .eq('employee_id', employeeId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as RhEmployeeBankAccount | null;
    },

    async create(
      input: SaveRhEmployeeBankAccountInput,
    ): Promise<RhEmployeeBankAccount> {
      const { data, error } = await client
        .from('rh_employee_bank_accounts')
        .insert([toRow(input)])
        .select('*')
        .single();
      if (error) throw error;
      return data as RhEmployeeBankAccount;
    },

    async update(
      id: string,
      input: SaveRhEmployeeBankAccountInput,
    ): Promise<RhEmployeeBankAccount> {
      const { data, error } = await client
        .from('rh_employee_bank_accounts')
        .update(toRow(input))
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as RhEmployeeBankAccount;
    },
  };
}
