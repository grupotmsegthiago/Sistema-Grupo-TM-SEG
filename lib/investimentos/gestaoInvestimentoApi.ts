/**
 * Lógica HTTP da Gestão Investimento — usada pelo handler leve na Vercel
 * (api/gestao-investimento.ts) sem passar pelo Express / api/index.
 */
import { createHash } from 'crypto';
import { createSupabaseAdminClient } from '../supabaseAdmin.js';
import { canAccessDiretoriaMenu } from '../diretoriaAccess.js';
import { extractAuthToken, extractUserIdFromToken } from '../osAnalysis/apiAuth.js';
import { createDraftInvestorProfile, evaluateProfileCompleteness } from './profileValidation.js';
import { isGestaoInvestimentoSchemaReady, runGestaoInvestimentoMigrations } from './schemaMigrations.js';
import {
  buildDashboardSnapshot,
  readCachedSnapshot,
  refreshAllOwnerCaches,
  refreshOwnerCache,
  writeCachedSnapshot,
} from './dashboardCache.js';
import type {
  InvestorProfile,
  InvestmentPosition,
  InvestmentRiskLimits,
  InvestmentWatchlistItem,
} from './types.js';

export type Principal = { id: string; name: string; role: string; email: string | null };

type ReqLike = { headers?: Record<string, string | string[] | undefined>; query?: any; body?: any; method?: string };

function headerValue(req: ReqLike, name: string): string {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

function parseBody(body: unknown): any {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' ? body : {};
}

export async function resolvePrincipal(req: ReqLike): Promise<Principal | null> {
  const headerId = headerValue(req, 'x-tmseg-user-id');
  const headerName = headerValue(req, 'x-tmseg-user-name');
  const headerRole = headerValue(req, 'x-tmseg-role');
  if (headerId && headerName) {
    return {
      id: headerId,
      name: headerName,
      role: headerRole.toLowerCase(),
      email: null,
    };
  }

  const token = extractAuthToken(req as any);
  const userId = extractUserIdFromToken(token);
  if (!userId) return null;
  const sb = createSupabaseAdminClient();
  if (!sb) return null;
  const { data } = await sb
    .from('system_users')
    .select('id, name, email, status, profiles:profile_id ( name )')
    .eq('id', userId)
    .maybeSingle();
  if (!data || (data as any).status !== 'Ativo') return null;
  return {
    id: String((data as any).id),
    name: String((data as any).name || ''),
    role: String(((data as any).profiles as any)?.name || '').toLowerCase(),
    email: (data as any).email || null,
  };
}

export function assertDiretoria(user: Principal | null): { status: number; body: any } | null {
  if (!user) return { status: 401, body: { ok: false, error: 'Não autorizado' } };
  if (!canAccessDiretoriaMenu(user)) {
    return { status: 403, body: { ok: false, error: 'Acesso restrito à Diretoria (Gestão Investimento).' } };
  }
  return null;
}

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  const code = String((err as any)?.code || '');
  return code === '42P01' || /does not exist|schema cache|Could not find the table/i.test(msg);
}

async function writeAudit(
  ownerUserId: string,
  actor: Principal,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const sb = createSupabaseAdminClient();
  if (!sb) return;
  const integrity_hash = createHash('sha256')
    .update(JSON.stringify({ action, entityType, entityId, summary, payload, at: Date.now() }))
    .digest('hex')
    .slice(0, 32);
  await sb.from('investment_audit_log').insert({
    owner_user_id: ownerUserId,
    actor_user_id: actor.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    payload,
    integrity_hash,
    source: 'app',
  });
}

function mapProfileRow(body: any): Partial<InvestorProfile> {
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
  const bool = (v: unknown) => (v === null || v === undefined || v === '' ? null : Boolean(v));
  return {
    person_type: body.person_type ?? null,
    capital_available: num(body.capital_available),
    emergency_reserve: num(body.emergency_reserve),
    max_per_investment: num(body.max_per_investment),
    horizon_months: body.horizon_months == null || body.horizon_months === '' ? null : Number(body.horizon_months),
    liquidity_need: body.liquidity_need ?? null,
    max_loss_pct: num(body.max_loss_pct),
    risk_profile: body.risk_profile ?? null,
    exp_equity: bool(body.exp_equity),
    exp_private_credit: bool(body.exp_private_credit),
    exp_fii: bool(body.exp_fii),
    exp_crypto: bool(body.exp_crypto),
    needs_monthly_income: bool(body.needs_monthly_income),
    monthly_income_amount: num(body.monthly_income_amount),
    restricted_sectors: String(body.restricted_sectors || ''),
    restricted_institutions: String(body.restricted_institutions || ''),
    investor_category: body.investor_category ?? null,
    allows_crypto: Boolean(body.allows_crypto),
    allows_international: Boolean(body.allows_international),
    monthly_target_pct_min: Number(body.monthly_target_pct_min ?? 1.5),
    monthly_target_pct_max: Number(body.monthly_target_pct_max ?? 2.0),
    broker_default: String(body.broker_default || 'XP'),
    notes: String(body.notes || ''),
  };
}

