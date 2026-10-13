/**
 * Diagnóstico temporário de leitura da TORRES.
 * Só a Diretoria. Não grava título, comissão nem pagamento.
 * Remover a rota depois de confirmar a conexão no servidor publicado.
 */
import { extractAuthToken, extractUserIdFromToken } from '../billingApiAuth.js';
import { isPerfilDiretoria } from '../diretoriaAccess.js';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { assertComissoesQuadroAccess } from './comissaoQuadroAuth.js';
import { createTorresAdminClient, mensagemChaveTorresRecusada } from './torresSupabase.js';

export type CodigoDiagnosticoTorres = 'CREDENCIAL' | 'SEM_PERMISSAO' | 'CONEXAO' | 'BANCO';

type LeituraTorres = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

export function classificarErroLeituraTorres(message: string): { status: number; codigo: CodigoDiagnosticoTorres } {
  const texto = message.toLowerCase();
  if (/jwt|api key|invalid api|unauthorized|chave|permission denied for|not authorized/.test(texto) && /key|jwt|chave|unauthorized/.test(texto)) {
    return { status: 503, codigo: 'CREDENCIAL' };
  }
  if (/permission denied|rls|row-level|não autorizado|permissão/.test(texto)) {
    return { status: 403, codigo: 'SEM_PERMISSAO' };
  }
  if (/fetch failed|network|econn|enotfound|timeout|socket|failed to fetch/.test(texto)) {
    return { status: 502, codigo: 'CONEXAO' };
  }
  return { status: 500, codigo: 'BANCO' };
}

export async function lerUmaLinhaTorres(cliente: LeituraTorres): Promise<{ ok: true } | { ok: false; status: number; codigo: CodigoDiagnosticoTorres }> {
  const { error } = await cliente.from('financial_transactions').select('id').limit(1);
  if (!error) return { ok: true };
  return { ok: false, ...classificarErroLeituraTorres(String(error.message || 'erro de banco')) };
}

function origemPermitida(origin: string): boolean {
  return origin === 'http://127.0.0.1:5000' || origin === 'http://localhost:5000';
}

function liberarOrigemLocal(req: { headers?: Record<string, unknown> }, res: { setHeader: (name: string, value: string) => void }): void {
  const bruto = req.headers?.origin ?? req.headers?.Origin;
  const origin = String(Array.isArray(bruto) ? bruto[0] : bruto || '').trim();
  if (!origemPermitida(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-tmseg-user-id, x-tmseg-role, x-tmseg-user-name, x-tmseg-permissions');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

async function perfilEhDiretoria(req: { headers?: Record<string, string | string[] | undefined> }): Promise<boolean> {
  const access = await assertComissoesQuadroAccess(req);
  if (!access.ok || access.somenteProprio) return false;
  const sb = createSupabaseAdminClient();
  const userId = extractUserIdFromToken(extractAuthToken(req));
  if (!sb || !userId) return false;
  const { data } = await sb
    .from('system_users')
    .select('profiles:profile_id ( name )')
    .eq('id', userId)
    .maybeSingle();
  const profiles = (data as { profiles?: { name?: string | null } | { name?: string | null }[] | null } | null)?.profiles;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return isPerfilDiretoria({ role: profile?.name });
}

export async function tratarDiagnosticoTorres(req: any, res: any): Promise<void> {
  liberarOrigemLocal(req, res);
  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (String(req.method || '').toUpperCase() !== 'GET') {
    res.status(405).json({ ok: false, codigo: 'VALIDACAO', error: 'method_not_allowed' });
    return;
  }
  const access = await assertComissoesQuadroAccess(req);
  if (!access.ok) {
    res.status(access.status).json({ ok: false, conectado: false, codigo: 'SEM_PERMISSAO', error: access.error });
    return;
  }
  if (!(await perfilEhDiretoria(req))) {
    res.status(403).json({ ok: false, conectado: false, codigo: 'SEM_PERMISSAO', error: 'Somente a Diretoria pode testar a conexão da TORRES.' });
    return;
  }

  const variavel = Boolean(String(process.env.TORRES_SUPABASE_SERVICE_ROLE_KEY || process.env.TORRES_SUPABASE_SERVICE_KEY || process.env.TORRES_SUPABASE_KEY || '').trim());
  const cliente = createTorresAdminClient();
  if (!cliente) {
    res.status(503).json({
      ok: false,
      conectado: false,
      variavel,
      codigo: 'CREDENCIAL',
      error: mensagemChaveTorresRecusada() || 'A chave da TORRES não foi aceita.',
    });
    return;
  }

  const leitura = await lerUmaLinhaTorres(cliente);
  if (!leitura.ok) {
    res.status(leitura.status).json({
      ok: false,
      conectado: false,
      variavel: true,
      codigo: leitura.codigo,
      error: leitura.codigo === 'CREDENCIAL'
        ? 'A chave da TORRES foi recusada pelo banco.'
        : leitura.codigo === 'CONEXAO'
          ? 'A TORRES não respondeu.'
          : leitura.codigo === 'SEM_PERMISSAO'
            ? 'A TORRES recusou a leitura.'
            : 'A leitura da TORRES falhou.',
    });
    return;
  }
  res.status(200).json({ ok: true, conectado: true, variavel: true, leitura: 'financial_transactions' });
}
