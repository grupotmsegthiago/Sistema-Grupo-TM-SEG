-- Proposta. NÃO aplicar em produção sem autorização.
-- Depende das tabelas de reaprovacao_financeira e reaprovacao_diretoria.
-- Não altera senha, perfil, comissão, fatura, Asaas, PlugNotas nem o snapshot da aprovação.

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS parametros_edicao_total jsonb;

COMMENT ON COLUMN missions.parametros_edicao_total IS
  'Parâmetros da edição total (tabela e franquia). Não substitui snapshot_data.';

CREATE OR REPLACE FUNCTION public.editar_os_total_financeira(
  p_tentativa_id text,
  p_mission_id text,
  p_campos jsonb,
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
  v_item jsonb;
  v_campo text;
  v_status text;
  v_paga boolean := false;
  v_incluido text;
  v_carimbo text;
  v_carimbo_texto text;
  v_evento_id uuid;
  v_aviso_id uuid;
  v_campos jsonb := '[]'::jsonb;
  v_novos jsonb := '{}'::jsonb;
  v_parametros jsonb := '{}'::jsonb;
  v_resumo jsonb;
  v_preservados jsonb;
  v_atual numeric;
  v_antes numeric;
  v_depois numeric;
  v_texto_atual text;
  v_texto_antes text;
  v_texto_depois text;
  v_bool_atual boolean;
  v_bool_antes boolean;
  v_bool_depois boolean;
  v_numero text;
BEGIN
  IF p_tentativa_id IS NULL OR p_mission_id IS NULL OR length(btrim(coalesce(p_justificativa, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Justificativa ou identificação ausente. Nada foi alterado.');
  END IF;
  IF length(btrim(p_justificativa)) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'A justificativa excede o limite. Nada foi alterado.');
  END IF;
  IF btrim(coalesce(p_captura_antes, '')) = '' OR btrim(coalesce(p_captura_depois, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'A evidência obrigatória não está no armazenamento. Nada foi alterado.');
  END IF;
  IF jsonb_typeof(p_campos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_campos) = 0 OR jsonb_array_length(p_campos) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sem_mudanca', 'erro', 'Nenhuma alteração válida para salvar.');
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
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS com prejuízo analisado. A edição total não desbloqueia essa trava.');
  END IF;
  IF length(btrim(coalesce(v_os.invoice_number, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS faturada. A edição total não desbloqueia a fatura.');
  END IF;

  v_status := lower(btrim(coalesce(v_os.status, '')));
  IF v_status LIKE '%faturad%' OR v_status LIKE '%encerrad%'
     OR v_status IN ('encerrada', 'encerrado', 'cancelada', 'cancelado', 'recusada', 'recusado') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS encerrada ou faturada. A edição total não reabre.');
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
      RETURN jsonb_build_object('ok', false, 'codigo', 'trava', 'erro', 'OS vinculada a fatura paga. A edição total não desbloqueia.');
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_campos)
  LOOP
    v_campo := btrim(coalesce(v_item->>'campo', ''));
    IF v_campo NOT IN (
      'revenue_value', 'cost_value', 'toll_value', 'toll_value_provider',
      'displacement_value', 'displacement_value_provider',
      'start_km', 'end_km', 'provider_start_km', 'provider_end_km',
      'total_distance', 'traveled_distance',
      'start_time', 'end_time', 'provider_start_time', 'provider_end_time', 'estimated_time',
      'provider_ops_edited',
      'tabela_cliente', 'tabela_fornecedor', 'franquia_km', 'franquia_horas',
      'km_excedente', 'horas_excedentes'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Há campo que a edição total não pode gravar. Nada foi salvo.');
    END IF;

    IF v_campo IN (
      'revenue_value', 'cost_value', 'toll_value', 'toll_value_provider',
      'displacement_value', 'displacement_value_provider',
      'start_km', 'end_km', 'provider_start_km', 'provider_end_km',
      'total_distance', 'traveled_distance'
    ) THEN
      v_numero := btrim(coalesce(v_item->>'antes', ''));
      IF v_numero !~ '^-?[0-9]+([.][0-9]+)?$' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Há valor numérico inválido. Nada foi salvo.');
      END IF;
      v_antes := round(v_numero::numeric, 2);
      v_numero := btrim(coalesce(v_item->>'depois', ''));
      IF v_numero !~ '^-?[0-9]+([.][0-9]+)?$' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Há valor numérico inválido. Nada foi salvo.');
      END IF;
      v_depois := round(v_numero::numeric, 2);
      v_atual := round(coalesce((to_jsonb(v_os)->>v_campo)::numeric, 0), 2);
      IF v_atual IS DISTINCT FROM v_antes THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A edição total não foi concluída.');
      END IF;
      IF v_atual IS NOT DISTINCT FROM v_depois THEN
        CONTINUE;
      END IF;
      v_novos := v_novos || jsonb_build_object(v_campo, v_depois);
      v_campos := v_campos || jsonb_build_array(jsonb_build_object('campo', v_campo, 'antes', v_antes, 'depois', v_depois));
      CONTINUE;
    END IF;

    IF v_campo = 'provider_ops_edited' THEN
      v_bool_atual := coalesce(v_os.provider_ops_edited, false);
      v_bool_antes := lower(btrim(coalesce(v_item->>'antes', ''))) IN ('sim', 'true', '1');
      v_bool_depois := lower(btrim(coalesce(v_item->>'depois', ''))) IN ('sim', 'true', '1');
      IF v_bool_atual IS DISTINCT FROM v_bool_antes THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A edição total não foi concluída.');
      END IF;
      IF v_bool_atual IS NOT DISTINCT FROM v_bool_depois THEN
        CONTINUE;
      END IF;
      v_novos := v_novos || jsonb_build_object(v_campo, v_bool_depois);
      v_campos := v_campos || jsonb_build_array(jsonb_build_object(
        'campo', v_campo,
        'antes', CASE WHEN v_bool_antes THEN 'sim' ELSE 'não' END,
        'depois', CASE WHEN v_bool_depois THEN 'sim' ELSE 'não' END
      ));
      CONTINUE;
    END IF;

    IF v_campo IN ('franquia_km', 'franquia_horas', 'km_excedente', 'horas_excedentes') THEN
      v_numero := btrim(coalesce(v_item->>'antes', ''));
      IF v_numero !~ '^-?[0-9]+([.][0-9]+)?$' OR btrim(coalesce(v_item->>'depois', '')) !~ '^-?[0-9]+([.][0-9]+)?$' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Há valor numérico inválido. Nada foi salvo.');
      END IF;
      v_antes := round(v_numero::numeric, 2);
      v_depois := round(btrim(v_item->>'depois')::numeric, 2);
      v_texto_atual := nullif(btrim(coalesce(v_os.parametros_edicao_total->>v_campo, '')), '');
      IF v_texto_atual IS NOT NULL AND round(v_texto_atual::numeric, 2) IS DISTINCT FROM v_antes THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A edição total não foi concluída.');
      END IF;
      IF v_antes IS NOT DISTINCT FROM v_depois THEN
        CONTINUE;
      END IF;
      v_parametros := v_parametros || jsonb_build_object(v_campo, v_depois);
      v_campos := v_campos || jsonb_build_array(jsonb_build_object('campo', v_campo, 'antes', v_antes, 'depois', v_depois));
      CONTINUE;
    END IF;

    v_texto_antes := btrim(coalesce(v_item->>'antes', ''));
    v_texto_depois := btrim(coalesce(v_item->>'depois', ''));
    IF length(v_texto_antes) > 500 OR length(v_texto_depois) > 500 THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'banco', 'erro', 'Há texto longo demais. Nada foi salvo.');
    END IF;
    IF v_campo IN ('tabela_cliente', 'tabela_fornecedor') THEN
      v_texto_atual := nullif(btrim(coalesce(v_os.parametros_edicao_total->>v_campo, '')), '');
      IF v_texto_atual IS NOT NULL AND v_texto_atual IS DISTINCT FROM v_texto_antes THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A edição total não foi concluída.');
      END IF;
    ELSE
      v_texto_atual := btrim(coalesce(to_jsonb(v_os)->>v_campo, ''));
      IF v_texto_atual IS DISTINCT FROM v_texto_antes THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'conflito', 'erro', 'A OS foi alterada por outra edição. A edição total não foi concluída.');
      END IF;
      IF v_texto_atual IS NOT DISTINCT FROM v_texto_depois THEN
        CONTINUE;
      END IF;
      v_novos := v_novos || jsonb_build_object(v_campo, v_texto_depois);
    END IF;
    IF v_texto_antes IS NOT DISTINCT FROM v_texto_depois THEN
      CONTINUE;
    END IF;
    IF v_campo IN ('tabela_cliente', 'tabela_fornecedor') THEN
      v_parametros := v_parametros || jsonb_build_object(v_campo, v_texto_depois);
    END IF;
    v_campos := v_campos || jsonb_build_array(jsonb_build_object('campo', v_campo, 'antes', v_texto_antes, 'depois', v_texto_depois));
  END LOOP;

  IF jsonb_array_length(v_campos) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sem_mudanca', 'erro', 'Nenhuma alteração para salvar.');
  END IF;

  SELECT nullif(btrim(coalesce(ml.updated_by, '')), '')
  INTO v_incluido
  FROM mission_logs ml
  WHERE ml.mission_id = p_mission_id
  ORDER BY ml.created_at ASC
  LIMIT 1;

  v_evento_id := gen_random_uuid();
  v_aviso_id := gen_random_uuid();
  v_carimbo := btrim(coalesce(v_os.snapshot_approved_by, ''));
  v_carimbo_texto := format(
    '[%s - %s] Edição total: %s',
    btrim(p_alterado_por),
    to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'),
    btrim(p_justificativa)
  );

  UPDATE missions
  SET revenue_value = CASE WHEN v_novos ? 'revenue_value' THEN (v_novos->>'revenue_value')::numeric ELSE revenue_value END,
      cost_value = CASE WHEN v_novos ? 'cost_value' THEN (v_novos->>'cost_value')::numeric ELSE cost_value END,
      toll_value = CASE WHEN v_novos ? 'toll_value' THEN (v_novos->>'toll_value')::numeric ELSE toll_value END,
      toll_value_provider = CASE WHEN v_novos ? 'toll_value_provider' THEN (v_novos->>'toll_value_provider')::numeric ELSE toll_value_provider END,
      displacement_value = CASE WHEN v_novos ? 'displacement_value' THEN (v_novos->>'displacement_value')::numeric ELSE displacement_value END,
      displacement_value_provider = CASE WHEN v_novos ? 'displacement_value_provider' THEN (v_novos->>'displacement_value_provider')::numeric ELSE displacement_value_provider END,
      start_km = CASE WHEN v_novos ? 'start_km' THEN (v_novos->>'start_km')::numeric ELSE start_km END,
      end_km = CASE WHEN v_novos ? 'end_km' THEN (v_novos->>'end_km')::numeric ELSE end_km END,
      provider_start_km = CASE WHEN v_novos ? 'provider_start_km' THEN (v_novos->>'provider_start_km')::numeric ELSE provider_start_km END,
      provider_end_km = CASE WHEN v_novos ? 'provider_end_km' THEN (v_novos->>'provider_end_km')::numeric ELSE provider_end_km END,
      total_distance = CASE WHEN v_novos ? 'total_distance' THEN (v_novos->>'total_distance')::numeric ELSE total_distance END,
      traveled_distance = CASE WHEN v_novos ? 'traveled_distance' THEN (v_novos->>'traveled_distance')::numeric ELSE traveled_distance END,
      start_time = CASE WHEN v_novos ? 'start_time' THEN v_novos->>'start_time' ELSE start_time END,
      end_time = CASE WHEN v_novos ? 'end_time' THEN v_novos->>'end_time' ELSE end_time END,
      provider_start_time = CASE WHEN v_novos ? 'provider_start_time' THEN v_novos->>'provider_start_time' ELSE provider_start_time END,
      provider_end_time = CASE WHEN v_novos ? 'provider_end_time' THEN v_novos->>'provider_end_time' ELSE provider_end_time END,
      estimated_time = CASE WHEN v_novos ? 'estimated_time' THEN v_novos->>'estimated_time' ELSE estimated_time END,
      provider_ops_edited = CASE WHEN v_novos ? 'provider_ops_edited' THEN (v_novos->>'provider_ops_edited')::boolean ELSE provider_ops_edited END,
      parametros_edicao_total = CASE
        WHEN v_parametros = '{}'::jsonb THEN parametros_edicao_total
        ELSE coalesce(parametros_edicao_total, '{}'::jsonb) || v_parametros
      END,
      revenue_edit_reason = CASE WHEN v_novos ? 'revenue_value' THEN v_carimbo_texto ELSE revenue_edit_reason END,
      cost_edit_reason = CASE WHEN v_novos ? 'cost_value' THEN v_carimbo_texto ELSE cost_edit_reason END,
      last_update = p_quando
  WHERE id = p_mission_id;

  INSERT INTO reaprovacao_financeira (
    id, tentativa_id, mission_id, os_numero, incluido_por,
    aprovado_originalmente_por, aprovado_originalmente_em, conferido_originalmente_por,
    alterado_por, reaprovado_por, reaprovado_em, justificativa, campos,
    captura_antes_path, captura_depois_path, snapshot_original,
    valores_aplicados, notificacao_id, status, erro
  ) VALUES (
    v_evento_id, p_tentativa_id, p_mission_id, p_mission_id, v_incluido,
    nullif(CASE WHEN v_carimbo = '' OR v_carimbo = 'Sistema (Recalcular e Comparar)' THEN btrim(coalesce(v_os.billing_verified_by, '')) ELSE v_carimbo END, ''),
    v_os.snapshot_approved_at,
    nullif(btrim(coalesce(v_os.billing_verified_by, '')), ''),
    btrim(p_alterado_por), btrim(p_alterado_por), p_quando, btrim(p_justificativa), v_campos,
    btrim(p_captura_antes), btrim(p_captura_depois), v_os.snapshot_data,
    true, v_aviso_id, 'concluida', null
  );

  v_preservados := jsonb_build_array('snapshot original', 'aprovação original', 'comissão', 'contas a pagar', 'notas fiscais', 'franquia do snapshot');
  IF NOT (v_novos ? 'toll_value' OR v_novos ? 'toll_value_provider') THEN
    v_preservados := v_preservados || jsonb_build_array('pedágio');
  END IF;

  v_resumo := jsonb_build_object(
    'osNumero', p_mission_id,
    'cliente', nullif(btrim(coalesce(v_os.client, '')), ''),
    'incluidoPor', v_incluido,
    'aprovadoOriginalmentePor', nullif(CASE WHEN v_carimbo = '' OR v_carimbo = 'Sistema (Recalcular e Comparar)' THEN btrim(coalesce(v_os.billing_verified_by, '')) ELSE v_carimbo END, ''),
    'aprovadoOriginalmenteEm', v_os.snapshot_approved_at,
    'alteradoPor', btrim(p_alterado_por),
    'reaprovadoPor', btrim(p_alterado_por),
    'reaprovadoEm', p_quando,
    'justificativa', btrim(p_justificativa),
    'campos', v_campos,
    'capturaAntesPath', btrim(p_captura_antes),
    'capturaDepoisPath', btrim(p_captura_depois),
    'preservados', v_preservados,
    'aprovacaoFinanceiraAlterada', false,
    'origem', 'edicao_total'
  );

  INSERT INTO reaprovacao_diretoria (id, reaprovacao_id, situacao, historico, resumo, updated_at)
  VALUES (v_aviso_id, v_evento_id, 'pendente', '[]'::jsonb, v_resumo, p_quando);

  SELECT * INTO v_existente FROM reaprovacao_financeira WHERE id = v_evento_id;
  RETURN jsonb_build_object('ok', true, 'repetida', false, 'evento', to_jsonb(v_existente));
END;
$$;

REVOKE ALL ON FUNCTION public.editar_os_total_financeira(text, text, jsonb, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editar_os_total_financeira(text, text, jsonb, text, text, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.editar_os_total_financeira(text, text, jsonb, text, text, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.editar_os_total_financeira(text, text, jsonb, text, text, text, text, timestamptz) TO service_role;