export async function handleGestaoInvestimentoOp(
  op: string,
  req: ReqLike,
): Promise<{ status: number; body: any }> {
  const method = String(req.method || 'GET').toUpperCase();
  const body = parseBody(req.body);
  const q = req.query || {};

  if (op === 'health') {
    try {
      const schemaReady = await Promise.race([
        isGestaoInvestimentoSchemaReady(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8_000)),
      ]);
      return { status: 200, body: { ok: true, schemaReady, module: 'gestao-investimento', via: 'light' } };
    } catch (e: any) {
      return { status: 500, body: { ok: false, schemaReady: false, error: e?.message || 'Falha' } };
    }
  }

  if (op === 'ensure-schema') {
    // POST: UI Diretoria. GET: Vercel Cron (Authorization: Bearer CRON_SECRET).
    if (method !== 'POST' && method !== 'GET') {
      return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    }
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const auth = headerValue(req, 'authorization');
    const isCron = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
    if (!isCron) {
      if (method === 'GET') {
        return { status: 401, body: { ok: false, error: 'Não autorizado' } };
      }
      const user = await resolvePrincipal(req);
      const denied = assertDiretoria(user);
      if (denied) return denied;
    }
    try {
      const result = await Promise.race([
        runGestaoInvestimentoMigrations(),
        new Promise<{ ok: false; message: string; applied: false }>((resolve) =>
          setTimeout(() => resolve({ ok: false, message: 'Timeout ao aplicar schema (45s)', applied: false }), 45_000),
        ),
      ]);
      return { status: result.ok ? 200 : 500, body: { ok: result.ok, ...result } };
    } catch (e: any) {
      return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
    }
  }

  if (op === 'refresh-cache') {
    // Pesquisa “off”: cron a cada 30 min pré-calcula o painel (Bearer CRON_SECRET).
    // POST Diretoria força recálculo do próprio usuário.
    if (method !== 'GET' && method !== 'POST') {
      return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    }
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const auth = headerValue(req, 'authorization');
    const isCron = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
    if (isCron || method === 'GET') {
      if (!isCron) return { status: 401, body: { ok: false, error: 'Não autorizado' } };
      try {
        if (!(await isGestaoInvestimentoSchemaReady())) {
          await runGestaoInvestimentoMigrations();
        }
        const result = await Promise.race([
          refreshAllOwnerCaches(),
          new Promise<{ ok: false; refreshed: number; errors: string[] }>((resolve) =>
            setTimeout(() => resolve({ ok: false, refreshed: 0, errors: ['timeout 50s'] }), 50_000),
          ),
        ]);
        return { status: result.ok || result.refreshed > 0 ? 200 : 500, body: { ok: true, ...result, via: 'cron' } };
      } catch (e: any) {
        return { status: 500, body: { ok: false, error: e?.message || 'Falha no refresh-cache' } };
      }
    }
    const user = await resolvePrincipal(req);
    const denied = assertDiretoria(user);
    if (denied) return denied;
    const r = await refreshOwnerCache((user as Principal).id);
    return { status: r.ok ? 200 : 500, body: { ok: r.ok, ...r, via: 'manual' } };
  }

  const user = await resolvePrincipal(req);
  const denied = assertDiretoria(user);
  if (denied) return denied;
  // user is Principal after assert
  const principal = user as Principal;

  if (op === 'summary') {
    if (method !== 'GET') return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    const forceLive = String(q.fresh || q.live || '') === '1';
    try {
      // Caminho rápido: 1 leitura do cache pré-calculado (cron 30 min).
      if (!forceLive) {
        const cached = await readCachedSnapshot(principal.id);
        if (cached) {
          return { status: 200, body: { ...cached, via: 'cache', schemaReady: true } };
        }
      }

      const ready = await Promise.race([
        isGestaoInvestimentoSchemaReady(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6_000)),
      ]);
      if (!ready) {
        return {
          status: 503,
          body: {
            ok: false,
            error: 'schema_missing',
            message:
              'Migration da Gestão Investimento ainda não aplicada. Use “Aplicar schema no Supabase” ou rode o SQL em migrations/2026_08_04_gestao_investimento_fundacao.sql',
          },
        };
      }

      const snap = await buildDashboardSnapshot(principal.id);
      if (!snap.ok) {
        if (snap.schema_missing) {
          return {
            status: 503,
            body: { ok: false, error: 'schema_missing', message: 'Migration da Gestão Investimento ainda não aplicada.' },
          };
        }
        return { status: 500, body: { ok: false, error: snap.error } };
      }

      // Grava cache para as próximas aberturas / cron (não bloqueia resposta se falhar).
      void writeCachedSnapshot(principal.id, snap).catch(() => {});

      return { status: 200, body: { ...snap, via: 'live', fromCache: false } };
    } catch (e: any) {
      if (isMissingTableError(e)) {
        return { status: 503, body: { ok: false, error: 'schema_missing', message: 'Migration ainda não aplicada.' } };
      }
      return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
    }
  }

  if (op === 'profile') {
    if (method !== 'PUT' && method !== 'POST') return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: 'Supabase admin indisponível' } };
      const mapped = mapProfileRow(body || {});
      const row = {
        owner_user_id: principal.id,
        ...mapped,
        updated_by: principal.name,
        created_by: principal.name,
        updated_at: new Date().toISOString(),
        source: 'manual',
        data_reference_at: new Date().toISOString(),
      };
      const { data: existing } = await sb
        .from('investor_profiles')
        .select('id, version')
        .eq('owner_user_id', principal.id)
        .maybeSingle();
      let saved: any;
      if (existing?.id) {
        const { data, error } = await sb
          .from('investor_profiles')
          .update({ ...row, version: Number(existing.version || 1) + 1, created_by: undefined })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await sb.from('investor_profiles').insert({ ...row, version: 1 }).select('*').single();
        if (error) throw error;
        saved = data;
      }
      await sb.from('investment_portfolios').upsert(
        {
          owner_user_id: principal.id,
          name: 'Carteira XP',
          broker: String(mapped.broker_default || 'XP'),
          monitored_capital: Number(mapped.capital_available || 0),
          updated_by: principal.name,
          created_by: principal.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_user_id' },
      );
      await sb.from('investment_risk_limits').upsert(
        {
          owner_user_id: principal.id,
          max_pct_crypto: mapped.allows_crypto ? 5 : 0,
          updated_by: principal.name,
          created_by: principal.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_user_id' },
      );
      const completeness = evaluateProfileCompleteness(saved as InvestorProfile);
      await writeAudit(principal.id, principal, 'profile_upsert', 'investor_profiles', saved.id, 'Perfil do investidor salvo', {
        complete: completeness.complete,
        missing: completeness.missing,
      });
      void refreshOwnerCache(principal.id).catch(() => {});
      return { status: 200, body: { ok: true, profile: saved, completeness } };
    } catch (e: any) {
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing', message: 'Migration ainda não aplicada.' } };
      return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
    }
  }

  if (op === 'positions') {
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: 'Supabase admin indisponível' } };
    const id = String(q.id || body.id || '').trim();

    if (method === 'GET') {
      try {
        const { data, error } = await sb
          .from('investment_positions')
          .select('*')
          .eq('owner_user_id', principal.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return { status: 200, body: { ok: true, positions: data || [] } };
      } catch (e: any) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
        return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
      }
    }

    if (method === 'POST') {
      try {
        const instrument_name = String(body.instrument_name || '').trim();
        if (!instrument_name) return { status: 400, body: { ok: false, error: 'Nome do ativo é obrigatório' } };
        const row = {
          owner_user_id: principal.id,
          instrument_name,
          instrument_code: String(body.instrument_code || ''),
          instrument_type: String(body.instrument_type || 'outros'),
          quantity: Number(body.quantity || 0),
          avg_price: Number(body.avg_price || 0),
          current_value: Number(body.current_value || 0),
          entry_date: body.entry_date || null,
          broker: String(body.broker || 'XP'),
          taxation_notes: String(body.taxation_notes || ''),
          currency: String(body.currency || 'BRL'),
          is_active: true,
          source: 'manual',
          created_by: principal.name,
          updated_by: principal.name,
          data_reference_at: new Date().toISOString(),
        } satisfies Partial<InvestmentPosition> & Record<string, unknown>;
        const { data, error } = await sb.from('investment_positions').insert(row).select('*').single();
        if (error) throw error;
        await writeAudit(principal.id, principal, 'position_create', 'investment_positions', data.id, `Posição criada: ${instrument_name}`, {
          current_value: row.current_value,
          broker: row.broker,
        });
        void refreshOwnerCache(principal.id).catch(() => {});
        return { status: 201, body: { ok: true, position: data } };
      } catch (e: any) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
        return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
      }
    }

    if (method === 'DELETE') {
      if (!id) return { status: 400, body: { ok: false, error: 'Informe id' } };
      try {
        const { error } = await sb
          .from('investment_positions')
          .update({ is_active: false, updated_by: principal.name, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('owner_user_id', principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, 'position_deactivate', 'investment_positions', id, 'Posição desativada');
        void refreshOwnerCache(principal.id).catch(() => {});
        return { status: 200, body: { ok: true } };
      } catch (e: any) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
        return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
      }
    }

    return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
  }

  if (op === 'watchlist') {
    const sb = createSupabaseAdminClient();
    if (!sb) return { status: 503, body: { ok: false, error: 'Supabase admin indisponível' } };
    const id = String(q.id || body.id || '').trim();

    if (method === 'POST') {
      try {
        const instrument_name = String(body.instrument_name || '').trim();
        if (!instrument_name) return { status: 400, body: { ok: false, error: 'Nome do ativo é obrigatório' } };
        const row: Partial<InvestmentWatchlistItem> & Record<string, unknown> = {
          owner_user_id: principal.id,
          instrument_name,
          instrument_code: String(body.instrument_code || ''),
          instrument_type: String(body.instrument_type || 'outros'),
          notes: String(body.notes || ''),
          priority: Number(body.priority || 3),
          status: body.status || 'observar',
          source: 'manual',
          created_by: principal.name,
          updated_by: principal.name,
        };
        const { data, error } = await sb.from('investment_watchlists').insert(row).select('*').single();
        if (error) throw error;
        await writeAudit(principal.id, principal, 'watchlist_create', 'investment_watchlists', data.id, `Watchlist: ${instrument_name}`);
        void refreshOwnerCache(principal.id).catch(() => {});
        return { status: 201, body: { ok: true, item: data } };
      } catch (e: any) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
        return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
      }
    }

    if (method === 'DELETE') {
      if (!id) return { status: 400, body: { ok: false, error: 'Informe id' } };
      try {
        const { error } = await sb.from('investment_watchlists').delete().eq('id', id).eq('owner_user_id', principal.id);
        if (error) throw error;
        await writeAudit(principal.id, principal, 'watchlist_delete', 'investment_watchlists', id, 'Item removido da watchlist');
        void refreshOwnerCache(principal.id).catch(() => {});
        return { status: 200, body: { ok: true } };
      } catch (e: any) {
        if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
        return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
      }
    }

    return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
  }

  if (op === 'audit') {
    if (method !== 'GET') return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: 'Supabase admin indisponível' } };
      const limit = Math.min(100, Math.max(1, Number(q.limit || 50)));
      const { data, error } = await sb
        .from('investment_audit_log')
        .select('id, action, entity_type, entity_id, summary, created_at, actor_user_id, integrity_hash')
        .eq('owner_user_id', principal.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { status: 200, body: { ok: true, items: data || [] } };
    } catch (e: any) {
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
      return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
    }
  }

  if (op === 'risk-limits') {
    if (method !== 'PUT' && method !== 'POST') return { status: 405, body: { ok: false, error: 'method_not_allowed' } };
    try {
      const sb = createSupabaseAdminClient();
      if (!sb) return { status: 503, body: { ok: false, error: 'Supabase admin indisponível' } };
      const row: Partial<InvestmentRiskLimits> & Record<string, unknown> = {
        owner_user_id: principal.id,
        max_pct_per_asset: Number(body.max_pct_per_asset ?? 20),
        max_pct_per_issuer: Number(body.max_pct_per_issuer ?? 25),
        max_pct_per_institution: Number(body.max_pct_per_institution ?? 40),
        max_pct_per_class: Number(body.max_pct_per_class ?? 40),
        max_pct_illiquid: Number(body.max_pct_illiquid ?? 15),
        max_pct_private_credit: Number(body.max_pct_private_credit ?? 20),
        max_pct_fx: Number(body.max_pct_fx ?? 10),
        max_pct_crypto: Number(body.max_pct_crypto ?? 0),
        min_cash_pct: Number(body.min_cash_pct ?? 5),
        emergency_reserve_untouchable: body.emergency_reserve_untouchable !== false,
        updated_by: principal.name,
        created_by: principal.name,
        updated_at: new Date().toISOString(),
        source: 'manual',
      };
      const { data, error } = await sb
        .from('investment_risk_limits')
        .upsert(row, { onConflict: 'owner_user_id' })
        .select('*')
        .single();
      if (error) throw error;
      await writeAudit(principal.id, principal, 'risk_limits_upsert', 'investment_risk_limits', data.id, 'Limites de risco atualizados');
      return { status: 200, body: { ok: true, riskLimits: data } };
    } catch (e: any) {
      if (isMissingTableError(e)) return { status: 503, body: { ok: false, error: 'schema_missing' } };
      return { status: 500, body: { ok: false, error: e?.message || 'Falha' } };
    }
  }

  return {
    status: 400,
    body: { ok: false, error: 'Informe op=health|summary|ensure-schema|refresh-cache|profile|positions|watchlist|audit|risk-limits' },
  };
}
