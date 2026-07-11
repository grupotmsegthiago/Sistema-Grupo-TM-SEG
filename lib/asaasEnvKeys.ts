/** Lê a primeira variável de ambiente não vazia (ordem = prioridade). */
import { createHash } from 'node:crypto';

export function sanitizeAsaasEnvValue(raw: unknown): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n\u200b\u200c\u200d]/g, '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

export function readFirstEnv(...names: string[]): string {
  for (const name of names) {
    const value = sanitizeAsaasEnvValue(process.env[name]);
    if (value) return value;
  }
  return '';
}

export function fingerprintAsaasKey(value: string): string {
  if (!value) return '';
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/** Asaas — TM Segurança (Consultoria). Preferir `TMSEGURANCA` na Vercel. */
export function getAsaasApiKeyTmSeguranca(): string {
  return readFirstEnv(
    'TMSEGURANCA',
    'ASAAS_TMSEGURANCA_API',
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
  fingerprint: string;
  balanceProbe?: { ok: boolean; balance?: number; error?: string };
};

const TM_SEGURANCA_ENV_NAMES = [
  'TMSEGURANCA',
  'ASAAS_TMSEGURANCA_API',
  'TMSEGURANÇA',
  'ASAAS_API_KEY_TMSECURITY',
  'ASAAS_API_KEY_TM_SEGURANCA',
] as const;

/** Metadados da chave (sem expor o valor) — útil para comparar Vercel vs Replit. */
export async function summarizeAsaasKeyEnv(
  names: readonly string[],
  probeBalance = false,
): Promise<AsaasKeyEnvSummary> {
  let sourceEnv: string | null = null;
  let value = '';
  for (const name of names) {
    const v = sanitizeAsaasEnvValue(process.env[name]);
    if (v) {
      sourceEnv = name;
      value = v;
      break;
    }
  }
  const lower = value.toLowerCase();
  const summary: AsaasKeyEnvSummary = {
    configured: Boolean(value),
    length: value.length,
    sandbox: lower.includes('_hmlg_') || lower.includes('_sandbox_'),
    production: lower.includes('_prod_') || lower.startsWith('$aact_prod'),
    sourceEnv,
    fingerprint: fingerprintAsaasKey(value),
  };

  if (probeBalance && value) {
    try {
      const base =
        summary.sandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
      const res = await fetch(`${base}/finance/balance`, {
        headers: { access_token: value, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        summary.balanceProbe = { ok: true, balance: Number(data.balance || 0) };
      } else {
        const err =
          data?.errors?.map((e: { description?: string }) => e.description).join('; ') ||
          data?.message ||
          `HTTP ${res.status}`;
        summary.balanceProbe = { ok: false, error: err };
      }
    } catch (e: unknown) {
      summary.balanceProbe = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return summary;
}

export async function summarizeAsaasTransferEnv(probeBalance = false): Promise<{
  tmGestao: AsaasKeyEnvSummary;
  tmSeguranca: AsaasKeyEnvSummary;
  tmSecurity: AsaasKeyEnvSummary;
  financeiroWalletId: string;
  transferPixFirst: boolean;
  skipInternalTransfer: boolean;
}> {
  return {
    tmGestao: await summarizeAsaasKeyEnv(['ASAAS_API_KEY'], probeBalance),
    tmSeguranca: await summarizeAsaasKeyEnv(TM_SEGURANCA_ENV_NAMES, probeBalance),
    tmSecurity: await summarizeAsaasKeyEnv(
      ['ASAAS_API_KEY_TMSECURITY_60', 'ASAAS_API_KEY_TM_SECURITY'],
      probeBalance,
    ),
    financeiroWalletId:
      sanitizeAsaasEnvValue(process.env.ASAAS_FINANCEIRO_WALLET_ID) ||
      '6641fec4-8476-48e3-90a8-3db6b14f538c',
    transferPixFirst: readFirstEnv('ASAAS_TRANSFER_PIX_FIRST') === 'true',
    skipInternalTransfer: readFirstEnv('ASAAS_SKIP_INTERNAL_TRANSFER') === 'true',
  };
}
