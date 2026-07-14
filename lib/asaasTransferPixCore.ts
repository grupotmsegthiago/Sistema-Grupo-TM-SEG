/**
 * Transferência Asaas — módulo leve para rotas serverless Vercel.
 * TM GESTÃO / TM SEGURANCA / TM SECURITY: Pix primeiro (repasse interno costuma falhar).
 */

import {
  ASAAS_PIX_FINANCEIRO_EMAIL,
  ASAAS_PIX_FINANCEIRO_KEY_TYPE,
  isValidPixTransferAmount,
  roundMoneyBrl,
} from './asaasPixTransfer.js';
import { buildAsaasTransferExternalReference } from './asaasTransferApproval.js';
import { formatAsaasTransferError } from './asaasTransferErrors.js';
import { getAsaasApiKeyTmGestao, getAsaasApiKeyTmSeguranca, getAsaasApiKeyTmSecurity, readFirstEnv } from './asaasEnvKeys.js';
import { registerAsaasPendingTransfer } from './services/asaasPendingTransferService.js';
import { invalidateAsaasBalancesCoreCache } from './asaasBalancesCore.js';

function asaasBaseUrl(): string {
  const custom = readFirstEnv('ASAAS_API_BASE_URL', 'ASAAS_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  const keySample = readFirstEnv(
    'ASAAS_TMGESTAO_API',
    'ASAAS_API_KEY',
    'TMSEGURANCA',
    'ASAAS_TMSEGURANCA_API',
    'ASAAS_TMSECURITY_API',
  );
  if (keySample.includes('_hmlg_') || keySample.includes('_sandbox_')) {
    return 'https://sandbox.asaas.com/api/v3';
  }
  return 'https://api.asaas.com/v3';
}
const DEFAULT_FINANCEIRO_WALLET_ID = '6641fec4-8476-48e3-90a8-3db6b14f538c';

function readEnv(...names: string[]): string {
  return readFirstEnv(...names);
}

function financeiroWalletId(): string {
  return readEnv('ASAAS_FINANCEIRO_WALLET_ID') || DEFAULT_FINANCEIRO_WALLET_ID;
}

