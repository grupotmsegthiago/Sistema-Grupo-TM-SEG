import type { SupabaseClient } from '@supabase/supabase-js';

export type F4ApiResult = {
  status: number;
  body: unknown;
};

type EnvLike = Record<string, string | undefined>;

const ok = (body: unknown): F4ApiResult => ({ status: 200, body });
const fail = (status: number, error: unknown): F4ApiResult => ({
  status,
  body: { error: error instanceof Error ? error.message : String(error) },
});

export async function getF4DbCapacity(
  client: SupabaseClient,
  env: EnvLike = process.env,
): Promise<Record<string, unknown>> {
  const DB_CAPACITY_GB = Number(env.DB_CAPACITY_GB || 8);
  const tables = [
    'missions', 'clients', 'providers', 'vehicles', 'system_users',
    'financial_transactions', 'commercial_proposals', 'client_price_tables',
    'provider_cost_tables', 'system_logs', 'financial_accounts', 'financial_categories',
    'client_registries', 'client_mission_notes', 'operational_reports',
    'account_balance_snapshots', 'platform_cost_overrides',
  ];

  let totalRows = 0;
  const tableStats: Array<Record<string, unknown>> = [];
  for (const table of tables) {
    try {
      const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        totalRows += count;
        const avgRowSizeBytes = ['system_logs', 'mission_logs', 'mission_history'].includes(table)
          ? 2048
          : ['missions', 'commercial_proposals', 'operational_reports'].includes(table)
            ? 4096
            : 800;
        tableStats.push({
          table,
          rows: count,
          total_bytes: count * avgRowSizeBytes,
          total_size: `${(count * avgRowSizeBytes / 1024).toFixed(0)} kB`,
          dead_rows: 0,
        });
      }
    } catch {
      // Paridade Express: tabela ausente/indisponível não derruba o diagnóstico.
    }
  }

  const usedBytes = totalRows * 800;
  const limitBytes = Math.round(DB_CAPACITY_GB * 1024 * 1024 * 1024);
  const tablesBySize = tableStats.sort(
    (a, b) => Number(b.total_bytes || 0) - Number(a.total_bytes || 0),
  );

  return {
    used_bytes: usedBytes,
    limit_bytes: limitBytes,
    percent_used: limitBytes > 0 ? usedBytes / limitBytes : null,
    used_mb: +(usedBytes / 1024 / 1024).toFixed(2),
    used_gb: +(usedBytes / 1024 / 1024 / 1024).toFixed(3),
    limit_gb: DB_CAPACITY_GB,
    size_pretty: `${(usedBytes / 1024 / 1024).toFixed(2)} MB`,
    total_rows: totalRows,
    total_dead_rows: 0,
    tables: tablesBySize,
    source: 'estimate',
    updated_at: new Date().toISOString(),
  };
}

