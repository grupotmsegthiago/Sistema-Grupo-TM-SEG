/**
 * Módulo leve para consulta de saldos Asaas (rotas serverless Vercel).
 * Evita importar o asaasService completo (~NF, clientes, etc.).
 */

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

export type AsaasBalanceRow = {
  company: string;
  name: string;
  balance: number;
  pendingBalance: number;
  error?: string;
};

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function companyConfigs(): Record<string, { apiKey: string; name: string }> {
  return {
    'TM GESTÃO': {
      apiKey: readEnv('ASAAS_API_KEY'),
      name: 'TM GESTÃO',
    },
    'TM SEGURANCA': {
      apiKey: readEnv('ASAAS_API_KEY_TMSECURITY', 'ASAAS_API_KEY_TM_SEGURANCA'),
      name: 'Tm Seguranca Consultoria & Tecnologia Integrada Ltda',
    },
    'TM SECURITY': {
      apiKey: readEnv('ASAAS_API_KEY_TMSECURITY_60', 'ASAAS_API_KEY_TM_SECURITY'),
      name: 'TM Security Gestão Corporativa Ltda',
    },
  };
}

async function fetchAsaasBalance(apiKey: string): Promise<{ balance: number; totalPending: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/finance/balance`, {
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
          error: 'API Key não configurada no servidor',
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
