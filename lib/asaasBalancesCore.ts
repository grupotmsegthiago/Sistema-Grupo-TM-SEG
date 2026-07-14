/**
 * Módulo leve para consulta de saldos Asaas (rotas serverless Vercel).
 * Evita importar o asaasService completo (~NF, clientes, etc.).
 */

import { getAsaasApiKeyTmGestao, getAsaasApiKeyTmSeguranca, getAsaasApiKeyTmSecurity, readFirstEnv } from './asaasEnvKeys.js';

function asaasBaseUrl(): string {
  const custom = readFirstEnv('ASAAS_API_BASE_URL', 'ASAAS_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  const keySample = readFirstEnv('ASAAS_TMGESTAO_API', 'ASAAS_API_KEY', 'TMSEGURANCA', 'ASAAS_TMSEGURANCA_API');
  if (keySample.includes('_hmlg_') || keySample.includes('_sandbox_')) {
    return 'https://sandbox.asaas.com/api/v3';
  }
  return 'https://api.asaas.com/v3';
}

function formatAsaasHttpError(status: number, data: any): string {
  if (status === 401 || status === 403) {
    return 'Chave API Asaas inválida ou expirada — confira na Vercel (produção: $aact_prod_...)';
  }
  if (status === 301 || status === 302) {
    return 'Asaas redirecionou a requisição — chave de sandbox em URL de produção (ou vice-versa)';
  }
  const parts = (data?.errors || []).map((e: { description?: string; code?: string }) => {
    const desc = String(e?.description || e?.code || '').trim();
    const code = e?.code ? ` (${e.code})` : '';
    return desc ? `${desc}${code}` : '';
  }).filter(Boolean);
  if (parts.length) return `Asaas: ${parts.join('; ')}`;
  const msg = String(data?.message || '').trim();
  if (msg) return `Asaas: ${msg}`;
  return `Asaas HTTP ${status}`;
}

export type AsaasBalanceRow = {
  company: string;
  name: string;
  balance: number;
  pendingBalance: number;
  error?: string;
};

function readEnv(...names: string[]): string {
  return readFirstEnv(...names);
}

function companyConfigs(): Record<string, { apiKey: string; name: string }> {
  return {
    'TM GESTÃO': {
      apiKey: getAsaasApiKeyTmGestao(),
      name: 'TM GESTÃO',
    },
    'TM SEGURANCA': {
      apiKey: getAsaasApiKeyTmSeguranca(),
      name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda',
    },
    'TM SECURITY': {
      apiKey: getAsaasApiKeyTmSecurity(),
      name: 'TM Security Gestão Corporativa Ltda',
    },
  };
}

async function fetchAsaasBalance(apiKey: string): Promise<{ balance: number; totalPending: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${asaasBaseUrl()}/finance/balance`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
      },
    });

    const text = await res.text();
    let data: any = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        if (res.status === 301 || res.status === 302) {
          throw new Error(formatAsaasHttpError(res.status, {}));
        }
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        throw new Error(
          snippet
            ? `Resposta inválida do Asaas (${res.status}): ${snippet}`
            : `Resposta inválida do Asaas (${res.status})`,
        );
      }
    }

    if (!res.ok) {
      throw new Error(formatAsaasHttpError(res.status, data));
    }

    return {
      balance: Number(data.balance || 0),
      totalPending: Number(data.totalPending || 0),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timeout ao consultar Asaas (12s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let cachedBalances: { data: AsaasBalanceRow[]; ts: number } | null = null;
const BALANCE_CACHE_MS = 90_000;

export function invalidateAsaasBalancesCoreCache(): void {
  cachedBalances = null;
}

export async function getAllBalancesCore(): Promise<AsaasBalanceRow[]> {
  if (cachedBalances && Date.now() - cachedBalances.ts < BALANCE_CACHE_MS) {
    return cachedBalances.data;
  }

  const companies = companyConfigs();
  const results = await Promise.all(
    Object.entries(companies).map(async ([company, cfg]) => {
      if (!cfg.apiKey) {
        return {
          company,
          name: cfg.name,
          balance: 0,
          pendingBalance: 0,
          error: 'Chave API não configurada na Vercel (ASAAS_TMGESTAO_API / ASAAS_TMSEGURANCA_API / ASAAS_API_KEY_TMSECURITY_60)',
        };
      }
      try {
        const data = await fetchAsaasBalance(cfg.apiKey);
        return {
          company,
          name: cfg.name,
          balance: data.balance,
          pendingBalance: data.totalPending,
        };
      } catch (err: any) {
        return {
          company,
          name: cfg.name,
          balance: 0,
          pendingBalance: 0,
          error: err?.message || 'Falha ao consultar saldo',
        };
      }
    }),
  );

  cachedBalances = { data: results, ts: Date.now() };
  return results;
}

export function isAsaasBalancesConfigured(): boolean {
  return Object.values(companyConfigs()).some((c) => !!c.apiKey);
}
