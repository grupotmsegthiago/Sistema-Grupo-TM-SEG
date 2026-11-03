-- A tela de Pendências lê pela chave anon quando a service_role não está no ambiente.
-- authenticated já tinha tmp_auth_select_all / tmp_auth_update_all.
CREATE POLICY os_analysis_anon_select
  ON public.os_analysis_requests
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY os_analysis_anon_update
  ON public.os_analysis_requests
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
