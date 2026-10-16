-- Proposta. NÃO aplicar em produção sem autorização.
-- Não altera senha, perfil, permissão de usuário nem política já existente.
-- O bucket é privado. Sem política para anon/authenticated: só a service role grava e assina URL.

CREATE TABLE IF NOT EXISTS reaprovacao_financeira (
  id uuid PRIMARY KEY,
  tentativa_id text NOT NULL UNIQUE,
  mission_id text NOT NULL,
  os_numero text NOT NULL,
  incluido_por text,
  aprovado_originalmente_por text,
  aprovado_originalmente_em timestamptz,
  conferido_originalmente_por text,
  alterado_por text NOT NULL,
  reaprovado_por text NOT NULL,
  reaprovado_em timestamptz NOT NULL,
  justificativa text NOT NULL,
  campos jsonb NOT NULL,
  captura_antes_path text,
  captura_depois_path text,
  snapshot_original jsonb,
  valores_aplicados boolean NOT NULL DEFAULT false,
  notificacao_id uuid,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reaprovacao_financeira_mission
  ON reaprovacao_financeira (mission_id, reaprovado_em DESC);

CREATE TABLE IF NOT EXISTS reaprovacao_diretoria (
  id uuid PRIMARY KEY,
  reaprovacao_id uuid NOT NULL UNIQUE REFERENCES reaprovacao_financeira (id),
  situacao text NOT NULL DEFAULT 'pendente',
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reaprovacao_financeira ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaprovacao_diretoria ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('reaprovacao-financeira', 'reaprovacao-financeira', false)
ON CONFLICT (id) DO UPDATE SET public = false;
