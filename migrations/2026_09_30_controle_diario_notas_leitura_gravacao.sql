-- A observação do Controle Diário é gravada pela API do sistema.
-- Só entra linha nova e só se lê. Não há permissão para alterar nem apagar,
-- então o histórico continua intacto.

GRANT SELECT, INSERT ON public.controle_diario_notas TO anon, authenticated;

DROP POLICY IF EXISTS controle_diario_notas_select ON public.controle_diario_notas;
CREATE POLICY controle_diario_notas_select
  ON public.controle_diario_notas
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS controle_diario_notas_insert ON public.controle_diario_notas;
CREATE POLICY controle_diario_notas_insert
  ON public.controle_diario_notas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(btrim(mission_id)) BETWEEN 1 AND 80
    AND char_length(btrim(note)) BETWEEN 1 AND 2000
    AND char_length(btrim(created_by)) BETWEEN 1 AND 200
  );
