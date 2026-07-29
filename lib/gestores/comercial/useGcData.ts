import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import type { Client, ClientPriceTable, Mission, ProviderCostTable } from '../../../types';
import { getGcUser, canViewGcStrategicMetrics } from './access';
import { loadGcSettings } from './settings';
import {
  buildAllowedClientNameSet,
  filterClientsByScope,
  filterMissionsByClientNames,
  isOwnerScoped,
} from './scope';
import { buildClientHealthCards, buildTopLists, computeGcDashboardKpis } from './kpis';
import { buildRuleInsights, enrichInsightsWithAi } from './insights';
import type {
  GcAgendaItem,
  GcClientHealth,
  GcCommissionPlan,
  GcDashboardKpis,
  GcInsight,
  GcOpportunity,
  GcRep,
  GcSettingsMap,
} from './types';
import { GC_DEFAULT_SETTINGS } from './settings';

export interface UseGcDataResult {
  loading: boolean;
  error: string | null;
  settings: GcSettingsMap;
  kpis: GcDashboardKpis | null;
  health: GcClientHealth[];
  tops: ReturnType<typeof buildTopLists>;
  insights: GcInsight[];
  reps: GcRep[];
  plans: GcCommissionPlan[];
  opportunities: GcOpportunity[];
  agenda: GcAgendaItem[];
  hideStrategic: boolean;
  refresh: () => Promise<void>;
  enrichAi: () => Promise<void>;
  aiLoading: boolean;
}

const emptyTops = buildTopLists([]);

