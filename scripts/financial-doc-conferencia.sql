-- Execute no Supabase SQL Editor (Contas a Pagar — conferência BOL/NF/COMP)
-- Arquivo espelho: migrations/2026_07_07_financial_doc_conferencia.sql

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS doc_boleto_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_boleto_status TEXT DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS doc_nf_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_nf_status TEXT DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS doc_comprovante_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_comprovante_status TEXT DEFAULT 'empty';
