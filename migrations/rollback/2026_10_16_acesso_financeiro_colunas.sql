-- Devolve a leitura direta. Não apaga sessão nem OS.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.missions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_price_tables TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_cost_tables TO anon, authenticated;
