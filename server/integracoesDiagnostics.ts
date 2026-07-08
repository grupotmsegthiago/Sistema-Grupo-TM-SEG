/**
 * Diagnóstico centralizado de integrações externas (somente leitura).
 * Reutiliza serviços existentes em server/ — não altera APIs em produção.
 */
import { createSupabaseAdminClient, getSupabaseAnonKey, getSupabaseUrl } from './supabaseConfig';
import { isAsaasConfigured, getAllBalances } from './asaasService';
import {
  isPlugNotasConfigured,
  getPlugNotasEnv,
  testPlugNotasConnection,
} from './plugnotasService';
import { isGeminiConfigured, pingGeminiHealth } from './geminiClient';
import { runEmailHealthCheck } from './emailHealth';
import { pingMetaWhatsApp, isMetaWhatsAppConfigured } from './metaWhatsAppConfig';
import { zapiFetch, isZapiConfigured } from './zapiClient';
import { fetchQualpToll } from '../lib/toll/qualpToll';

// ── Arquivos analisados para cobertura do diagnóstico ───────────────────────
export const ARQUIVOS_ANALISADOS = [
  'server/supabaseConfig.ts',
  'lib/supabase.ts',
  'lib/resolveSupabasePublicConfig.ts',
  'lib/rh/adminSupabase.ts',
  'server/asaasService.ts',
  'server/plugnotasService.ts',
  'server/nfProviderRouter.ts',
  'server/geminiClient.ts',
  'api/gemini/health.ts',
  'lib/gemini.ts',
  'server/emailHealth.ts',
  'server/emailService.ts',
  'server/metaWhatsAppConfig.ts',
  'server/zapiClient.ts',
  'server/whatsapp/zapiHttp.ts',
  'server/whatsapp/providerRegistry.ts',
  'server/whatsappDiagnostics.ts',
  'lib/toll/qualpToll.ts',
  'lib/maps.ts',
  'lib/routeDistance.ts',
  'api/geocode-address.ts',
  'api/toll-qualp.ts',
  'api/placa-lookup.ts',
  'server/routes.ts',
  'server/timeclockPunch.ts',
  'api/rh-timeclock-entries.ts',
] as const;

export type IntegracaoStatus = 'ok' | 'degraded' | 'falhou' | 'nao_configurado';

export type IntegracaoDiagResult = {
  id: string;
  nome: string;
  servico: string;
  status: IntegracaoStatus;
  configurado: boolean;
  latenciaMs?: number;
  erro?: string;
  detalhes?: Record<string, unknown>;
  healthEndpointExistente?: string;
};

export type DiagnosticoIntegracoesResult = {
  checkedAt: string;
  overall: 'healthy' | 'degraded' | 'down';
  integracoes: IntegracaoDiagResult[];
  resumo: {
    total: number;
    ok: number;
    falhou: number;
    naoConfigurado: number;
    degradado: number;
  };
  arquivosAnalisados: readonly string[];
};

export type DiagnosticoIntegracoesOptions = {
  /** Timeout por integração (ms). Padrão: 20s */
  timeoutMs?: number;
  /** Inclui integrações opcionais (DataJud, WDAPI, QualP, RapidAPI, Postgres direto) */
  incluirOpcionais?: boolean;
};

