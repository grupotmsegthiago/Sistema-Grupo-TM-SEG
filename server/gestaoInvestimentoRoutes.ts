/**
 * Rotas Express — Gestão Investimento (Fase 2).
 * Acessíveis via proxy /api/index (sem nova entry em vercel.json — limite 50).
 * Autorização: somente Thiago Moreira / Thiago Santos (canAccessDiretoriaMenu).
 */
import type { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { createSupabaseAdminClient } from '../lib/supabaseAdmin';
import { canAccessDiretoriaMenu } from '../lib/diretoriaAccess';
import { extractAuthToken, extractUserIdFromToken } from '../lib/osAnalysis/apiAuth';
import {
  buildProvision30dEstimate,
  createDraftInvestorProfile,
  describeMonthlyTargetBand,
  evaluateProfileCompleteness,
  isGestaoInvestimentoSchemaReady,
  runGestaoInvestimentoMigrations,
  type InvestorProfile,
  type InvestmentPosition,
  type InvestmentRiskLimits,
  type InvestmentWatchlistItem,
} from '../lib/investimentos';
import { verifyCronRequest } from './cronAuth';

type Principal = { id: string; name: string; role: string; email: string | null };

async function resolvePrincipal(req: Request): Promise<Principal | null> {
  if ((req as any).user?.id && (req as any).user?.name) {
    return {
      id: String((req as any).user.id),
      name: String((req as any).user.name),
      role: String((req as any).user.role || '').toLowerCase(),
      email: (req as any).user.email || null,
    };
  }
  const token = extractAuthToken(req);
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

function denyIfNotDiretoria(user: Principal | null, res: Response): user is Principal {
  if (!user) {
    res.status(401).json({ ok: false, error: 'Não autorizado' });
    return false;
  }
  if (!canAccessDiretoriaMenu(user)) {
    res.status(403).json({ ok: false, error: 'Acesso restrito à Diretoria (Gestão Investimento).' });
    return false;
  }
  return true;
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

export function registerGestaoInvestimentoRoutes(app: Express, requireAuth: any): void {
  const base = '/api/gestao-investimento';

  /** Health público mínimo — só indica se o schema existe (sem dados financeiros). */
  app.get(`${base}/health`, async (_req: Request, res: Response) => {
    try {
      const schemaReady = await isGestaoInvestimentoSchemaReady();
      return res.json({ ok: true, schemaReady, module: 'gestao-investimento' });
    } catch (e: any) {
      return res.status(500).json({ ok: false, schemaReady: false, error: e?.message || 'Falha' });
    }
  });

  /** Aplica migration (service role). Diretoria autenticada ou CRON_SECRET. */
  app.post(`${base}/ensure-schema`, async (req: Request, res: Response) => {
    try {
      const cronOk = verifyCronRequest(req);
      if (!cronOk) {
        const authHeader = req.headers.authorization || '';
        if (authHeader) {
          (req as any).authToken = String(authHeader).replace(/^Bearer\s+/i, '');
        }
        const user = await resolvePrincipal(req);
        if (!denyIfNotDiretoria(user, res)) return;
      }
      const result = await runGestaoInvestimentoMigrations();
      return res.status(result.ok ? 200 : 500).json({ ok: result.ok, ...result });
    } catch (e: any) {
      console.error('[gestao-investimento/ensure-schema]', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.get(`${base}/summary`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;

      // NÃO auto-aplica no summary: migration sequencial via exec_sql pode
      // segurar a request até o timeout da Vercel → tela "Carregando…" eterna.
      // Schema: POST /ensure-schema (handler leve) ou SQL manual.
      const schemaReady = await Promise.race([
        isGestaoInvestimentoSchemaReady(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 6_000)),
      ]);
      if (!schemaReady) {
        return res.status(503).json({
          ok: false,
          error: 'schema_missing',
          message:
            'Migration da Gestão Investimento ainda não aplicada. Use “Aplicar schema no Supabase” ou o SQL em migrations/2026_08_04_gestao_investimento_fundacao.sql',
        });
      }

      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });

      const [{ data: profile, error: pErr }, { data: positions, error: posErr }, { data: watchlist }, { data: limits }, { data: sources }] =
        await Promise.all([
          sb.from('investor_profiles').select('*').eq('owner_user_id', user.id).maybeSingle(),
          sb.from('investment_positions').select('*').eq('owner_user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }),
          sb.from('investment_watchlists').select('*').eq('owner_user_id', user.id).order('priority', { ascending: true }),
          sb.from('investment_risk_limits').select('*').eq('owner_user_id', user.id).maybeSingle(),
          sb.from('investment_data_sources').select('code, name, url, reliability, is_active, last_collected_at').eq('is_active', true),
        ]);

      if (pErr && isMissingTableError(pErr)) {
        return res.status(503).json({
          ok: false,
          error: 'schema_missing',
          message: 'Migration da Gestão Investimento ainda não aplicada. Arquivo: migrations/2026_08_04_gestao_investimento_fundacao.sql',
        });
      }
      if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
      if (posErr && !isMissingTableError(posErr)) return res.status(500).json({ ok: false, error: posErr.message });

      const draft = profile
        ? ({ ...createDraftInvestorProfile(), ...profile } as InvestorProfile)
        : createDraftInvestorProfile();
      const completeness = evaluateProfileCompleteness(profile ? (profile as InvestorProfile) : null);
      const targetBand = describeMonthlyTargetBand(
        Number(draft.monthly_target_pct_min ?? 1.5),
        Number(draft.monthly_target_pct_max ?? 2.0),
      );
      const positionsList = (positions || []) as InvestmentPosition[];
      const portfolioValue = positionsList.reduce((s, p) => s + Number(p.current_value || 0), 0);
      const capitalBase = Number(draft.capital_available || portfolioValue || 100_000);
      const provision30d = buildProvision30dEstimate(
        capitalBase,
        targetBand.monthlyMinPct,
        targetBand.monthlyMaxPct,
      );

      return res.json({
        ok: true,
        schemaReady: true,
        profile: profile || null,
        draftDefaults: createDraftInvestorProfile(),
        completeness,
        canRecommend: completeness.complete,
        positions: positionsList,
        watchlist: watchlist || [],
        riskLimits: limits || null,
        dataSources: sources || [],
        portfolioValue,
        capitalBase,
        targetBand,
        provision30d,
        recommendationsBlockedReason: completeness.complete
          ? null
          : completeness.message,
        automation: {
          canTrade: false,
          note: 'A IA não está autorizada a comprar, vender, resgatar, transferir ou movimentar dinheiro automaticamente.',
        },
      });
    } catch (e: any) {
      if (isMissingTableError(e)) {
        return res.status(503).json({
          ok: false,
          error: 'schema_missing',
          message: 'Migration da Gestão Investimento ainda não aplicada.',
        });
      }
      console.error('[gestao-investimento/summary]', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.put(`${base}/profile`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });

      const mapped = mapProfileRow(req.body || {});
      const row = {
        owner_user_id: user.id,
        ...mapped,
        updated_by: user.name,
        created_by: user.name,
        updated_at: new Date().toISOString(),
        source: 'manual',
        data_reference_at: new Date().toISOString(),
      };

      const { data: existing } = await sb
        .from('investor_profiles')
        .select('id, version')
        .eq('owner_user_id', user.id)
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
        const { data, error } = await sb
          .from('investor_profiles')
          .insert({ ...row, version: 1 })
          .select('*')
          .single();
        if (error) throw error;
        saved = data;
      }

      // Garante portfólio + limites padrão
      await sb.from('investment_portfolios').upsert(
        {
          owner_user_id: user.id,
          name: 'Carteira XP',
          broker: String(mapped.broker_default || 'XP'),
          monitored_capital: Number(mapped.capital_available || 0),
          updated_by: user.name,
          created_by: user.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_user_id' },
      );
      await sb.from('investment_risk_limits').upsert(
        {
          owner_user_id: user.id,
          max_pct_crypto: mapped.allows_crypto ? 5 : 0,
          updated_by: user.name,
          created_by: user.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_user_id' },
      );

      const completeness = evaluateProfileCompleteness(saved as InvestorProfile);
      await writeAudit(user.id, user, 'profile_upsert', 'investor_profiles', saved.id, 'Perfil do investidor salvo', {
        complete: completeness.complete,
        missing: completeness.missing,
      });

      return res.json({ ok: true, profile: saved, completeness });
    } catch (e: any) {
      if (isMissingTableError(e)) {
        return res.status(503).json({ ok: false, error: 'schema_missing', message: 'Migration ainda não aplicada.' });
      }
      console.error('[gestao-investimento/profile]', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.get(`${base}/positions`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const { data, error } = await sb
        .from('investment_positions')
        .select('*')
        .eq('owner_user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, positions: data || [] });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.post(`${base}/positions`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });

      const body = req.body || {};
      const instrument_name = String(body.instrument_name || '').trim();
      if (!instrument_name) return res.status(400).json({ ok: false, error: 'Nome do ativo é obrigatório' });

      const row = {
        owner_user_id: user.id,
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
        created_by: user.name,
        updated_by: user.name,
        data_reference_at: new Date().toISOString(),
      } satisfies Partial<InvestmentPosition> & Record<string, unknown>;

      const { data, error } = await sb.from('investment_positions').insert(row).select('*').single();
      if (error) throw error;
      await writeAudit(user.id, user, 'position_create', 'investment_positions', data.id, `Posição criada: ${instrument_name}`, {
        current_value: row.current_value,
        broker: row.broker,
      });
      return res.status(201).json({ ok: true, position: data });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.patch(`${base}/positions/:id`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const id = String(req.params.id || '');
      const body = req.body || {};
      const patch: Record<string, unknown> = {
        updated_by: user.name,
        updated_at: new Date().toISOString(),
      };
      for (const key of [
        'instrument_name', 'instrument_code', 'instrument_type', 'quantity', 'avg_price',
        'current_value', 'entry_date', 'broker', 'taxation_notes', 'currency', 'is_active',
      ]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      const { data, error } = await sb
        .from('investment_positions')
        .update(patch)
        .eq('id', id)
        .eq('owner_user_id', user.id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAudit(user.id, user, 'position_update', 'investment_positions', id, 'Posição atualizada', patch);
      return res.json({ ok: true, position: data });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.delete(`${base}/positions/:id`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const id = String(req.params.id || '');
      const { error } = await sb
        .from('investment_positions')
        .update({ is_active: false, updated_by: user.name, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_user_id', user.id);
      if (error) throw error;
      await writeAudit(user.id, user, 'position_deactivate', 'investment_positions', id, 'Posição desativada');
      return res.json({ ok: true });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.post(`${base}/watchlist`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const body = req.body || {};
      const instrument_name = String(body.instrument_name || '').trim();
      if (!instrument_name) return res.status(400).json({ ok: false, error: 'Nome do ativo é obrigatório' });
      const row: Partial<InvestmentWatchlistItem> & Record<string, unknown> = {
        owner_user_id: user.id,
        instrument_name,
        instrument_code: String(body.instrument_code || ''),
        instrument_type: String(body.instrument_type || 'outros'),
        notes: String(body.notes || ''),
        priority: Number(body.priority || 3),
        status: body.status || 'observar',
        source: 'manual',
        created_by: user.name,
        updated_by: user.name,
      };
      const { data, error } = await sb.from('investment_watchlists').insert(row).select('*').single();
      if (error) throw error;
      await writeAudit(user.id, user, 'watchlist_create', 'investment_watchlists', data.id, `Watchlist: ${instrument_name}`);
      return res.status(201).json({ ok: true, item: data });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.delete(`${base}/watchlist/:id`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const id = String(req.params.id || '');
      const { error } = await sb.from('investment_watchlists').delete().eq('id', id).eq('owner_user_id', user.id);
      if (error) throw error;
      await writeAudit(user.id, user, 'watchlist_delete', 'investment_watchlists', id, 'Item removido da watchlist');
      return res.json({ ok: true });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.put(`${base}/risk-limits`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const body = req.body || {};
      const row: Partial<InvestmentRiskLimits> & Record<string, unknown> = {
        owner_user_id: user.id,
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
        updated_by: user.name,
        created_by: user.name,
        updated_at: new Date().toISOString(),
        source: 'manual',
      };
      const { data, error } = await sb
        .from('investment_risk_limits')
        .upsert(row, { onConflict: 'owner_user_id' })
        .select('*')
        .single();
      if (error) throw error;
      await writeAudit(user.id, user, 'risk_limits_upsert', 'investment_risk_limits', data.id, 'Limites de risco atualizados');
      return res.json({ ok: true, riskLimits: data });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });

  app.get(`${base}/audit`, requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await resolvePrincipal(req);
      if (!denyIfNotDiretoria(user, res)) return;
      const sb = createSupabaseAdminClient();
      if (!sb) return res.status(503).json({ ok: false, error: 'Supabase admin indisponível' });
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const { data, error } = await sb
        .from('investment_audit_log')
        .select('id, action, entity_type, entity_id, summary, created_at, actor_user_id, integrity_hash')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return res.json({ ok: true, items: data || [] });
    } catch (e: any) {
      if (isMissingTableError(e)) return res.status(503).json({ ok: false, error: 'schema_missing' });
      return res.status(500).json({ ok: false, error: e?.message || 'Falha' });
    }
  });
}
