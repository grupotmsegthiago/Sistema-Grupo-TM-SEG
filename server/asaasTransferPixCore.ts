/**
 * Transferência Asaas — módulo leve para rotas serverless Vercel.
 * Tenta repasse interno (walletId) antes de Pix externo.
 */

import {
  ASAAS_PIX_FINANCEIRO_EMAIL,
  ASAAS_PIX_FINANCEIRO_KEY_TYPE,
  isValidPixTransferAmount,
  roundMoneyBrl,
} from '../lib/asaasPixTransfer.js';
import { buildAsaasTransferExternalReference } from '../lib/asaasTransferApproval.js';
import { formatAsaasTransferError } from '../lib/asaasTransferErrors.js';
import { registerAsaasPendingTransfer } from '../lib/services/asaasPendingTransferService.js';
import { invalidateAsaasBalancesCoreCache } from './asaasBalancesCore.js';

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';
const DEFAULT_FINANCEIRO_WALLET_ID = '6641fec4-8476-48e3-90a8-3db6b14f538c';

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function financeiroWalletId(): string {
  return readEnv('ASAAS_FINANCEIRO_WALLET_ID') || DEFAULT_FINANCEIRO_WALLET_ID;
}

function companyApiKeys(): Record<string, string> {
  return {
    'TM GESTÃO': readEnv('ASAAS_API_KEY'),
    'TM SEGURANCA': readEnv('ASAAS_API_KEY_TMSECURITY', 'ASAAS_API_KEY_TM_SEGURANCA'),
    'TM SECURITY': readEnv('ASAAS_API_KEY_TMSECURITY_60', 'ASAAS_API_KEY_TM_SECURITY'),
  };
}

export function isKnownAsaasCompany(company: string): boolean {
  return Object.prototype.hasOwnProperty.call(companyApiKeys(), String(company || '').trim());
}

async function asaasRequest(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
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
  const company = String(params.company || '').trim();
  const apiKey = companyApiKeys()[company];
  if (!apiKey) {
    throw new Error('Empresa Asaas inválida ou API Key não configurada no servidor.');
  }

  const balance = await getBalance(apiKey);
  const value = roundMoneyBrl(params.value);
  const check = isValidPixTransferAmount(value, balance);
  if (!check.ok) throw new Error(check.error);

  const description = params.description || `Repasse TM SEG — ${company}`;
  const externalReference = buildAsaasTransferExternalReference(company);
  const walletId = financeiroWalletId();
  const pixFirst = readEnv('ASAAS_TRANSFER_PIX_FIRST') === 'true';
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
