-- Vincula comercial ao usuário interno e à tabela padrão de comissão (print).
-- Não altera geração por NF; apuração do período usa piso/bônus/fixo no frontend.

BEGIN;

ALTER TABLE public.comerciais
  ADD COLUMN IF NOT EXISTS usuario_id bigint REFERENCES public.system_users(id) ON DELETE SET NULL;

ALTER TABLE public.comerciais
  ADD COLUMN IF NOT EXISTS tabela_comissao_codigo text NOT NULL DEFAULT 'padrao-tmseg';

ALTER TABLE public.comerciais
  ADD COLUMN IF NOT EXISTS valor_fixo numeric(12,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comerciais_usuario_id
  ON public.comerciais (usuario_id)
  WHERE usuario_id IS NOT NULL;

UPDATE public.comerciais c
SET usuario_id = u.id
FROM public.system_users u
WHERE c.usuario_id IS NULL
  AND u.user_type = 'internal'
  AND (
    (c.email IS NOT NULL AND lower(c.email) = lower(u.email))
    OR lower(c.nome) = lower(u.name)
  );

COMMIT;
