/**
 * Transferência Pix Asaas — módulo leve para rotas serverless Vercel.
 * Evita importar o asaasService completo.
 */

import {
  ASAAS_PIX_FINANCEIRO_EMAIL,
  ASAAS_PIX_FINANCEIRO_KEY_TYPE,
  isValidPixTransferAmount,
  roundMoneyBrl,
} from '../lib/asaasPixTransfer.js';
import { formatAsaasTransferError } from '../lib/asaasTransferErrors.js';
import { invalidateAsaasBalancesCoreCache } from './asaasBalancesCore.js';

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
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
      throw new Error(formatAsaasTransferError(errMsg));
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

/** Transfere Pix para financeiro@grupotmseg.com.br mantendo reserva mínima na conta. */
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

  const result = await asaasRequest(apiKey, '/transfers', {
    method: 'POST',
    body: JSON.stringify({
      value,
      operationType: 'PIX',
      pixAddressKey: ASAAS_PIX_FINANCEIRO_EMAIL,
      pixAddressKeyType: ASAAS_PIX_FINANCEIRO_KEY_TYPE,
      description: params.description || `Repasse TM SEG — ${company}`,
    }),
  });

  invalidateAsaasBalancesCoreCache();
  return result;
}
