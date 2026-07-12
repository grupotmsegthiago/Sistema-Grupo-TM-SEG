import type { Client, ClientPriceTable, FinancialCategory, FinancialTransaction, Mission, ProviderCostTable } from '../../types';

export type DiretoriaTab = 'geral' | 'financeiro' | 'operacao' | 'clientes' | 'rh';

export interface DashboardPeriod {
  year: number;
  month: number; // 0–11
}

export interface CriticalAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  actionScreen?: string;
}

export interface PendingApprovalItem {
  id: string;
  label: string;
  amount: number;
  kind: 'mission' | 'quote' | 'transaction';
}

export interface DashboardRefs {
  clientTables: ClientPriceTable[];
  providerTables: ProviderCostTable[];
  clientsData: Client[];
}

export interface DashboardDiretoriaData {
  loading: boolean;
  error: string | null;
  period: DashboardPeriod;
  periodLabel: string;
  missions: Mission[];
  transactions: FinancialTransaction[];
  categories: FinancialCategory[];
  quotes: Array<{
    id: string;
    client_name: string;
    status: string;
    total_value: number;
    created_at: string;
  }>;
  refs: DashboardRefs;
  accountBalance: number;
  rhSnapshot: {
    totalEmployees: number;
    activeEmployees: number;
    payrollPreview: number;
    commissionsPending: number;
    bonuses: number;
  };
  refresh: () => void;
}

export const MARGIN_GOAL_PCT = 40;
export const DEFAULT_MONTHLY_REVENUE_GOAL = 700_000;
