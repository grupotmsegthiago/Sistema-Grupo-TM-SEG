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

/** Repasse para conta financeiro TM SEG (interna Asaas ou Pix). */
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
  let internalError: string | null = null;

  if (walletId) {
    try {
      const result = await asaasRequest(apiKey, '/transfers', {
        method: 'POST',
        body: JSON.stringify({ value, walletId, description, externalReference }),
      });
      invalidateAsaasBalancesCoreCache();
      return { ...result, transferMode: 'INTERNAL', destinationWalletId: walletId };
    } catch (e: unknown) {
      internalError = e instanceof Error ? e.message : String(e);
      console.warn('[asaasTransfer] repasse interno falhou:', internalError);
    }
  }

  try {
    const result = await asaasRequest(apiKey, '/transfers', {
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
    invalidateAsaasBalancesCoreCache();
    return { ...result, transferMode: 'PIX' };
  } catch (e: unknown) {
    const pixError = e instanceof Error ? e.message : String(e);
    const combined = internalError
      ? `Repasse interno: ${internalError}. Pix: ${pixError}`
      : pixError;
    throw new Error(formatAsaasTransferError(combined));
  }
}