export async function runF4DbOperation(
  op: 'capacity' | 'vacuum',
  body: any,
  client: SupabaseClient,
  env: EnvLike = process.env,
): Promise<F4ApiResult> {
  try {
    if (op === 'capacity') return ok(await getF4DbCapacity(client, env));

    const allowedTables = [
      'missions', 'system_logs', 'mission_logs', 'mission_history',
      'financial_transactions', 'clients', 'providers', 'vehicles', 'client_price_tables',
      'provider_cost_tables', 'client_routes', 'agents', 'provider_agents', 'profiles',
      'commercial_proposals', 'quotes', 'contracts', 'financial_accounts', 'financial_categories',
    ];
    const requested = body?.tables;
    const targetTables = Array.isArray(requested) && requested.length > 0
      ? requested.filter((table: string) => allowedTables.includes(table))
      : ['missions', 'system_logs', 'mission_logs', 'financial_transactions'];
    const results: any[] = [];

    for (const table of targetTables) {
      try {
        const { count } = await client.from(table).select('*', { count: 'exact', head: true });
        results.push({
          table,
          status: 'ok',
          rows: count || 0,
          dead_rows_before: 0,
          note: 'count-only',
        });
      } catch (error) {
        results.push({
          table,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return ok({
      success: true,
      method: 'supabase-api',
      message: 'Use o painel do Supabase para executar VACUUM. Contagens de registros foram atualizadas.',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return fail(500, error);
  }
}

export async function runF4PlatformCostsOperation(
  op: 'costs' | 'overrides',
  body: any,
  client: SupabaseClient,
  env: EnvLike = process.env,
): Promise<F4ApiResult> {
  try {
    if (op === 'overrides') {
      const overrides = body?.overrides;
      if (!overrides || typeof overrides !== 'object') {
        return { status: 400, body: { error: 'overrides inválidos' } };
      }
      for (const [key, value] of Object.entries(overrides)) {
        await client.from('platform_cost_overrides').upsert({
          key,
          value: Number(value) || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      }
      return ok({ success: true, saved: Object.keys(overrides).length });
    }

    const overrides: Record<string, number> = {};
    try {
      const { data: rows } = await client.from('platform_cost_overrides').select('key, value');
      if (rows) {
        for (const row of rows) overrides[row.key] = Number(row.value) || 0;
      }
    } catch {
      // Mantém defaults de ENV se a tabela não existir.
    }

    const brlRate = overrides.usd_to_brl || Number(env.USD_TO_BRL || 5.80);
    const replitPlans: Record<string, { usd: number; label: string }> = {
      Free: { usd: 0, label: 'Free' },
      Starter: { usd: 9, label: 'Starter ($9/mês)' },
      Hacker: { usd: 7, label: 'Hacker ($7/mês)' },
      Core: { usd: 25, label: 'Core ($25/mês)' },
      Pro: { usd: 20, label: 'Pro ($20/mês)' },
      Teams: { usd: 25, label: 'Teams ($25/mês)' },
    };
    const supabasePlans: Record<string, { usd: number; label: string }> = {
      Free: { usd: 0, label: 'Free Tier' },
      Pro: { usd: 25, label: 'Pro ($25/mês)' },
      Team: { usd: 599, label: 'Team ($599/mês)' },
    };
    const replitPlan = env.REPLIT_PLAN || 'Core';
    const supabasePlan = env.SUPABASE_PLAN || 'Pro';
    const replitBase = replitPlans[replitPlan] || replitPlans.Core;
    const supabaseBase = supabasePlans[supabasePlan] || supabasePlans.Pro;

    const replitExtraEgress = overrides.replit_egress ?? Number(env.REPLIT_EXTRA_EGRESS_USD || 0);
    const replitExtraCompute = overrides.replit_compute ?? Number(env.REPLIT_EXTRA_COMPUTE_USD || 0);
    const replitExtraStorage = overrides.replit_storage ?? Number(env.REPLIT_EXTRA_STORAGE_USD || 0);
    const replitExtraAlwaysOn = overrides.replit_always_on ?? 0;
    const replitExtraOther = overrides.replit_other ?? 0;
    const supabaseExtraDb = overrides.supabase_db ?? Number(env.SUPABASE_EXTRA_DB_USD || 0);
    const supabaseExtraBandwidth = overrides.supabase_bandwidth ?? Number(env.SUPABASE_EXTRA_BANDWIDTH_USD || 0);
    const supabaseExtraStorage = overrides.supabase_storage ?? Number(env.SUPABASE_EXTRA_STORAGE_USD || 0);
    const googleMaps = overrides.google_maps ?? Number(env.GOOGLE_MAPS_MONTHLY_USD || 0);
    const resend = overrides.resend ?? Number(env.RESEND_MONTHLY_USD || 0);
    const otherApis = overrides.other_apis ?? Number(env.OTHER_MONTHLY_COSTS_USD || 0);
    const replitTotalUsd =
      replitBase.usd + replitExtraEgress + replitExtraCompute + replitExtraStorage
      + replitExtraAlwaysOn + replitExtraOther;
    const supabaseTotalUsd =
      supabaseBase.usd + supabaseExtraDb + supabaseExtraBandwidth + supabaseExtraStorage;
    const apiTotalUsd = googleMaps + resend + otherApis;
    const totalUsd = replitTotalUsd + supabaseTotalUsd + apiTotalUsd;
    const toBrl = (value: number) => +(value * brlRate).toFixed(2);
    const savingTips = [
      {
        area: 'Replit',
        tip: 'Configure o Repl para hibernar após inatividade. O Always-On consome créditos mesmo sem tráfego.',
        impact: 'Alto',
        action: 'Desative Always-On se o sistema não precisa estar 24/7 disponível.',
      },
      {
        area: 'Google Maps',
        tip: 'Cache rotas calculadas localmente. Cada chamada de Directions API custa ~$0.005-$0.01.',
        impact: 'Alto',
        action: 'Salve totalDistance e estimatedTime na missão ao calcular a rota pela primeira vez.',
      },
      {
        area: 'Gemini AI',
        tip: 'As chamadas AI via Replit Integrations são gratuitas. Aproveite para chatbot, auditoria e análises.',
        impact: 'Info',
        action: 'Continue usando o Gemini via Replit AI Integrations (sem custo adicional).',
      },
      {
        area: 'Supabase',
        tip: 'Adicione índices nas colunas mais consultadas (client, status, created_at) para reduzir tempo de query.',
        impact: 'Médio',
        action: 'CREATE INDEX idx_missions_client ON missions(client); CREATE INDEX idx_missions_status ON missions(status);',
      },
      {
        area: 'Replit',
        tip: 'Use variáveis de ambiente ao invés de hardcode para trocar de plano sem alterar código.',
        impact: 'Baixo',
        action: 'Defina REPLIT_PLAN, SUPABASE_PLAN, DB_CAPACITY_GB no painel de Secrets.',
      },
      {
        area: 'Geral',
        tip: 'Monitore o consumo mensal de bandwidth do Supabase. O Free Tier tem 2GB/mês de transferência.',
        impact: 'Médio',
        action: 'Verifique o dashboard do Supabase em Usage > Bandwidth mensalmente.',
      },
    ];
    if (supabasePlan === 'Free') {
      savingTips.unshift(
        {
          area: 'Supabase',
          tip: 'Limpe registros antigos de system_logs periodicamente para economizar espaço no banco Free Tier (500MB).',
          impact: 'Médio',
          action: "DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '90 days'",
        },
        {
          area: 'Supabase',
          tip: 'Comprima imagens antes de fazer upload no Storage para reduzir os 1GB gratuitos.',
          impact: 'Baixo',
          action: 'Use ferramentas como TinyPNG ou compressão no frontend antes do upload.',
        },
      );
    }

    return ok({
      currency_rate: brlRate,
      replit: {
        plan: replitBase.label,
        base_usd: replitBase.usd,
        base_brl: toBrl(replitBase.usd),
        extras: {
          egress: { usd: replitExtraEgress, brl: toBrl(replitExtraEgress) },
          compute: { usd: replitExtraCompute, brl: toBrl(replitExtraCompute) },
          storage: { usd: replitExtraStorage, brl: toBrl(replitExtraStorage) },
          always_on: { usd: replitExtraAlwaysOn, brl: toBrl(replitExtraAlwaysOn) },
          other: { usd: replitExtraOther, brl: toBrl(replitExtraOther) },
        },
        total_usd: replitTotalUsd,
        total_brl: toBrl(replitTotalUsd),
      },
      supabase: {
        plan: supabaseBase.label,
        base_usd: supabaseBase.usd,
        base_brl: toBrl(supabaseBase.usd),
        extras: {
          db: { usd: supabaseExtraDb, brl: toBrl(supabaseExtraDb) },
          bandwidth: { usd: supabaseExtraBandwidth, brl: toBrl(supabaseExtraBandwidth) },
          storage: { usd: supabaseExtraStorage, brl: toBrl(supabaseExtraStorage) },
        },
        total_usd: supabaseTotalUsd,
        total_brl: toBrl(supabaseTotalUsd),
        db_capacity_gb: Number(env.DB_CAPACITY_GB || 8),
      },
      apis: {
        google_maps: { usd: googleMaps, brl: toBrl(googleMaps) },
        resend: { usd: resend, brl: toBrl(resend) },
        other: { usd: otherApis, brl: toBrl(otherApis) },
        total_usd: apiTotalUsd,
        total_brl: toBrl(apiTotalUsd),
      },
      total_usd: totalUsd,
      total_brl: toBrl(totalUsd),
      saving_tips: savingTips,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    return fail(500, error);
  }
}

export async function runF4OperationalReportOperation(
  method: 'GET' | 'PATCH',
  missionId: string,
  body: any,
  client: SupabaseClient,
): Promise<F4ApiResult> {
  if (method === 'GET') {
    try {
      const { data: row } = await client
        .from('operational_reports')
        .select('*')
        .eq('mission_id', missionId)
        .maybeSingle();
      if (!row) return ok({ operational_report: null });
      return ok({
        operational_report: row.report_html,
        acionado_por: row.acionado_por || '',
        descritivo: row.descritivo || '',
        whatsapp_raw: row.whatsapp_raw || '',
        photos: row.photos || [],
      });
    } catch (error) {
      return ok({
        operational_report: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const payload = {
      mission_id: missionId,
      report_html: body?.operational_report || '',
      acionado_por: body?.acionado_por || '',
      descritivo: body?.descritivo || '',
      whatsapp_raw: body?.whatsapp_raw || '',
      photos: body?.photos || [],
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from('operational_reports')
      .upsert(payload, { onConflict: 'mission_id' });
    if (error) throw error;
    return ok({ ok: true });
  } catch (error) {
    return {
      status: 500,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export type F4ClientDataOp =
  | 'registries-init'
  | 'registries-list'
  | 'registries'
  | 'registries-item'
  | 'notes-item'
  | 'notes'
  | 'notes-bulk';

export async function runF4ClientDataOperation(
  op: F4ClientDataOp,
  input: Record<string, any>,
  client: SupabaseClient,
): Promise<F4ApiResult> {
  try {
    if (op === 'registries-init') {
      const checks = await Promise.allSettled([
        client.from('client_registries').select('id', { count: 'exact', head: true }),
        client.from('client_mission_notes').select('id', { count: 'exact', head: true }),
        client.from('operational_reports').select('id', { count: 'exact', head: true }),
        client.from('financial_invoices').select('id', { count: 'exact', head: true }),
      ]);
      void checks;
      return ok({ ok: true });
    }

    if (op === 'registries-list') {
      const { data } = await client
        .from('client_registries')
        .select('*')
        .eq('client_id', input.clientId)
        .eq('type', input.type)
        .order('name');
      return ok(data || []);
    }

    if (op === 'registries') {
      const { client_id, type, name } = input.body || {};
      if (!client_id || !type || !name) {
        return { status: 400, body: { error: 'Campos obrigatórios' } };
      }
      const { data, error } = await client
        .from('client_registries')
        .upsert({ client_id, type, name: name.trim() }, { onConflict: 'client_id,type,name' })
        .select()
        .single();
      if (error && error.code !== '23505') throw error;
      return ok(data || { client_id, type, name: name.trim() });
    }

    if (op === 'registries-item') {
      const { error } = await client.from('client_registries').delete().eq('id', input.id);
      if (error) throw error;
      return ok({ ok: true });
    }

    if (op === 'notes-item') {
      const { data } = await client
        .from('client_mission_notes')
        .select('*')
        .eq('mission_id', input.missionId)
        .maybeSingle();
      return ok(data || null);
    }

    if (op === 'notes') {
      const {
        mission_id,
        client_id,
        motivo,
        contrato,
        operacao,
        tsp,
        responsavel,
        obs,
      } = input.body || {};
      if (!mission_id || !client_id) {
        return { status: 400, body: { error: 'Campos obrigatórios' } };
      }
      const payload = {
        mission_id,
        client_id,
        motivo: motivo || '',
        contrato: contrato || '',
        operacao: operacao || '',
        tsp: tsp || '',
        responsavel: responsavel || '',
        obs: obs || '',
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await client
        .from('client_mission_notes')
        .upsert(payload, { onConflict: 'mission_id' })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    }

    const { data } = await client
      .from('client_mission_notes')
      .select('*')
      .eq('client_id', input.clientId);
    return ok(data || []);
  } catch (error) {
    if (op === 'registries-list' || op === 'notes-bulk') return ok([]);
    if (op === 'notes-item') return ok(null);
    if (op === 'registries-init') {
      return ok({
        ok: true,
        note: error instanceof Error ? error.message : String(error),
      });
    }
    return fail(500, error);
  }
}