const DEFAULT_TIMEOUT_MS = 20_000;
let activeTimeoutMs = DEFAULT_TIMEOUT_MS;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout após ${ms}ms (${label})`));
    }, ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function runIntegracaoCheck(
  meta: {
    id: string;
    nome: string;
    servico: string;
    healthEndpointExistente?: string;
    configurado: boolean;
  },
  executor: () => Promise<{ ok: boolean; detalhes?: Record<string, unknown>; erro?: string }>,
  timeoutMs: number,
): Promise<IntegracaoDiagResult> {
  const base: IntegracaoDiagResult = {
    id: meta.id,
    nome: meta.nome,
    servico: meta.servico,
    configurado: meta.configurado,
    healthEndpointExistente: meta.healthEndpointExistente,
    status: meta.configurado ? 'falhou' : 'nao_configurado',
  };

  if (!meta.configurado) {
    return {
      ...base,
      erro: 'Credenciais ou URL não configuradas no ambiente',
    };
  }

  const started = Date.now();
  try {
    const outcome = await withTimeout(executor(), timeoutMs, meta.id);
    const latenciaMs = Date.now() - started;
    return {
      ...base,
      latenciaMs,
      status: outcome.ok ? 'ok' : 'degraded',
      erro: outcome.ok ? undefined : outcome.erro || 'Verificação retornou falha',
      detalhes: outcome.detalhes,
    };
  } catch (err: unknown) {
    const latenciaMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      latenciaMs,
      status: 'falhou',
      erro: message,
    };
  }
}

async function checkSupabase(): Promise<IntegracaoDiagResult> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const sb = createSupabaseAdminClient();
  const configurado = !!(url && anonKey && sb);

  return runIntegracaoCheck(
    {
      id: 'supabase',
      nome: 'Supabase (DB + Auth + Storage + Realtime)',
      servico: 'Supabase',
      healthEndpointExistente: 'GET /api/supabase/health-check',
      configurado,
    },
    async () => {
      const detalhes: Record<string, unknown> = {};
      const client = sb!;

      const dbStart = Date.now();
      const { error: dbErr } = await client
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      detalhes.database = {
        ok: !dbErr,
        latency_ms: Date.now() - dbStart,
        error: dbErr?.message || null,
      };

      const authStart = Date.now();
      try {
        const authRes = await fetch(`${url}/auth/v1/settings`, {
          headers: { apikey: anonKey },
        });
        detalhes.auth = { ok: authRes.ok, latency_ms: Date.now() - authStart, status: authRes.status };
      } catch (e: unknown) {
        detalhes.auth = {
          ok: false,
          latency_ms: Date.now() - authStart,
          error: e instanceof Error ? e.message : String(e),
        };
      }

      const storageStart = Date.now();
      const { error: storageErr } = await client.storage.listBuckets();
      detalhes.storage = {
        ok: !storageErr,
        latency_ms: Date.now() - storageStart,
        error: storageErr?.message || null,
      };

      const realtimeStart = Date.now();
      try {
        const rtRes = await fetch(`${url}/realtime/v1/api/tenants`, {
          headers: { apikey: anonKey },
        });
        detalhes.realtime = {
          ok: rtRes.status !== 500,
          latency_ms: Date.now() - realtimeStart,
          status: rtRes.status,
        };
      } catch (e: unknown) {
        detalhes.realtime = {
          ok: false,
          latency_ms: Date.now() - realtimeStart,
          error: e instanceof Error ? e.message : String(e),
        };
      }

      const checks = [detalhes.database, detalhes.auth, detalhes.storage, detalhes.realtime] as Array<{
        ok?: boolean;
      }>;
      const ok = checks.every((c) => c?.ok === true);
      const failed = checks.filter((c) => c?.ok !== true);
      return {
        ok,
        detalhes,
        erro: ok ? undefined : `${failed.length} sub-check(s) falharam`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkAsaas(): Promise<IntegracaoDiagResult> {
  return runIntegracaoCheck(
    {
      id: 'asaas',
      nome: 'Asaas (pagamentos e NF)',
      servico: 'Asaas',
      healthEndpointExistente: 'GET /api/asaas/balances',
      configurado: isAsaasConfigured(),
    },
    async () => {
      const balances = await getAllBalances();
      const comErro = balances.filter((b) => b.error);
      const ok = balances.some((b) => !b.error);
      return {
        ok,
        detalhes: { empresas: balances.length, saldos: balances },
        erro: comErro.length
          ? comErro.map((b) => `${b.company}: ${b.error}`).join('; ')
          : undefined,
      };
    },
    activeTimeoutMs,
  );
}

async function checkPlugNotas(): Promise<IntegracaoDiagResult> {
  return runIntegracaoCheck(
    {
      id: 'plugnotas',
      nome: 'PlugNotas (NFS-e)',
      servico: 'PlugNotas',
      healthEndpointExistente: 'GET /api/plugnotas/status',
      configurado: isPlugNotasConfigured(),
    },
    async () => {
      const result = await testPlugNotasConnection();
      return {
        ok: result.ok,
        detalhes: { env: getPlugNotasEnv(), ...result },
        erro: result.error,
      };
    },
    activeTimeoutMs,
  );
}

async function checkGemini(): Promise<IntegracaoDiagResult> {
  return runIntegracaoCheck(
    {
      id: 'gemini',
      nome: 'Google Gemini (IA)',
      servico: 'Gemini',
      healthEndpointExistente: 'GET /api/gemini/health',
      configurado: isGeminiConfigured(),
    },
    async () => {
      const ping = await pingGeminiHealth();
      const ok = /ok/i.test(ping.text || '');
      return {
        ok,
        detalhes: ping,
        erro: ok ? undefined : `Resposta inesperada: "${ping.text}"`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkEmail(): Promise<IntegracaoDiagResult> {
  const hasPass = !!(process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '').trim();
  return runIntegracaoCheck(
    {
      id: 'email_smtp',
      nome: 'E-mail SMTP (Office 365)',
      servico: 'SMTP',
      healthEndpointExistente: 'GET /api/email/health',
      configurado: hasPass,
    },
    async () => {
      const result = await runEmailHealthCheck();
      return {
        ok: result.ok,
        detalhes: {
          host: result.smtp.host,
          user: result.smtp.user,
          verifyOk: result.smtp.verifyOk,
          channels: result.channels.length,
        },
        erro: result.smtp.verifyError || undefined,
      };
    },
    activeTimeoutMs,
  );
}

async function checkZapi(): Promise<IntegracaoDiagResult> {
  const configured = await isZapiConfigured();
  return runIntegracaoCheck(
    {
      id: 'whatsapp_zapi',
      nome: 'WhatsApp Z-API',
      servico: 'Z-API',
      healthEndpointExistente: 'POST /api/whatsapp/instances/:id/test-connection',
      configurado: configured,
    },
    async () => {
      const { ok, status, data, text } = await zapiFetch('status', { method: 'GET' });
      return {
        ok: ok && status >= 200 && status < 300,
        detalhes: { httpStatus: status, data: data ?? null },
        erro: ok ? undefined : text || `HTTP ${status}`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkMetaWhatsApp(): Promise<IntegracaoDiagResult> {
  const configured = isMetaWhatsAppConfigured();
  return runIntegracaoCheck(
    {
      id: 'whatsapp_meta',
      nome: 'WhatsApp Meta Cloud API',
      servico: 'Meta',
      healthEndpointExistente: 'GET /api/whatsapp/meta/health',
      configurado: configured,
    },
    async () => {
      const result = await pingMetaWhatsApp();
      return {
        ok: result.ok,
        detalhes: result,
        erro: result.error,
      };
    },
    activeTimeoutMs,
  );
}

async function checkGoogleMaps(): Promise<IntegracaoDiagResult> {
  const key = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
  return runIntegracaoCheck(
    {
      id: 'google_maps',
      nome: 'Google Maps (Geocoding)',
      servico: 'Google Maps',
      healthEndpointExistente: 'GET /api/geocode-address?address=...',
      configurado: !!key,
    },
    async () => {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('São Paulo, SP')}&key=${key}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.status === 'OK';
      return {
        ok,
        detalhes: { httpStatus: res.status, apiStatus: data?.status, results: data?.results?.length ?? 0 },
        erro: ok ? undefined : data?.error_message || data?.status || `HTTP ${res.status}`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkRapidApiPedagio(): Promise<IntegracaoDiagResult> {
  const key = (process.env.RAPIDAPI_TOLL_KEY || '').trim();
  const host = 'territorial-pedagio-v1.p.rapidapi.com';
  return runIntegracaoCheck(
    {
      id: 'rapidapi_pedagio',
      nome: 'RapidAPI Pedágio',
      servico: 'RapidAPI',
      healthEndpointExistente: 'GET /api/toll/status',
      configurado: !!key,
    },
    async () => {
      const res = await fetch(`https://${host}/json/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': key,
          'x-rapidapi-host': host,
        },
        body: JSON.stringify({
          from: '(-23.5505, -46.6333)',
          to: '(-22.9068, -43.1729)',
          vehicle: 'car',
        }),
      });
      const ok = res.ok;
      const body = await res.text().catch(() => '');
      return {
        ok,
        detalhes: { httpStatus: res.status },
        erro: ok ? undefined : `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkQualp(): Promise<IntegracaoDiagResult> {
  const token = (process.env.QUALP_API_TOKEN || '').trim();
  return runIntegracaoCheck(
    {
      id: 'qualp',
      nome: 'QualP (pedágio)',
      servico: 'QualP',
      healthEndpointExistente: 'POST /api/toll/qualp',
      configurado: !!token,
    },
    async () => {
      const result = await fetchQualpToll('São Paulo, SP', 'Guarulhos, SP', 2);
      return {
        ok: result.success,
        detalhes: {
          tollCount: result.tollCount,
          distance: result.distance,
          provider: result.provider,
        },
        erro: result.apiError,
      };
    },
    activeTimeoutMs,
  );
}

async function checkWdapi(): Promise<IntegracaoDiagResult> {
  const token = (process.env.WDAPI_TOKEN || process.env.VITE_WDAPI_TOKEN || '').trim();
  return runIntegracaoCheck(
    {
      id: 'wdapi_placas',
      nome: 'WDAPI2 (consulta placas)',
      servico: 'WDAPI2',
      healthEndpointExistente: 'GET /api/placa/lookup/:placa',
      configurado: !!token,
    },
    async () => {
      // Placa fictícia: 404 = API respondeu (auth OK); 401/403 = credencial inválida.
      const placa = 'TST0000';
      const url = `https://wdapi2.com.br/consulta/${encodeURIComponent(placa)}/${encodeURIComponent(token)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const ok = res.status === 404 || res.ok;
        return {
          ok,
          detalhes: { httpStatus: res.status, placaTeste: placa },
          erro: ok ? undefined : `HTTP ${res.status} — verifique WDAPI_TOKEN`,
        };
      } catch (e: unknown) {
        clearTimeout(timer);
        throw e;
      }
    },
    activeTimeoutMs,
  );
}

