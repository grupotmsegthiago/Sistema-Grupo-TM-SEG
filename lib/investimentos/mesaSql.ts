/** SQL da Mesa de Trading — aplicado via ensure-schema (idempotente). */
export const GESTAO_INVESTIMENTO_MESA_SQL = `
-- Sleeve de trading + marcação manual de preço (sem API de corretora)
ALTER TABLE public.investor_profiles
  ADD COLUMN IF NOT EXISTS trading_sleeve_pct NUMERIC(8,4) DEFAULT 20;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS sleeve TEXT DEFAULT 'investimento';

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS last_mark_price NUMERIC(18,6);

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS last_mark_at TIMESTAMPTZ;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS target_sell_pct NUMERIC(8,4) DEFAULT 3;

ALTER TABLE public.investment_positions
  ADD COLUMN IF NOT EXISTS stop_loss_pct NUMERIC(8,4) DEFAULT 2;

-- Histórico de operações semi-manuais (você compra/vende no banco; o sistema registra)
CREATE TABLE IF NOT EXISTS public.investment_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  position_id UUID REFERENCES public.investment_positions(id) ON DELETE SET NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  instrument_name TEXT NOT NULL,
  instrument_code TEXT DEFAULT '',
  instrument_type TEXT NOT NULL DEFAULT 'acao',
  sleeve TEXT NOT NULL DEFAULT 'trading',
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  price NUMERIC(18,6) NOT NULL DEFAULT 0,
  amount_brl NUMERIC(18,2) NOT NULL DEFAULT 0,
  broker TEXT DEFAULT 'XP',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_note TEXT DEFAULT '',
  proof_image TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  rotated_buy_code TEXT DEFAULT '',
  rotated_buy_name TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_trades_owner_at
  ON public.investment_trades (owner_user_id, executed_at DESC);

ALTER TABLE public.investment_trades ENABLE ROW LEVEL SECURITY;
`;
