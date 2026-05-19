-- ============================================================================
-- DHL Supplier Intake — Migração única para o Supabase
-- ============================================================================
-- Como aplicar (só precisa rodar UMA vez):
--   1. Abra o Supabase Studio → SQL Editor
--   2. Cole TODO o conteúdo deste arquivo
--   3. Clique em "Run"
-- ----------------------------------------------------------------------------
-- Após esta execução, todas as migrações automáticas do servidor passam a
-- funcionar (porque criamos a função exec_sql que o backend já espera).
-- ============================================================================

-- 1) Função utilitária usada pelas migrações automáticas do backend
CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- 2) Memória de Escoltistas por Fornecedor
CREATE TABLE IF NOT EXISTS public.provider_escoltistas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  rg TEXT,
  orgao_emissor TEXT,
  cnh TEXT,
  cnh_categoria TEXT,
  cnh_vencimento DATE,
  cnv_numero TEXT,
  cnv_validade DATE,
  rua TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  celular TEXT,
  admissao DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_escoltistas_provider ON public.provider_escoltistas(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_escoltistas_cpf ON public.provider_escoltistas(cpf);

-- 3) Memória de Veículos por Fornecedor
CREATE TABLE IF NOT EXISTS public.provider_intake_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  placa TEXT NOT NULL,
  renavam TEXT,
  marca TEXT,
  ano TEXT,
  modelo TEXT,
  cor TEXT,
  tecnologia TEXT,
  id_rastreador TEXT,
  comunicacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_intake_vehicles_provider ON public.provider_intake_vehicles(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_intake_vehicles_placa ON public.provider_intake_vehicles(placa);

-- 4) Links DHL (token + dados preenchidos pelo fornecedor)
CREATE TABLE IF NOT EXISTS public.dhl_supplier_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  mission_id TEXT NOT NULL,
  provider_id TEXT,
  provider_name TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  agent1_id UUID,
  agent2_id UUID,
  vehicle_id UUID,
  agent1_snapshot JSONB,
  agent2_snapshot JSONB,
  vehicle_snapshot JSONB,
  sent_to_email TEXT,
  sent_to_phone TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  mirror_proof_url TEXT,
  mirror_proof_filename TEXT
);
CREATE INDEX IF NOT EXISTS idx_dhl_intakes_mission ON public.dhl_supplier_intakes(mission_id);
CREATE INDEX IF NOT EXISTS idx_dhl_intakes_token ON public.dhl_supplier_intakes(token);

-- 4b) Histórico de reenvios do link DHL (auditoria por OS)
CREATE TABLE IF NOT EXISTS public.dhl_supplier_intake_resends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL,
  mission_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by_user_id UUID,
  sent_by_user_name TEXT,
  target_email TEXT,
  target_phone TEXT,
  email_status TEXT,
  email_error TEXT,
  reused_existing_token BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_dhl_intake_resends_intake ON public.dhl_supplier_intake_resends(intake_id);
CREATE INDEX IF NOT EXISTS idx_dhl_intake_resends_mission ON public.dhl_supplier_intake_resends(mission_id);

-- 5) Coluna obrigatória da OS para clientes DHL — Número da S.E.
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS dhl_se_number TEXT;

-- 5b) Correção retroativa: provider_id precisa aceitar IDs numéricos (string),
-- pois neste sistema providers.id não é UUID. Se a tabela já foi criada com
-- UUID, converte agora.
ALTER TABLE public.dhl_supplier_intakes ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;
ALTER TABLE public.provider_escoltistas ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;
ALTER TABLE public.provider_intake_vehicles ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;

-- 6) Trigger que invalida links DHL quando a OS é excluída/cancelada
CREATE OR REPLACE FUNCTION public.cancel_dhl_intakes_on_mission_change() RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.dhl_supplier_intakes
      SET status = 'cancelado'
      WHERE mission_id = OLD.id
        AND status IN ('pendente', 'preenchido');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('Cancelada', 'Recusada')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      UPDATE public.dhl_supplier_intakes
        SET status = 'cancelado'
        WHERE mission_id = NEW.id
          AND status IN ('pendente', 'preenchido');
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancel_dhl_intakes_on_mission_delete ON public.missions;
CREATE TRIGGER trg_cancel_dhl_intakes_on_mission_delete
  AFTER DELETE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.cancel_dhl_intakes_on_mission_change();

DROP TRIGGER IF EXISTS trg_cancel_dhl_intakes_on_mission_update ON public.missions;
CREATE TRIGGER trg_cancel_dhl_intakes_on_mission_update
  AFTER UPDATE OF status ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.cancel_dhl_intakes_on_mission_change();

-- 7) Coluna "Preservação / Hora" na tabela de preços (contrato DHL)
--    R$ 152,25/hora — usada em rotas DHL específicas.
ALTER TABLE public.client_price_tables
  ADD COLUMN IF NOT EXISTS price_per_preservation_hour NUMERIC DEFAULT 0;

-- 8) Recarrega o cache de schema do PostgREST (Supabase) para que a API
--    reconheça imediatamente as novas tabelas e colunas
NOTIFY pgrst, 'reload schema';

-- ITEM 8 (pendente): coluna usada pelo cadastro de fornecedor para guardar o
-- canal padrão do link DHL (e-mail, whatsapp ou ambos). Sem ela, o SELECT que
-- carrega fornecedores no formulário de OS retorna vazio.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS dhl_channel_preference TEXT;
