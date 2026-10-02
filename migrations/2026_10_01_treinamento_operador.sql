-- Academia do Operador.
-- Quem já estava cadastrado permanece com training_required = false e continua entrando.
-- Operador novo (insert) recebe training_required = true e só libera o sistema após as aulas e a prova.

alter table public.system_users
  add column if not exists training_required boolean not null default false,
  add column if not exists training_passed_at timestamptz,
  add column if not exists training_score integer,
  add column if not exists training_modules jsonb not null default '[]'::jsonb;

comment on column public.system_users.training_required is
  'true apenas para Operador criado depois da academia. Quem ja existia permanece false e entra normal.';
