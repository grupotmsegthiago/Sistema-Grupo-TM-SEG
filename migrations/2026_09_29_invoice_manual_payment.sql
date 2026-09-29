-- Controle de Faturas: lista no servidor local (chave anon) e baixa manual.
-- A baixa grava evidência, data do pagamento, quem registrou e quando.
-- O valor (amount) da fatura não é alterado.

ALTER TABLE public.financial_invoices
  ADD COLUMN IF NOT EXISTS manual_payment_date date,
  ADD COLUMN IF NOT EXISTS manual_payment_evidence_url text,
  ADD COLUMN IF NOT EXISTS manual_payment_by text,
  ADD COLUMN IF NOT EXISTS manual_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_payment_note text;

DROP POLICY IF EXISTS financial_invoices_anon_select ON public.financial_invoices;
CREATE POLICY financial_invoices_anon_select
  ON public.financial_invoices
  FOR SELECT
  TO anon
  USING (true);

CREATE OR REPLACE FUNCTION public.registrar_baixa_manual_fatura(
  p_invoice_id uuid,
  p_payment_date date,
  p_evidence_url text,
  p_registered_by text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.financial_invoices%ROWTYPE;
  v_tx int := 0;
  v_note text;
  v_line text;
  v_number text;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Fatura inválida';
  END IF;
  IF p_payment_date IS NULL OR p_payment_date > (timezone('America/Sao_Paulo', now()))::date THEN
    RAISE EXCEPTION 'Informe a data do pagamento (não pode ser futura)';
  END IF;
  IF p_evidence_url IS NULL OR btrim(p_evidence_url) !~* '^https://' THEN
    RAISE EXCEPTION 'Anexe a evidência do extrato';
  END IF;
  IF p_registered_by IS NULL OR length(btrim(p_registered_by)) < 2 THEN
    RAISE EXCEPTION 'Não foi possível identificar quem registrou';
  END IF;

  SELECT * INTO v_inv
  FROM public.financial_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;
  IF upper(coalesce(v_inv.status, '')) = 'CANCELADA' THEN
    RAISE EXCEPTION 'Fatura cancelada não recebe baixa';
  END IF;
  IF upper(coalesce(v_inv.status, '')) = 'PAGA' THEN
    RAISE EXCEPTION 'Esta fatura já está paga';
  END IF;

  v_note := NULLIF(btrim(coalesce(p_note, '')), '');
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    v_note := left(v_note, 500);
  END IF;

  v_line := 'Baixa manual: pagamento em ' || to_char(p_payment_date, 'DD/MM/YYYY')
    || ' registrado por ' || btrim(p_registered_by)
    || ' em ' || to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY HH24:MI');

  UPDATE public.financial_invoices
  SET status = 'PAGA',
      manual_payment_date = p_payment_date,
      manual_payment_evidence_url = left(btrim(p_evidence_url), 2000),
      manual_payment_by = left(btrim(p_registered_by), 160),
      manual_payment_at = now(),
      manual_payment_note = v_note,
      notes = concat_ws(E'\n', NULLIF(notes, ''), v_line),
      nf_history = coalesce(nf_history, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'action', 'manual-payment',
          'status', 'PAGA',
          'message', v_line
        )
      )
  WHERE id = p_invoice_id;

  v_number := replace(replace(btrim(coalesce(v_inv.number, '')), '%', ''), '_', '');
  IF v_number <> '' THEN
    BEGIN
      UPDATE public.financial_transactions
      SET status = 'PAID',
          payment_date = p_payment_date
      WHERE description ILIKE '%' || v_number || '%'
        AND status = 'PENDING';
      GET DIAGNOSTICS v_tx = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      UPDATE public.financial_transactions
      SET status = 'PAID',
          payment_date = p_payment_date
      WHERE description ILIKE '%' || v_number || '%'
        AND status = 'PENDING';
      GET DIAGNOSTICS v_tx = ROW_COUNT;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoiceId', p_invoice_id,
    'number', v_inv.number,
    'transactions', v_tx
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_baixa_manual_fatura(uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_manual_fatura(uuid, date, text, text, text) TO anon, authenticated, service_role;
