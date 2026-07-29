export type OsAnalysisStatus = 'pending' | 'adjusted' | 'reviewed';

export type OsAnalysisRecipient = {
  id: string;
  name: string;
  email: string;
};

export interface OsAnalysisRequest {
  id: string;
  mission_id: string;
  client_name?: string | null;
  provider_name?: string | null;
  requested_by: string;
  request_note: string;
  source: string;
  status: OsAnalysisStatus | string;
  revenue_before: number;
  cost_before: number;
  result_before: number;
  adjusted_by?: string | null;
  adjusted_at?: string | null;
  adjustment_reason?: string | null;
  revenue_after?: number | null;
  cost_after?: number | null;
  result_after?: number | null;
  result_delta?: number | null;
  changes_summary?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  recipient_ids?: string[] | null;
  recipients?: OsAnalysisRecipient[] | null;
  claimed_by_id?: string | null;
  claimed_by_name?: string | null;
  claimed_at?: string | null;
  message_opened_at?: string | null;
}

/** Canal broadcast para refresh do modal “Um recado da Diretoria”. */
export const OS_ANALYSIS_BROADCAST_CHANNEL = 'os-analysis-inbox';
