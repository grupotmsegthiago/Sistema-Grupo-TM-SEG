import { useEffect, useRef, useCallback } from 'react';
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
};

const DEBOUNCE_MS = 500;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const pendingTablesRef = useRef<Set<TableName>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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

    const handleChange = (table: TableName) => {
      pendingTablesRef.current.add(table);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    let channel = supabase.channel('global-realtime-sync');

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => handleChange(table)
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Conectado — sincronização ativa em', REALTIME_TABLES.length, 'tabelas');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Realtime] Erro no canal — tentando reconectar...');
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
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
