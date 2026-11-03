-- Vigência da tabela regional em system_settings.
--
-- A gravação de tabela_regional_vigente é feita pelo backend
-- (POST /api/pricing/tabela-regional-vigente) com a chave service_role.
-- Essa chave ignora o RLS. Este arquivo não é executado pelo sistema.
-- Thiago aplica no SQL Editor do projeto ajhmmjuewdsukecaimik, se quiser
-- a leitura autenticada abaixo. Sem este SQL, o botão já grava pelo servidor.
--
-- Não abre SELECT em todas as chaves: system_settings também guarda alertas,
-- travas e estado operacional. Não cria política de escrita para o navegador.
-- A identidade da TM SEG é system_users + profiles. Não existe tabela users
-- ligada a auth.uid() para este papel, e o JWT de quem entrou traz role
-- authenticated, não diretoria.

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de system_settings para autenticados" ON public.system_settings;
DROP POLICY IF EXISTS "Permitir alteracao de system_settings para administradores" ON public.system_settings;

DROP POLICY IF EXISTS "Leitura da vigencia regional" ON public.system_settings;
CREATE POLICY "Leitura da vigencia regional"
ON public.system_settings
FOR SELECT
TO authenticated
USING (key = 'tabela_regional_vigente');