export function useGcData(): UseGcDataResult {
  const user = useMemo(() => getGcUser(), []);
  const hideStrategic = !canViewGcStrategicMetrics(user);

  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GcSettingsMap>(GC_DEFAULT_SETTINGS);
  const [kpis, setKpis] = useState<GcDashboardKpis | null>(null);
  const [health, setHealth] = useState<GcClientHealth[]>([]);
  const [tops, setTops] = useState(emptyTops);
  const [insights, setInsights] = useState<GcInsight[]>([]);
  const [reps, setReps] = useState<GcRep[]>([]);
  const [plans, setPlans] = useState<GcCommissionPlan[]>([]);
  const [opportunities, setOpportunities] = useState<GcOpportunity[]>([]);
  const [agenda, setAgenda] = useState<GcAgendaItem[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await loadGcSettings();
      setSettings(cfg);

      const [
        clientsRes,
        missionsRes,
        clientTablesRes,
        providerTablesRes,
        quotesRes,
        repsRes,
        plansRes,
        tiersRes,
        oppsRes,
        agendaRes,
      ] = await Promise.all([
        supabase.from('clients').select('id, name, trading_name, status, created_by, created_at').limit(5000),
        supabase.from('missions').select('*').order('created_at', { ascending: false }).limit(8000),
        supabase.from('client_price_tables').select('*').limit(5000),
        supabase.from('provider_cost_tables').select('*').limit(5000),
        supabase.from('quotes').select('id, status, total_value, client_id, created_by').limit(3000),
        supabase.from('gc_reps').select('*').is('deleted_at', null).limit(500),
        supabase.from('gc_commission_plans').select('*').is('deleted_at', null).limit(200),
        supabase.from('gc_commission_tiers').select('*').limit(1000),
        supabase.from('gc_opportunities').select('*').is('deleted_at', null).limit(2000),
        supabase.from('gc_agenda_items').select('*').is('deleted_at', null).order('due_at', { ascending: true }).limit(2000),
      ]);

      // Tabelas GC podem não existir ainda — ignora erros específicos
      const clients = filterClientsByScope((clientsRes.data || []) as Client[], user);
      const allowedNames = buildAllowedClientNameSet(clients as any, user);
      const missions = filterMissionsByClientNames((missionsRes.data || []) as Mission[], allowedNames);
      const refs = {
        clientTables: (clientTablesRes.data || []) as ClientPriceTable[],
        providerTables: (providerTablesRes.data || []) as ProviderCostTable[],
        clientsData: clients as Client[],
      };

      let quotes = (quotesRes.data || []) as Array<{ status: string; total_value?: number; created_by?: string; client_id?: string }>;
      if (isOwnerScoped(user)) {
        const name = String(user.name || '').trim();
        const clientIds = new Set(clients.map((c) => c.id));
        quotes = quotes.filter((q) => q.created_by === name || (q.client_id && clientIds.has(q.client_id)));
      }

      const planRows = (plansRes.data || []) as GcCommissionPlan[];
      const tiers = tiersRes.data || [];
      const plansWithTiers = planRows.map((p) => ({
        ...p,
        tiers: tiers.filter((t: any) => t.plan_id === p.id),
      }));
      setPlans(plansWithTiers);

      const repRows = (repsRes.data || []) as GcRep[];
      setReps(repRows);

      const myRep = repRows.find(
        (r) =>
          r.user_id === user.id ||
          r.full_name?.toLowerCase() === String(user.name || '').toLowerCase(),
      );
      const myPlan = plansWithTiers.find((p) => p.id === myRep?.commission_plan_id) || null;
      const monthlyGoal = myRep?.monthly_goal || cfg.default_monthly_goal;

      const kpi = computeGcDashboardKpis({
        missions,
        refs,
        quotes,
        monthlyGoal,
        commissionPlan: myPlan,
        commissionPercentFallback: myRep?.commission_percent || 0,
        hideStrategic,
      });
      setKpis(kpi);

      const agendaRows = (agendaRes.error ? [] : agendaRes.data || []) as GcAgendaItem[];
      const scopedAgenda = isOwnerScoped(user)
        ? agendaRows.filter(
            (a) =>
              a.responsible_name === user.name ||
              a.rep_id === myRep?.id ||
              a.created_by === user.name,
          )
        : agendaRows;
      setAgenda(scopedAgenda as any);

      const agendaByClient = new Map<string, { last?: string; next?: string }>();
      for (const a of scopedAgenda) {
        if (!a.client_id) continue;
        const cur = agendaByClient.get(a.client_id) || {};
        if (a.status === 'concluido' || a.status === 'concluído') {
          if (!cur.last || a.due_at > cur.last) cur.last = a.due_at;
        } else if (a.status === 'pendente' || a.status === 'atrasado') {
          if (!cur.next || a.due_at < cur.next) cur.next = a.due_at;
        }
        agendaByClient.set(a.client_id, cur);
      }

      const healthCards = buildClientHealthCards({
        clients: clients as any,
        missions,
        refs,
        settings: cfg,
        agendaByClient,
        hideStrategic,
      });
      setHealth(healthCards);
      setTops(buildTopLists(healthCards, 10));

      const ruleInsights = buildRuleInsights({
        health: healthCards,
        settings: cfg,
        hideStrategic,
        max: 30,
      });
      setInsights(ruleInsights);

      let opps = (oppsRes.error ? [] : oppsRes.data || []) as GcOpportunity[];
      if (isOwnerScoped(user)) {
        opps = opps.filter((o) => o.rep_id === myRep?.id || o.created_by === user.name);
      }
      setOpportunities(opps);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar Gestor Comercial');
    } finally {
      setLoading(false);
    }
  }, [user, hideStrategic]);

  const enrichAi = useCallback(async () => {
    setAiLoading(true);
    try {
      const enriched = await enrichInsightsWithAi(insights, {
        hideStrategic,
        userName: user.name || undefined,
      });
      setInsights(enriched);
    } finally {
      setAiLoading(false);
    }
  }, [insights, hideStrategic, user.name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    error,
    settings,
    kpis,
    health,
    tops,
    insights,
    reps,
    plans,
    opportunities,
    agenda,
    hideStrategic,
    refresh,
    enrichAi,
    aiLoading,
  };
}
