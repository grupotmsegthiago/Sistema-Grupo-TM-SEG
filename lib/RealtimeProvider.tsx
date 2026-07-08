import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { queryClient } from './queryClient';

const REALTIME_TABLES = [
  'missions',
  'clients',
  'providers',
  'vehicles',
  'agents',
  'profiles',
  'client_price_tables',
  'client_routes',
  'client_vehicles',
  'provider_cost_tables',
  'financial_transactions',
  'financial_accounts',
  'financial_categories',
  'financial_invoices',
  'quotes',
  'commercial_proposals',
  'support_agents',
  'time_clock',
  'vehicle_technologies',
  'system_users',
  'whatsapp_messages',
  'system_logs',
  'mission_logs',
  'dhl_supplier_intakes',
  'rh_employees',
  'rh_departments',
  'rh_positions',
  'rh_payroll_runs',
  'patrimonio_equipments',
  // === expansão jul/2026: tabelas com escrita em runtime e valor operacional ===
  'rh_salary_configs',
  'rh_commissions',
  'rh_awards',
  'rh_bonuses',
  'rh_payroll_items',
  'rh_employee_bank_accounts',
  'rh_employee_documents',
  'rh_warnings',
  'mission_history',
  'provider_escoltistas',
  'provider_intake_vehicles',
  'dhl_supplier_intake_resends',
  'client_registries',
  'client_mission_notes',
  'operational_reports',
  'monitored_processes',
  'system_settings',
  'whatsapp_instances',
] as const;

type TableName = (typeof REALTIME_TABLES)[number];

const TABLE_TO_QUERY_KEYS: Record<TableName, string[][]> = {
  missions: [],
  clients: [['clients']],
  providers: [['providers']],
  vehicles: [['vehicles']],
  agents: [['agents']],
  profiles: [['profiles']],
  client_price_tables: [['client_price_tables'], ['clients']],
  client_routes: [['client_routes'], ['clients']],
  client_vehicles: [['client_vehicles'], ['clients']],
  provider_cost_tables: [['provider_cost_tables'], ['providers']],
  financial_transactions: [['financial-dashboard'], ['financial_transactions']],
  financial_accounts: [['financial-dashboard'], ['financial_accounts']],
  financial_categories: [['financial-dashboard'], ['financial_categories']],
  financial_invoices: [['financial-dashboard'], ['financial_invoices']],
  quotes: [['quotes']],
  commercial_proposals: [['commercial_proposals']],
  support_agents: [['support_agents']],
  time_clock: [['time_clock']],
  vehicle_technologies: [['vehicle_technologies']],
  system_users: [['system_users']],
  whatsapp_messages: [['whatsapp_messages']],
  system_logs: [['system_logs']],
  mission_logs: [['mission_logs']],
  dhl_supplier_intakes: [],
  rh_employees: [['rh_employees']],
  rh_departments: [['rh_departments']],
  rh_positions: [['rh_positions']],
  rh_payroll_runs: [['rh_payroll_runs']],
  patrimonio_equipments: [['patrimonio_equipments']],
  // Novas tabelas — nenhuma delas usa ReactQuery hoje; hooks manuais escutam via
  // window event `supabase:<table>` disparado no flush. Se algum dia migrar para
  // ReactQuery, basta acrescentar a chave aqui.
  rh_salary_configs: [],
  rh_commissions: [],
  rh_awards: [],
  rh_bonuses: [],
  rh_payroll_items: [],
  rh_employee_bank_accounts: [],
  rh_employee_documents: [],
  rh_warnings: [],
  mission_history: [],
  provider_escoltistas: [],
  provider_intake_vehicles: [],
  dhl_supplier_intake_resends: [],
  client_registries: [],
  client_mission_notes: [],
  operational_reports: [],
  monitored_processes: [],
  system_settings: [],
  whatsapp_instances: [],
};

const DEBOUNCE_MS = 500;
const RECONNECT_MS = 3000;
const GLOBAL_REALTIME_CHANNEL = 'global-realtime-sync';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const pendingTablesRef = useRef<Set<TableName>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const flush = () => {
      const tables = new Set(pendingTablesRef.current);
      pendingTablesRef.current.clear();

      const alreadyInvalidated = new Set<string>();

      for (const table of tables) {
        window.dispatchEvent(new CustomEvent(`supabase:${table}`));

        const keys = TABLE_TO_QUERY_KEYS[table];
        if (keys) {
          for (const key of keys) {
            const keyStr = JSON.stringify(key);
            if (!alreadyInvalidated.has(keyStr)) {
              alreadyInvalidated.add(keyStr);
              queryClient.invalidateQueries({ queryKey: key });
            }
          }
        }
      }

      if (tables.has('missions') || tables.has('dhl_supplier_intakes')) {
        window.dispatchEvent(new CustomEvent('refreshMissions'));
      }
    };

    const handleChange = (table: TableName, payload?: unknown) => {
      window.dispatchEvent(new CustomEvent(`supabase:${table}:realtime`, { detail: payload }));
      pendingTablesRef.current.add(table);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const setupGlobalChannel = () => {
      if (cancelled) return;

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      let channel = supabase.channel(GLOBAL_REALTIME_CHANNEL);

      for (const table of REALTIME_TABLES) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => handleChange(table, payload)
        );
      }

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Conectado — sincronização ativa em', REALTIME_TABLES.length, 'tabelas');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] Canal global ${status} — reconectando em ${RECONNECT_MS / 1000}s...`);
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!cancelled) setupGlobalChannel();
          }, RECONNECT_MS);
        }
      });

      channelRef.current = channel;
    };

    setupGlobalChannel();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}

export function useRealtimeRefresh(tables: string | string[], callback: () => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const stableTables = useRef(typeof tables === 'string' ? [tables] : tables);

  useEffect(() => {
    const handler = () => cbRef.current();
    for (const t of stableTables.current) {
      window.addEventListener(`supabase:${t}`, handler);
    }
    return () => {
      for (const t of stableTables.current) {
        window.removeEventListener(`supabase:${t}`, handler);
      }
    };
  }, []);
}
