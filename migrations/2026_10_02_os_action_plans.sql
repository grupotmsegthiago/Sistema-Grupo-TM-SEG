-- Plano de ação editado de cada OS. O HTML salvo é o documento que o operador
-- revisou. Não guarda valor financeiro.

CREATE TABLE IF NOT EXISTS public.os_action_plans (
  mission_id text PRIMARY KEY,
  html text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.os_action_plans IS
  'Plano de ação operacional salvo por OS, depois da edição do operador.';

ALTER TABLE public.os_action_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for os_action_plans" ON public.os_action_plans;
CREATE POLICY "Allow all for os_action_plans"
  ON public.os_action_plans FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.os_action_plans TO anon, authenticated;
