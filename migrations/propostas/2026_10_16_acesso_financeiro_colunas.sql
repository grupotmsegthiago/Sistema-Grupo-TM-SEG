-- Fecha a leitura e a gravação direta das colunas financeiras.
-- Aplicar só depois que o sistema novo estiver no ar.
-- A OS operacional (status, rota, KM, hora) continua para anon.
-- service_role segue com a tabela inteira.

REVOKE ALL ON TABLE public.missions FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, client, provider, origin, destination, vehicle_type, client_vehicle,
  status, last_update, updated_by, created_at, agent1, agent2,
  total_distance, traveled_distance, progress, current_location, map_link,
  start_km, start_time, end_km, end_time, estimated_time,
  driver_name, driver_phone, mission_type, vehicle_id, client_vehicle_id,
  gr_espelhamento, special_operation_type, is_same_os, billing_approved,
  client_vehicle_2, driver_name_2, driver_phone_2,
  provider_start_km, provider_end_km, provider_start_time, provider_end_time,
  provider_ops_edited, vendor_os_number, invoice_number, payment_date,
  verified_by, verified_at, release_date, mirroring_evidence_url,
  parent_mission_id, email_pending_client, email_pending_provider, email_message_id,
  valor_zero_motivo, reference_number, billing_release, billing_period_override,
  exclude_from_billing, dhl_se_number, dhl_sm_number, dhl_deslocamento_km,
  dhl_deslocamento_approval_url, negative_margin_locked, negative_margin_locked_by,
  negative_margin_locked_at, velada_closure_operator, velada_closure_opened_at,
  velada_closure_notified_at, velada_closure_escalated_at, velada_toll_confirmed,
  occurrence_count, end_trip_evidence_url, end_km_evidence_url,
  end_photo_time_confirmed, end_evidence_pending, end_evidence_operator
), UPDATE (
  id, client, provider, origin, destination, vehicle_type, client_vehicle,
  status, last_update, updated_by, created_at, agent1, agent2,
  total_distance, traveled_distance, progress, current_location, map_link,
  start_km, start_time, end_km, end_time, estimated_time,
  driver_name, driver_phone, mission_type, vehicle_id, client_vehicle_id,
  gr_espelhamento, special_operation_type, is_same_os, billing_approved,
  client_vehicle_2, driver_name_2, driver_phone_2,
  provider_start_km, provider_end_km, provider_start_time, provider_end_time,
  provider_ops_edited, vendor_os_number, invoice_number, payment_date,
  verified_by, verified_at, release_date, mirroring_evidence_url,
  parent_mission_id, email_pending_client, email_pending_provider, email_message_id,
  valor_zero_motivo, reference_number, billing_release, billing_period_override,
  exclude_from_billing, dhl_se_number, dhl_sm_number, dhl_deslocamento_km,
  dhl_deslocamento_approval_url, negative_margin_locked, negative_margin_locked_by,
  negative_margin_locked_at, velada_closure_operator, velada_closure_opened_at,
  velada_closure_notified_at, velada_closure_escalated_at, velada_toll_confirmed,
  occurrence_count, end_trip_evidence_url, end_km_evidence_url,
  end_photo_time_confirmed, end_evidence_pending, end_evidence_operator
) ON TABLE public.missions TO anon, authenticated;
GRANT ALL ON TABLE public.missions TO service_role;

REVOKE ALL ON TABLE public.client_price_tables FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.provider_cost_tables FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_price_tables TO service_role;
GRANT ALL ON TABLE public.provider_cost_tables TO service_role;
