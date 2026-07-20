-- Execute no Supabase SQL Editor (Contas a Pagar — flag Lançado no Banco)
-- Arquivo espelho: migrations/2026_07_16_financial_bank_posted.sql

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS bank_posted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_transactions.bank_posted IS
  'true = título já lançado/registrado no extrato do banco (controle visual Contas a Pagar)';

CREATE INDEX IF NOT EXISTS idx_financial_transactions_bank_posted
  ON public.financial_transactions (bank_posted)
  WHERE bank_posted = true;
