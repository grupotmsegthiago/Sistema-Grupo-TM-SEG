ALTER TABLE public.escolta_solicitacao_alvos DROP CONSTRAINT IF EXISTS escolta_solicitacao_alvos_envio_status_check;

ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS envio_dispositivo;
ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS envio_comando_id;
ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS envio_erro;
ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS envio_em;
ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS envio_status;
ALTER TABLE public.escolta_solicitacao_alvos DROP COLUMN IF EXISTS grupo_nome;

ALTER TABLE public.escolta_solicitacoes DROP COLUMN IF EXISTS desktop_autorizado_por;
ALTER TABLE public.escolta_solicitacoes DROP COLUMN IF EXISTS desktop_autorizado_em;

ALTER TABLE public.clients DROP COLUMN IF EXISTS whatsapp_desktop_ativo;
ALTER TABLE public.clients DROP COLUMN IF EXISTS whatsapp_desktop_vinculo;
ALTER TABLE public.clients DROP COLUMN IF EXISTS whatsapp_desktop_group_name;
ALTER TABLE public.clients DROP COLUMN IF EXISTS whatsapp_group_link;

ALTER TABLE public.providers DROP COLUMN IF EXISTS whatsapp_desktop_local_id;
ALTER TABLE public.providers DROP COLUMN IF EXISTS whatsapp_desktop_verificado_em;
ALTER TABLE public.providers DROP COLUMN IF EXISTS whatsapp_desktop_vinculo;
ALTER TABLE public.providers DROP COLUMN IF EXISTS whatsapp_desktop_group_name;
