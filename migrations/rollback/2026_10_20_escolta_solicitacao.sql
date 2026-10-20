-- Desfaz a solicitação de escolta. Não mexe em OS já salvas.

DROP TABLE IF EXISTS public.escolta_solicitacao_alvos;
DROP TABLE IF EXISTS public.escolta_solicitacoes;
ALTER TABLE public.providers DROP COLUMN IF EXISTS whatsapp_group_link;
