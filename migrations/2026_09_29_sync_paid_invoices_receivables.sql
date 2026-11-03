-- Reaplica a baixa manual: o titulo e achado pelo numero na observacao, no Asaas ou na descricao.

CREATE OR REPLACE FUNCTION public.registrar_baixa_manual_fatura(
  p_invoice_id uuid,
  p_payment_date date,
  p_evidence_url text,
  p_registered_by text,
  p_note text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
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
  v_invoice_amount numeric(14,2);
  v_received numeric(14,2);
  v_interest numeric(14,2);
  v_reason text;
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

  v_invoice_amount := round(coalesce(v_inv.amount, 0)::numeric, 2);
  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'Informe o valor recebido';
  END IF;
  v_received := round(p_amount, 2);
  IF v_received <= 0 THEN
    RAISE EXCEPTION 'Informe o valor recebido';
  END IF;
  IF v_received + 0.009 < v_invoice_amount THEN
    RAISE EXCEPTION 'O valor informado é menor que o da fatura';
  END IF;
  v_interest := round(GREATEST(v_received - v_invoice_amount, 0), 2);
  v_reason := NULLIF(left(btrim(coalesce(p_reason, '')), 500), '');
  IF v_interest <= 0.009 AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'No valor da fatura, informe o motivo';
  END IF;

  v_note := NULLIF(btrim(coalesce(p_note, '')), '');
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    v_note := left(v_note, 500);
  END IF;

  v_line := 'Baixa manual: pagamento em ' || to_char(p_payment_date, 'DD/MM/YYYY')
    || ' registrado por ' || btrim(p_registered_by)
    || ' em ' || to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY HH24:MI')
    || '. Valor recebido R$ ' || trim(to_char(v_received, '999999990.00'));
  IF v_interest > 0.009 THEN
    v_line := v_line || '. Juros R$ ' || trim(to_char(v_interest, '999999990.00'))
      || ' sobre o valor da fatura R$ ' || trim(to_char(v_invoice_amount, '999999990.00'));
  END IF;
  IF v_reason IS NOT NULL THEN
    v_line := v_line || '. Motivo: ' || v_reason;
  END IF;

  UPDATE public.financial_invoices
  SET status = 'PAGA',
      manual_payment_date = p_payment_date,
      manual_payment_evidence_url = left(btrim(p_evidence_url), 2000),
      manual_payment_by = left(btrim(p_registered_by), 160),
      manual_payment_at = now(),
      manual_payment_note = v_note,
      manual_payment_amount = v_received,
      manual_payment_interest = v_interest,
      manual_payment_reason = v_reason,
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
          payment_date = p_payment_date,
          doc_comprovante_url = left(btrim(p_evidence_url), 2000),
          doc_comprovante_status = 'ok',
          manual_payment_amount = v_received,
          manual_payment_interest = v_interest,
          manual_payment_reason = v_reason,
          notes = concat_ws(E'\n', NULLIF(notes, ''), v_line)
      WHERE type = 'INCOME'
        AND upper(coalesce(status, '')) IN ('PENDING', 'OVERDUE', 'PAID')
        AND (
          strpos(coalesce(notes, ''), 'Fatura ' || btrim(coalesce(v_inv.number, ''))) > 0
          OR (
            nullif(btrim(coalesce(v_inv.asaas_payment_id, '')), '') IS NOT NULL
            AND strpos(coalesce(notes, ''), btrim(v_inv.asaas_payment_id)) > 0
          )
          OR strpos(coalesce(description, ''), btrim(coalesce(v_inv.number, ''))) > 0
        );
      GET DIAGNOSTICS v_tx = ROW_COUNT;
    EXCEPTION WHEN undefined_column THEN
      UPDATE public.financial_transactions
      SET status = 'PAID',
          payment_date = p_payment_date,
          notes = concat_ws(E'\n', NULLIF(notes, ''), v_line)
      WHERE type = 'INCOME'
        AND upper(coalesce(status, '')) IN ('PENDING', 'OVERDUE', 'PAID')
        AND (
          strpos(coalesce(notes, ''), 'Fatura ' || btrim(coalesce(v_inv.number, ''))) > 0
          OR (
            nullif(btrim(coalesce(v_inv.asaas_payment_id, '')), '') IS NOT NULL
            AND strpos(coalesce(notes, ''), btrim(v_inv.asaas_payment_id)) > 0
          )
          OR strpos(coalesce(description, ''), btrim(coalesce(v_inv.number, ''))) > 0
        );
      GET DIAGNOSTICS v_tx = ROW_COUNT;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoiceId', p_invoice_id,
    'number', v_inv.number,
    'transactions', v_tx,
    'received', v_received,
    'interest', v_interest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_baixa_manual_fatura(uuid, date, text, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_baixa_manual_fatura(uuid, date, text, text, text, numeric, text) TO anon, authenticated, service_role;

-- Controle de NF conversa com Contas a Receber.
-- Fatura PAGA marca o título (número na observação, no Asaas ou na descrição).
-- Não altera amount. Não cria título que não existe. Não inventa data de pagamento.

CREATE OR REPLACE FUNCTION public.sincronizar_faturas_pagas_contas_receber()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  WITH matches AS (
    SELECT
      t.id AS tx_id,
      i.manual_payment_date,
      i.manual_payment_evidence_url,
      i.manual_payment_amount,
      i.manual_payment_interest,
      i.manual_payment_reason
    FROM public.financial_transactions t
    JOIN public.financial_invoices i
      ON upper(coalesce(i.status, '')) = 'PAGA'
     AND btrim(coalesce(i.number, '')) <> ''
     AND (
       strpos(coalesce(t.notes, ''), 'Fatura ' || btrim(i.number)) > 0
       OR (
         nullif(btrim(coalesce(i.asaas_payment_id, '')), '') IS NOT NULL
         AND strpos(coalesce(t.notes, ''), btrim(i.asaas_payment_id)) > 0
       )
       OR strpos(coalesce(t.description, ''), btrim(i.number)) > 0
     )
    WHERE t.type = 'INCOME'
      AND upper(coalesce(t.status, '')) IN ('PENDING', 'OVERDUE')
  ),
  unique_matches AS (
    SELECT *
    FROM matches m
    WHERE (
      SELECT count(*) FROM matches m2 WHERE m2.tx_id = m.tx_id
    ) = 1
  )
  UPDATE public.financial_transactions t
  SET status = 'PAID',
      payment_date = COALESCE(t.payment_date, u.manual_payment_date),
      doc_comprovante_url = COALESCE(
        t.doc_comprovante_url,
        NULLIF(left(btrim(coalesce(u.manual_payment_evidence_url, '')), 2000), '')
      ),
      doc_comprovante_status = CASE
        WHEN COALESCE(
          t.doc_comprovante_url,
          NULLIF(btrim(coalesce(u.manual_payment_evidence_url, '')), '')
        ) IS NOT NULL
          THEN COALESCE(NULLIF(t.doc_comprovante_status, ''), 'ok')
        ELSE t.doc_comprovante_status
      END,
      manual_payment_amount = COALESCE(t.manual_payment_amount, u.manual_payment_amount),
      manual_payment_interest = COALESCE(t.manual_payment_interest, u.manual_payment_interest),
      manual_payment_reason = COALESCE(t.manual_payment_reason, u.manual_payment_reason)
  FROM unique_matches u
  WHERE t.id = u.tx_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_faturas_pagas_contas_receber() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_faturas_pagas_contas_receber() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.sincronizar_faturas_pagas_contas_receber();
