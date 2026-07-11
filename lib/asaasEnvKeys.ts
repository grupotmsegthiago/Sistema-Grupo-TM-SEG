/** Lê a primeira variável de ambiente não vazia (ordem = prioridade). */
export function readFirstEnv(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

/** Asaas — TM Segurança (Consultoria). Preferir `TMSEGURANCA` na Vercel. */
export function getAsaasApiKeyTmSeguranca(): string {
  return readFirstEnv(
    'TMSEGURANCA',
    'TMSEGURANÇA',
    'ASAAS_API_KEY_TMSECURITY',
    'ASAAS_API_KEY_TM_SEGURANCA',
  );
}

/** Asaas — TM Security (Gestão Corporativa — CNPJ distinto). */
export function getAsaasApiKeyTmSecurity(): string {
  return readFirstEnv(
    'ASAAS_API_KEY_TMSECURITY_60',
    'ASAAS_API_KEY_TM_SECURITY',
  );
}

export type AsaasKeyEnvSummary = {
  configured: boolean;
  length: number;
  sandbox: boolean;
  production: boolean;
  sourceEnv: string | null;
};

const TM_SEGURANCA_ENV_NAMES = [
  'TMSEGURANCA',
  'TMSEGURANÇA',
  'ASAAS_API_KEY_TMSECURITY',
  'ASAAS_API_KEY_TM_SEGURANCA',
] as const;

/** Metadados da chave (sem expor o valor) — útil para comparar Vercel vs Replit. */
export function summarizeAsaasKeyEnv(names: readonly string[]): AsaasKeyEnvSummary {
  let sourceEnv: string | null = null;
  let value = '';
  for (const name of names) {
    const v = String(process.env[name] || '').trim();
    if (v) {
      sourceEnv = name;
      value = v;
      break;
    }
  }
  const lower = value.toLowerCase();
  return {
    configured: Boolean(value),
    length: value.length,
    sandbox: lower.includes('_hmlg_') || lower.includes('_sandbox_'),
    production: lower.includes('_prod_') || lower.startsWith('$aact_prod'),
    sourceEnv,
  };
}

export function summarizeAsaasTransferEnv(): {
  tmGestao: AsaasKeyEnvSummary;
  tmSeguranca: AsaasKeyEnvSummary;
  tmSecurity: AsaasKeyEnvSummary;
  financeiroWalletId: string;
  transferPixFirst: boolean;
  skipInternalTransfer: boolean;
} {
  return {
    tmGestao: summarizeAsaasKeyEnv(['ASAAS_API_KEY']),
    tmSeguranca: summarizeAsaasKeyEnv(TM_SEGURANCA_ENV_NAMES),
    tmSecurity: summarizeAsaasKeyEnv(['ASAAS_API_KEY_TMSECURITY_60', 'ASAAS_API_KEY_TM_SECURITY']),
    financeiroWalletId:
      String(process.env.ASAAS_FINANCEIRO_WALLET_ID || '').trim() ||
      '6641fec4-8476-48e3-90a8-3db6b14f538c',
    transferPixFirst: readFirstEnv('ASAAS_TRANSFER_PIX_FIRST') === 'true',
    skipInternalTransfer: readFirstEnv('ASAAS_SKIP_INTERNAL_TRANSFER') === 'true',
  };
}
