/**
 * Status Asaas leve (sem cold start do Express).
 * GET /api/asaas/status
 * GET /api/asaas/status?probe=1  → testa saldo com a chave (sem expor o valor)
 */
import {
  getAsaasApiKeyTmGestao,
  getAsaasApiKeyTmSeguranca,
  getAsaasApiKeyTmSecurity,
  summarizeAsaasTransferEnv,
  type AsaasKeyEnvSummary,
} from '../lib/asaasEnvKeys.js';

export const config = { maxDuration: 30 };

async function probeInvoicesApi(apiKey: string, sandbox: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey) return { ok: false, error: 'sem chave' };
  const base = sandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
  try {
    const res = await fetch(`${base}/invoices?limit=1`, {
      headers: { access_token: apiKey, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    const err =
      data?.errors?.map((e: { description?: string }) => e.description).join('; ') ||
      data?.message ||
      `HTTP ${res.status}`;
    return { ok: false, error: err };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function keyShapeHint(summary: AsaasKeyEnvSummary, invoicesOk?: boolean): string | null {
  if (!summary.configured) return 'ausente na Vercel';
  if (summary.length < 40) {
    return `valor curto demais (len=${summary.length}) — chave Asaas costuma ter 100+ chars ($aact_prod_...)`;
  }
  if (!summary.production && !summary.sandbox) {
    return 'não parece $aact_prod_ / sandbox — confira se colou a chave completa (cuidado com $ no início)';
  }
  if (summary.balanceProbe && !summary.balanceProbe.ok) {
    return 'Asaas rejeitou a chave no saldo (401/erro) — regenere no painel Asaas e atualize na Vercel';
  }
  if (invoicesOk === false) {
    return 'Saldo OK, mas GET /invoices falhou — permissão/NF da conta Asaas ou chave sem escopo fiscal';
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const companies = {
    tmGestao: Boolean(getAsaasApiKeyTmGestao()),
    tmSeguranca: Boolean(getAsaasApiKeyTmSeguranca()),
    tmSecurity: Boolean(getAsaasApiKeyTmSecurity()),
  };
  const configured = companies.tmGestao || companies.tmSeguranca || companies.tmSecurity;

  const probeRaw = String(req.query?.probe ?? req.query?.diagnose ?? '').trim();
  const wantProbe = probeRaw === '1' || probeRaw.toLowerCase() === 'true';

  if (!wantProbe) {
    res.status(200).json({
      ok: true,
      configured,
      companies,
      hint: 'Use ?probe=1 para testar se as chaves são aceitas pelo Asaas (sem expor o valor).',
    });
    return;
  }

  const env = await summarizeAsaasTransferEnv(true);
  const [invGestao, invSeg, invSec] = await Promise.all([
    probeInvoicesApi(getAsaasApiKeyTmGestao(), env.tmGestao.sandbox),
    probeInvoicesApi(getAsaasApiKeyTmSeguranca(), env.tmSeguranca.sandbox),
    probeInvoicesApi(getAsaasApiKeyTmSecurity(), env.tmSecurity.sandbox),
  ]);

  const report = {
    tmGestao: {
      ...env.tmGestao,
      invoicesProbe: invGestao,
      hint: keyShapeHint(env.tmGestao, invGestao.ok),
    },
    tmSeguranca: {
      ...env.tmSeguranca,
      invoicesProbe: invSeg,
      hint: keyShapeHint(env.tmSeguranca, invSeg.ok),
    },
    tmSecurity: {
      ...env.tmSecurity,
      invoicesProbe: invSec,
      hint: keyShapeHint(env.tmSecurity, invSec.ok),
    },
  };

  const allOk =
    !!report.tmGestao.balanceProbe?.ok &&
    !!report.tmSeguranca.balanceProbe?.ok &&
    !!report.tmSecurity.balanceProbe?.ok &&
    invGestao.ok &&
    invSeg.ok &&
    invSec.ok;

  res.status(200).json({
    ok: allOk,
    configured,
    companies,
    probed: true,
    keys: report,
    fix:
      'Vercel → Project → Settings → Environment Variables → edite ASAAS_TMGESTAO_API / ASAAS_TMSEGURANCA_API / ASAAS_TMSECURITY_API com a chave de produção do painel Asaas ($aact_prod_...) e faça Redeploy.',
  });
}
