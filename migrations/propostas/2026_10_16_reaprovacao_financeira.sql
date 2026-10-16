-- Proposta. NÃO aplicar em produção sem autorização.
-- Não altera senha, perfil, permissão de usuário nem política já existente.
-- O bucket é privado. Sem política para anon/authenticated: só a service role grava e assina URL.

CREATE TABLE IF NOT EXISTS reaprovacao_financeira (
  id uuid PRIMARY KEY,
  tentativa_id text NOT NULL UNIQUE,
  mission_id text NOT NULL,
  os_numero text NOT NULL,
  incluido_por text,
  aprovado_originalmente_por text,
  aprovado_originalmente_em timestamptz,
  conferido_originalmente_por text,
  alterado_por text NOT NULL,
  reaprovado_por text NOT NULL,
  reaprovado_em timestamptz NOT NULL,
  justificativa text NOT NULL,
  campos jsonb NOT NULL,
  captura_antes_path text,
  captura_depois_path text,
  snapshot_original jsonb,
  valores_aplicados boolean NOT NULL DEFAULT false,
  notificacao_id uuid,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reaprovacao_financeira_mission
  ON reaprovacao_financeira (mission_id, reaprovado_em DESC);

CREATE TABLE IF NOT EXISTS reaprovacao_diretoria (
  id uuid PRIMARY KEY,
  reaprovacao_id uuid NOT NULL UNIQUE REFERENCES reaprovacao_financeira (id),
  situacao text NOT NULL DEFAULT 'pendente',
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reaprovacao_financeira ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaprovacao_diretoria ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reaprovacao-financeira', 'reaprovacao-financeira', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Uma transação só: trava a tentativa, trava a linha da OS, revalida e grava
-- valor + evento + notificação. Qualquer erro antes do RETURN final desfaz tudo,
-- porque a função não faz COMMIT próprio e não engole exceção depois de gravar.
CREATE OR REPLACE FUNCTION public.reaprovar_os_financeira(
  p_tentativa_id text,
  p_mission_id text,
  p_receita_nova numeric,
  p_custo_novo numeric,
  p_receita_esperada numeric,
  p_custo_esperado numeric,
  p_justificativa text,
  p_alterado_por text,
  p_captura_antes text,
  p_captura_depois text,
  p_quando timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existente reaprovacao_financeira%ROWTYPE;
  v_os missions%ROWTYPE;
  v_carimbo text;
  v_status text;
  v_paga boolean := false;
  v_antes_receita bigint;
  v_antes_custo bigint;
  v_esp_receita bigint;
  v_esp_custo bigint;
  v_nova_receita bigint;
  v_nova_custo bigint;
  v_mudou_receita boolean;
  v_mudou_custo boolean;
  v_evento_id uuid;
  v_aviso_id uuid;
  v_campos jsonb;
  v_carimbo_texto text;
  v_resumo jsonb;
BEGIN
  IF p_tentativa_id IS NULL OR p_mission_id IS NULL OR length(btrim(p_justificativa)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Justificativa ou identificação ausente. Nada foi alterado.');
  END IF;
  IF btrim(coalesce(p_captura_antes, '')) = '' OR btrim(coalesce(p_captura_depois, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'A evidência obrigatória não está no armazenamento. Nada foi alterado.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tentativa_id, 0));

  SELECT * INTO v_existente
  FROM reaprovacao_financeira
  WHERE tentativa_id = p_tentativa_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existente.status = 'concluida'
       AND v_existente.mission_id = p_mission_id
       AND v_existente.captura_antes_path IS NOT NULL
       AND v_existente.captura_depois_path IS NOT NULL
       AND v_existente.notificacao_id IS NOT NULL
       AND v_existente.valores_aplicados IS TRUE THEN
      RETURN jsonb_build_object('ok', true, 'repetida', true, 'evento', to_jsonb(v_existente));
    END IF;
    RETURN jsonb_build_object('ok', false, 'codigo', 'tentativa', 'erro', 'Esta tentativa já existe e não está concluída. Nada foi alterado.');
  END IF;

  SELECT * INTO v_os FROM missions WHERE id = p_mission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS não encontrada.');
  END IF;

  IF coalesce(v_os.negative_margin_locked, false) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS com prejuízo analisado. Somente a Diretoria altera, e esta ação não desbloqueia a trava.');
  END IF;
  IF length(btrim(coalesce(v_os.invoice_number, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS faturada. A reaprovação não desbloqueia a fatura.');
  END IF;

  v_status := lower(btrim(coalesce(v_os.status, '')));
  IF v_status LIKE '%faturad%' OR v_status LIKE '%encerrad%'
     OR v_status IN ('encerrada', 'encerrado', 'cancelada', 'cancelado', 'recusada', 'recusado') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS encerrada ou faturada. A reaprovação não reabre.');
  END IF;

  IF to_regclass('public.financial_invoice_missions') IS NOT NULL
     AND to_regclass('public.financial_invoices') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.financial_invoice_missions vim
        JOIN public.financial_invoices fi ON fi.id::text = vim.invoice_id::text
        WHERE vim.mission_id::text = $1
          AND upper(coalesce(fi.status, '')) = 'PAGA'
      )
    $q$ INTO v_paga USING p_mission_id;
    IF v_paga THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS vinculada a fatura paga. A reaprovação não desbloqueia.');
    END IF;
  END IF;

  v_carimbo := btrim(coalesce(v_os.snapshot_approved_by, ''));
  IF coalesce(v_os.billing_approved, false) IS NOT TRUE
     AND (v_carimbo = '' OR v_carimbo = 'Sistema (Recalcular e Comparar)') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'A OS ainda não tem aprovação financeira.');
  END IF;

  v_antes_receita := round(coalesce(v_os.revenue_value, 0) * 100)::bigint;
  v_antes_custo := round(coalesce(v_os.cost_value, 0) * 100)::bigint;
  v_esp_receita := round(coalesce(p_receita_esperada, 0) * 100)::bigint;
  v_esp_custo := round(coalesce(p_custo_esperado, 0) * 100)::bigint;
  IF v_antes_receita <> v_esp_receita OR v_antes_custo <> v_esp_custo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A reaprovação não foi concluída.');
  END IF;

  v_nova_receita := round(coalesce(p_receita_nova, 0) * 100)::bigint;
  v_nova_custo := round(coalesce(p_custo_novo, 0) * 100)::bigint;
  v_mudou_receita := v_nova_receita <> v_antes_receita;
  v_mudou_custo := v_nova_custo <> v_antes_custo;
  IF NOT v_mudou_receita AND NOT v_mudou_custo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sem_mudanca', 'erro', 'Nenhum valor financeiro foi alterado.');
  END IF;

  v_evento_id := gen_random_uuid();
  v_aviso_id := gen_random_uuid();
  v_carimbo_texto := format(
    '[%s - %s] Reaprovação: %s',
    btrim(p_alterado_por),
    to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'),
    btrim(p_justificativa)
  );
  v_campos := '[]'::jsonb;
  IF v_mudou_receita THEN
    v_campos := v_campos || jsonb_build_array(jsonb_build_object(
      'campo', 'revenue_value', 'antes', v_antes_receita / 100.0, 'depois', v_nova_receita / 100.0
    ));
  END IF;
  IF v_mudou_custo THEN
    v_campos := v_campos || jsonb_build_array(jsonb_build_object(
      'campo', 'cost_value', 'antes', v_antes_custo / 100.0, 'depois', v_nova_custo / 100.0
    ));
  END IF;

  -- Daqui para baixo qualquer exceção desfaz a OS, o evento e o aviso juntos.
  UPDATE missions
  SET revenue_value = CASE WHEN v_mudou_receita THEN round(p_receita_nova, 2) ELSE revenue_value END,
      cost_value = CASE WHEN v_mudou_custo THEN round(p_custo_novo, 2) ELSE cost_value END,
      revenue_edit_reason = CASE WHEN v_mudou_receita THEN v_carimbo_texto ELSE revenue_edit_reason END,
      cost_edit_reason = CASE WHEN v_mudou_custo THEN v_carimbo_texto ELSE cost_edit_reason END,
      last_update = p_quando
  WHERE id = p_mission_id;

  INSERT INTO reaprovacao_financeira (
    id, tentativa_id, mission_id, os_numero, incluido_por,
    aprovado_originalmente_por, aprovado_originalmente_em, conferido_originalmente_por,
    alterado_por, reaprovado_por, reaprovado_em, justificativa, campos,
    captura_antes_path, captura_depois_path, snapshot_original,
    valores_aplicados, notificacao_id, status, erro
  ) VALUES (
    v_evento_id, p_tentativa_id, p_mission_id, p_mission_id, nullif(btrim(coalesce(v_os.created_by, '')), ''),
    nullif(CASE WHEN v_carimbo = '' OR v_carimbo = 'Sistema (Recalcular e Comparar)' THEN btrim(coalesce(v_os.billing_verified_by, '')) ELSE v_carimbo END, ''),
    v_os.snapshot_approved_at,
    nullif(btrim(coalesce(v_os.billing_verified_by, '')), ''),
    btrim(p_alterado_por), btrim(p_alterado_por), p_quando, btrim(p_justificativa), v_campos,
    btrim(p_captura_antes), btrim(p_captura_depois), v_os.snapshot_data,
    true, v_aviso_id, 'concluida', null
  );

  v_resumo := jsonb_build_object(
    'osNumero', p_mission_id,
    'incluidoPor', nullif(btrim(coalesce(v_os.created_by, '')), ''),
    'aprovadoOriginalmentePor', nullif(CASE WHEN v_carimbo = '' OR v_carimbo = 'Sistema (Recalcular e Comparar)' THEN btrim(coalesce(v_os.billing_verified_by, '')) ELSE v_carimbo END, ''),
    'aprovadoOriginalmenteEm', v_os.snapshot_approved_at,
    'alteradoPor', btrim(p_alterado_por),
    'reaprovadoPor', btrim(p_alterado_por),
    'reaprovadoEm', p_quando,
    'justificativa', btrim(p_justificativa),
    'campos', v_campos,
    'capturaAntesPath', btrim(p_captura_antes),
    'capturaDepoisPath', btrim(p_captura_depois),
    'preservados', jsonb_build_array('snapshot original', 'pedágio', 'franquia', 'comissão'),
    'aprovacaoFinanceiraAlterada', false
  );

  INSERT INTO reaprovacao_diretoria (id, reaprovacao_id, situacao, historico, resumo, updated_at)
  VALUES (v_aviso_id, v_evento_id, 'pendente', '[]'::jsonb, v_resumo, p_quando);

  SELECT * INTO v_existente FROM reaprovacao_financeira WHERE id = v_evento_id;
  RETURN jsonb_build_object('ok', true, 'repetida', false, 'evento', to_jsonb(v_existente));
END;
$$;

REVOKE ALL ON FUNCTION public.reaprovar_os_financeira(
  text, text, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reaprovar_os_financeira(
  text, text, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.reaprovar_os_financeira(
  text, text, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reaprovar_os_financeira(
  text, text, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz
) TO service_role;