async function checkDataJud(): Promise<IntegracaoDiagResult> {
  const key = (process.env.DATAJUD_API_KEY || '').trim();
  return runIntegracaoCheck(
    {
      id: 'datajud',
      nome: 'DataJud (CNJ)',
      servico: 'DataJud',
      healthEndpointExistente: 'POST /api/datajud/consulta',
      configurado: !!key,
    },
    async () => {
      const url = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: { match_all: {} }, size: 0 }),
      });
      const ok = res.ok;
      const body = await res.text().catch(() => '');
      return {
        ok,
        detalhes: { httpStatus: res.status },
        erro: ok ? undefined : `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    },
    activeTimeoutMs,
  );
}

async function checkWebPush(): Promise<IntegracaoDiagResult> {
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const configurado = !!(pub && priv);
  return runIntegracaoCheck(
    {
      id: 'webpush_vapid',
      nome: 'Web Push (VAPID)',
      servico: 'Web Push',
      configurado,
    },
    async () => ({
      ok: configurado,
      detalhes: {
        publicKeyLength: pub.length,
        privateKeyLength: priv.length,
        nota: 'Somente verificação de variáveis — sem envio de notificação',
      },
    }),
    1000,
  );
}

async function checkPostgresDireto(): Promise<IntegracaoDiagResult> {
  const dsn = (process.env.DATABASE_URL || '').trim();
  return runIntegracaoCheck(
    {
      id: 'postgresql_direto',
      nome: 'PostgreSQL direto (DATABASE_URL)',
      servico: 'PostgreSQL',
      configurado: !!dsn,
    },
    async () => {
      const pg = await import('pg');
      const pool = new pg.Pool({ connectionString: dsn, max: 1, connectionTimeoutMillis: 8000 });
      try {
        const result = await pool.query('SELECT 1 AS ok');
        return {
          ok: result.rows?.[0]?.ok === 1,
          detalhes: { rowCount: result.rowCount },
        };
      } finally {
        await pool.end().catch(() => undefined);
      }
    },
    activeTimeoutMs,
  );
}

export function computeOverallStatus(
  integracoes: IntegracaoDiagResult[],
): 'healthy' | 'degraded' | 'down' {
  const configured = integracoes.filter((i) => i.configurado);
  if (configured.length === 0) return 'down';

  const failed = configured.filter((i) => i.status === 'falhou');
  const degraded = configured.filter((i) => i.status === 'degraded');
  const ok = configured.filter((i) => i.status === 'ok');

  if (failed.length > 0 && ok.length === 0) return 'down';
  if (failed.length > 0 || degraded.length > 0) return 'degraded';
  return 'healthy';
}

/**
 * Executa ping/consulta read-only em cada integração externa configurada.
 * Não grava dados em nenhum serviço.
 */
export async function diagnosticoIntegracoes(
  options?: DiagnosticoIntegracoesOptions,
): Promise<DiagnosticoIntegracoesResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const incluirOpcionais = options?.incluirOpcionais !== false;

  activeTimeoutMs = timeoutMs;

  const checks: Array<() => Promise<IntegracaoDiagResult>> = [
    checkSupabase,
    checkAsaas,
    checkPlugNotas,
    checkGemini,
    checkEmail,
    checkZapi,
    checkMetaWhatsApp,
    checkGoogleMaps,
    checkWebPush,
  ];

  if (incluirOpcionais) {
    checks.push(
      checkRapidApiPedagio,
      checkQualp,
      checkWdapi,
      checkDataJud,
      checkPostgresDireto,
    );
  }

  const results = await Promise.all(
    checks.map((fn) =>
      fn().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        return {
          id: 'erro_interno',
          nome: fn.name || 'check',
          servico: 'interno',
          status: 'falhou' as const,
          configurado: true,
          erro: message,
        };
      }),
    ),
  );

  const integracoes = results;

  const resumo = {
    total: integracoes.length,
    ok: integracoes.filter((i) => i.status === 'ok').length,
    falhou: integracoes.filter((i) => i.status === 'falhou').length,
    naoConfigurado: integracoes.filter((i) => i.status === 'nao_configurado').length,
    degradado: integracoes.filter((i) => i.status === 'degraded').length,
  };

  return {
    checkedAt: new Date().toISOString(),
    overall: computeOverallStatus(integracoes),
    integracoes,
    resumo,
    arquivosAnalisados: ARQUIVOS_ANALISADOS,
  };
}
