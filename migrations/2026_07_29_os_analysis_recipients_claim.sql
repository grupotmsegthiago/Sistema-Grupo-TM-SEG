-- Destinatários escolhidos + claim (um abre → libera os demais)
ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS recipient_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS recipients JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS claimed_by_id TEXT;

ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS claimed_by_name TEXT;

ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE os_analysis_requests
  ADD COLUMN IF NOT EXISTS message_opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_os_analysis_recipient_ids
  ON os_analysis_requests USING GIN (recipient_ids);

CREATE INDEX IF NOT EXISTS idx_os_analysis_claimed
  ON os_analysis_requests (claimed_by_id)
  WHERE status = 'pending';
