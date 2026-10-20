-- Vinculação do WhatsApp Desktop à solicitação de escolta.
-- Não aplica envio sozinho. O link chat.whatsapp.com continua só referência de cadastro.
-- Não executar no projeto TORRES.

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS whatsapp_desktop_group_name TEXT;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS whatsapp_desktop_vinculo TEXT;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS whatsapp_desktop_verificado_em TIMESTAMPTZ;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS whatsapp_desktop_local_id TEXT;

COMMENT ON COLUMN public.providers.whatsapp_desktop_group_name IS
  'Nome exato do grupo no WhatsApp Desktop. Não guarda sessão nem credencial.';
COMMENT ON COLUMN public.providers.whatsapp_desktop_vinculo IS
  'nao_vinculado, supervisionado, incerto ou desativado.';

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS whatsapp_desktop_group_name TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS whatsapp_desktop_vinculo TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS whatsapp_desktop_ativo BOOLEAN;

COMMENT ON COLUMN public.clients.whatsapp_desktop_ativo IS
  'false desliga a integração deste cliente. NULL preserva cadastro antigo sem integração.';

ALTER TABLE public.escolta_solicitacoes ADD COLUMN IF NOT EXISTS desktop_autorizado_em TIMESTAMPTZ;
ALTER TABLE public.escolta_solicitacoes ADD COLUMN IF NOT EXISTS desktop_autorizado_por TEXT;

ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS grupo_nome TEXT;
ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS envio_status TEXT;
ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS envio_em TIMESTAMPTZ;
ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS envio_erro TEXT;
ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS envio_comando_id TEXT;
ALTER TABLE public.escolta_solicitacao_alvos ADD COLUMN IF NOT EXISTS envio_dispositivo TEXT;

ALTER TABLE public.escolta_solicitacao_alvos DROP CONSTRAINT IF EXISTS escolta_solicitacao_alvos_envio_status_check;
ALTER TABLE public.escolta_solicitacao_alvos
  ADD CONSTRAINT escolta_solicitacao_alvos_envio_status_check
  CHECK (
    envio_status IS NULL OR envio_status IN (
      'aguardando_horario',
      'pronto_para_envio',
      'enviando',
      'comando_executado',
      'falha_envio',
      'destinatario_nao_validado',
      'cancelado',
      'fornecedor_confirmado'
    )
  );