function normalizeCompanyToken(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type AsaasCompanyDef = {
  key: string;
  aliases: string[];
  envHint: string;
  getApiKey: () => string;
};

/** Mesmas empresas dos cards de saldo — aliases espelham asaasService. */
const ASAAS_TRANSFER_COMPANIES: AsaasCompanyDef[] = [
  {
    key: 'TM GESTÃO',
    aliases: ['TM GESTÃO', 'TM GESTAO', 'GESTAO', 'GESTÃO', 'TMGESTAO'],
    envHint: 'Asaas_TMSEGESTÃO_API (ou ASAAS_TMGESTAO_API / TMGESTAO)',
    getApiKey: getAsaasApiKeyTmGestao,
  },
  {
    key: 'TM SEGURANCA',
    aliases: [
      'TM SEGURANCA',
      'TM SEGURANÇA',
      'TMSEGURANCA',
      'TMSEGURANÇA',
      'SEGURANCA',
      'SEGURANÇA',
      'TM SEGURANCA CONSULTORIA',
    ],
    envHint: 'TMSEGURANCA ou ASAAS_TMSEGURANCA_API',
    getApiKey: getAsaasApiKeyTmSeguranca,
  },
  {
    key: 'TM SECURITY',
    aliases: ['TM SECURITY', 'TMSECURITY', 'SECURITY', 'TM SECURITY GESTAO', 'TM SECURITY GESTÃO'],
    envHint: 'ASAAS_TMSECURITY_API (ou TMSECURITY)',
    getApiKey: getAsaasApiKeyTmSecurity,
  },
];

export function resolveAsaasTransferCompany(company: string): AsaasCompanyDef | null {
  const raw = String(company || '').trim();
  if (!raw) return null;
  const normalized = normalizeCompanyToken(raw);

  for (const def of ASAAS_TRANSFER_COMPANIES) {
    if (def.key === raw) return def;
    const aliasHit = def.aliases.some((alias) => normalizeCompanyToken(alias) === normalized);
    if (aliasHit) return def;
  }
  return null;
}

export function isKnownAsaasCompany(company: string): boolean {
  return resolveAsaasTransferCompany(company) !== null;
}

/**
 * Pix primeiro nas três contas operacionais (repasse interno costuma falhar sem vínculo).
 * Override: ASAAS_TRANSFER_PIX_FIRST=true|false.
 */
export function shouldPreferPixTransfer(companyKey: string): boolean {
  const explicit = readEnv('ASAAS_TRANSFER_PIX_FIRST');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return (
    companyKey === 'TM GESTÃO' ||
    companyKey === 'TM SEGURANCA' ||
    companyKey === 'TM SECURITY'
  );
}

async function asaasRequest(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${asaasBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    let data: any = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida do Asaas (${res.status})`);
      }
    }

    if (!res.ok) {
      const errMsg =
        data?.errors?.map((e: any) => e.description).join('; ') ||
        data?.message ||
        `HTTP ${res.status}`;
      throw new Error(`Asaas: ${errMsg}`);
    }

    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timeout ao comunicar com Asaas (25s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getBalance(apiKey: string): Promise<number> {
  const data = await asaasRequest(apiKey, '/finance/balance');
  return Number(data?.balance || 0);
}

async function registerPendingTransfer(
  result: any,
  company: string,
  value: number,
  mode: 'INTERNAL' | 'PIX',
  externalReference: string,
): Promise<void> {
  const transferId = String(result?.id || '').trim();
  if (!transferId) return;
  try {
    await registerAsaasPendingTransfer({
      transferId,
      company,
      value,
      mode,
      externalReference,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[asaasTransfer] falha ao registrar pendente:', message);
  }
}

async function createPixTransfer(
  apiKey: string,
  value: number,
  description: string,
  externalReference: string,
): Promise<any> {
  return asaasRequest(apiKey, '/transfers', {
    method: 'POST',
    body: JSON.stringify({
      value,
      operationType: 'PIX',
      pixAddressKey: ASAAS_PIX_FINANCEIRO_EMAIL,
      pixAddressKeyType: ASAAS_PIX_FINANCEIRO_KEY_TYPE,
      description,
      externalReference,
    }),
  });
}

async function createInternalTransfer(
  apiKey: string,
  value: number,
  walletId: string,
  description: string,
  externalReference: string,
): Promise<any> {
  return asaasRequest(apiKey, '/transfers', {
    method: 'POST',
    body: JSON.stringify({ value, walletId, description, externalReference }),
  });
}

/** Repasse para conta financeiro TM SEG (Pix ou interna Asaas). */
export async function transferPixFromCompanyCore(params: {
  company: string;
  value: number;
  description?: string;
}): Promise<any> {
  const resolved = resolveAsaasTransferCompany(params.company);
  if (!resolved) {
    throw new Error('Empresa Asaas inválida ou API Key não configurada no servidor.');
  }

  const company = resolved.key;
  const apiKey = resolved.getApiKey();
  if (!apiKey) {
    throw new Error(
      `API Key Asaas não configurada para ${company}. Na Vercel, preencha ${resolved.envHint} ` +
        '(mesma chave de produção do painel Asaas, com permissão de saque via API) e faça redeploy.',
    );
  }

  const balance = await getBalance(apiKey);
  const value = roundMoneyBrl(params.value);
  const check = isValidPixTransferAmount(value, balance);
  if (!check.ok) throw new Error(check.error);

  const description = params.description || `Repasse TM SEG — ${company}`;
  const externalReference = buildAsaasTransferExternalReference(company);
  const walletId = financeiroWalletId();
  const pixFirst = shouldPreferPixTransfer(company);
  const skipInternal = readEnv('ASAAS_SKIP_INTERNAL_TRANSFER') === 'true';

  let pixError: string | null = null;
  let internalError: string | null = null;

  const attemptPix = async () => {
    const result = await createPixTransfer(apiKey, value, description, externalReference);
    await registerPendingTransfer(result, company, value, 'PIX', externalReference);
    invalidateAsaasBalancesCoreCache();
    return { ...result, transferMode: 'PIX' as const };
  };

  const attemptInternal = async () => {
    if (!walletId) throw new Error('Wallet financeiro não configurado.');
    const result = await createInternalTransfer(
      apiKey,
      value,
      walletId,
      description,
      externalReference,
    );
    await registerPendingTransfer(result, company, value, 'INTERNAL', externalReference);
    invalidateAsaasBalancesCoreCache();
    return { ...result, transferMode: 'INTERNAL' as const, destinationWalletId: walletId };
  };

  if (pixFirst) {
    try {
      return await attemptPix();
    } catch (e: unknown) {
      pixError = e instanceof Error ? e.message : String(e);
      console.warn('[asaasTransfer] Pix falhou:', pixError);
    }
    if (!skipInternal && walletId) {
      try {
        return await attemptInternal();
      } catch (e: unknown) {
        internalError = e instanceof Error ? e.message : String(e);
        console.warn('[asaasTransfer] repasse interno falhou:', internalError);
      }
    }
  } else {
    if (!skipInternal && walletId) {
      try {
        return await attemptInternal();
      } catch (e: unknown) {
        internalError = e instanceof Error ? e.message : String(e);
        console.warn('[asaasTransfer] repasse interno falhou:', internalError);
      }
    }
    try {
      return await attemptPix();
    } catch (e: unknown) {
      pixError = e instanceof Error ? e.message : String(e);
    }
  }

  const combined = [internalError ? `Repasse interno: ${internalError}` : null, pixError ? `Pix: ${pixError}` : null]
    .filter(Boolean)
    .join('. ');
  throw new Error(formatAsaasTransferError(combined || 'Falha na transferência'));
}
