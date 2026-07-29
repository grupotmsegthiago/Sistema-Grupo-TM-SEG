-- Pedidos de análise de OS (Diretoria → Bárbara/Giovanna) + resposta com motivo e delta financeiro
CREATE TABLE IF NOT EXISTS os_analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT NOT NULL,
  client_name TEXT,
  provider_name TEXT,
  requested_by TEXT NOT NULL,
  request_note TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'audit',
  status TEXT NOT NULL DEFAULT 'pending',
  revenue_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  result_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjusted_by TEXT,
  adjusted_at TIMESTAMPTZ,
  adjustment_reason TEXT,
  revenue_after NUMERIC(14,2),
  cost_after NUMERIC(14,2),
  result_after NUMERIC(14,2),
  result_delta NUMERIC(14,2),
  changes_summary TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_analysis_mission ON os_analysis_requests (mission_id);
CREATE INDEX IF NOT EXISTS idx_os_analysis_status ON os_analysis_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_analysis_pending ON os_analysis_requests (created_at DESC) WHERE status = 'pending';
