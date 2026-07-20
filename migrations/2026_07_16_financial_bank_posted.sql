-- Flag visual: lançamento já registrado no banco (Contas a Pagar)
-- Execute no Supabase SQL Editor se exec_sql não estiver disponível.
-- Arquivo espelho: scripts/financial-bank-posted.sql

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS bank_posted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_transactions.bank_posted IS
  'true = título já lançado/registrado no extrato do banco (controle visual Contas a Pagar)';

CREATE INDEX IF NOT EXISTS idx_financial_transactions_bank_posted
  ON public.financial_transactions (bank_posted)
  WHERE bank_posted = true;
