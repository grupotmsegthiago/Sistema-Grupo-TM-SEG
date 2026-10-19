/**
 * Prova a proposta de RLS do P0 num Postgres local, sem dados reais e sem produção.
 * O script SQL aborta se alguém o rodar sem a marca de teste isolado.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const PSQL = '/usr/lib/postgresql/16/bin/psql';
const MIGRACAO = 'docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql';
const REVERSAO = 'docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.REVERSAO-EMERGENCIA.NAO_EXECUTAR.sql';

function psql(db: string, sql: string) {
  const resultado = spawnSync(PSQL, [
    '-h', '/tmp', '-p', '55432', '-U', 'p0', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-t', '-A',
  ], { encoding: 'utf8', input: sql });
  return resultado;
}

function exigir(db: string, sql: string) {
  const resultado = psql(db, sql);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  return resultado.stdout.trim();
}

function claims(app: Record<string, unknown>, papel = 'authenticated') {
  return JSON.stringify({
    role: papel,
    app_metadata: app,
    user_metadata: { perfil: 'Diretoria', permissions: ['*'], empresas: ['FX-GESTAO'] },
  }).replace(/'/g, "''");
}

test('a proposta não roda sem a marca de teste isolado', () => {
  exigir('postgres', 'DROP DATABASE IF EXISTS p0_bloqueio; CREATE DATABASE p0_bloqueio;');
  exigir('p0_bloqueio', `
    CREATE TABLE public.missions (id text PRIMARY KEY, client text);
    CREATE TABLE public.clients (id text PRIMARY KEY, name text, issuer_company text);
    CREATE TABLE public.client_price_tables (id text PRIMARY KEY, client text);
    CREATE TABLE public.provider_cost_tables (id text PRIMARY KEY, provider text);
    CREATE TABLE public.financial_transactions (id text PRIMARY KEY);
    CREATE TABLE public.financial_categories (id text PRIMARY KEY);
    CREATE TABLE public.financial_invoices (id text PRIMARY KEY, issuer_company text, client text);
    CREATE TABLE public.financial_invoice_missions (invoice_id text, mission_id text);
    CREATE TABLE public.providers (id text PRIMARY KEY);
    CREATE TABLE public.financial_accounts (id text PRIMARY KEY);
  `);
  const bloqueio = psql('p0_bloqueio', fs.readFileSync(MIGRACAO, 'utf8'));
  assert.notEqual(bloqueio.status, 0);
  assert.match(bloqueio.stderr, /NÃO EXECUTAR/);
  assert.equal(exigir('p0_bloqueio', "SELECT count(*) FROM pg_policies WHERE policyname LIKE 'p0_%';"), '0');
});

test('anon, operador, diretoria, portal e empresa ficam separados no Postgres isolado', () => {
  exigir('postgres', 'DROP DATABASE IF EXISTS p0_fin; CREATE DATABASE p0_fin;');
  exigir('p0_fin', `
    CREATE TABLE public.missions (id text PRIMARY KEY, client text);
    CREATE TABLE public.clients (id text PRIMARY KEY, name text, issuer_company text);
    CREATE TABLE public.client_price_tables (id text PRIMARY KEY, client text);
    CREATE TABLE public.provider_cost_tables (id text PRIMARY KEY, provider text);
    CREATE TABLE public.financial_transactions (id text PRIMARY KEY);
    CREATE TABLE public.financial_categories (id text PRIMARY KEY);
    CREATE TABLE public.financial_invoices (id text PRIMARY KEY, issuer_company text, client text);
    CREATE TABLE public.financial_invoice_missions (invoice_id text, mission_id text);
    CREATE TABLE public.providers (id text PRIMARY KEY);
    CREATE TABLE public.financial_accounts (id text PRIMARY KEY);
    INSERT INTO public.clients VALUES
      ('c-a', 'CLIENTE A', 'FX-GESTAO'),
      ('c-b', 'CLIENTE B', 'FX-SEG');
    INSERT INTO public.missions VALUES ('os-a', 'CLIENTE A'), ('os-b', 'CLIENTE B');
    INSERT INTO public.financial_invoices VALUES
      ('f-a', 'FX-GESTAO', 'CLIENTE A'),
      ('f-b', 'FX-SEG', 'CLIENTE B'),
      ('f-sem', NULL, 'CLIENTE A');
    INSERT INTO public.financial_transactions VALUES ('t-1');
    INSERT INTO public.financial_accounts VALUES ('acc-1');
    INSERT INTO public.financial_categories VALUES ('cat-1');
    INSERT INTO public.providers VALUES ('p-1');
    INSERT INTO public.client_price_tables VALUES ('preco-1', 'CLIENTE A');
    INSERT INTO public.provider_cost_tables VALUES ('custo-1', 'FORNECEDOR FX');
    INSERT INTO public.financial_invoice_missions VALUES ('f-a', 'os-a');
  `);
  const migracao = psql('p0_fin', `SET tmseg.p0_teste_isolado = 'ligado';\n${fs.readFileSync(MIGRACAO, 'utf8')}`);
  assert.equal(migracao.status, 0, migracao.stderr);
  exigir('p0_fin', 'GRANT anon, authenticated TO p0;');

  const anon = psql('p0_fin', `
    SET ROLE anon;
    SELECT count(*) FROM public.financial_transactions;
  `);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const anonEscrita = psql('p0_fin', `
    SET ROLE anon;
    INSERT INTO public.missions (id, client) VALUES ('os-anon', 'CLIENTE A');
  `);
  assert.notEqual(anonEscrita.status, 0);

  const operador = claims({ status: 'Ativo', perfil: 'Operador', permissions: ['missions'], empresas: [] });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${operador}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.missions;
  `).split('\n').pop(), '2');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${operador}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_transactions;
  `).split('\n').pop(), '0');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${operador}', true);
    SET ROLE authenticated;
    INSERT INTO public.missions (id, client) VALUES ('os-op', 'CLIENTE A');
    SELECT count(*) FROM public.missions WHERE id = 'os-op';
  `).split('\n').pop(), '1');

  const fiscal = claims({
    status: 'Ativo', perfil: 'Diretoria', permissions: ['gestor-fiscal'], empresas: [],
  });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${fiscal}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_invoices;
  `).split('\n').pop(), '3');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${fiscal}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_transactions;
  `).split('\n').pop(), '1');
  const gravaFiscal = psql('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${fiscal}', true);
    SET ROLE authenticated;
    DO $$
    BEGIN
      UPDATE public.financial_invoices SET client = client WHERE id = 'f-a';
      IF FOUND THEN RAISE EXCEPTION 'gestor fiscal gravou fatura'; END IF;
    END $$;
    COMMIT;
  `);
  assert.equal(gravaFiscal.status, 0, gravaFiscal.stderr);

  const faturamento = claims({
    status: 'Ativo', perfil: 'Diretoria', permissions: ['diretoria-faturamento'], empresas: [],
  });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${faturamento}', true);
    SET ROLE authenticated;
    UPDATE public.financial_invoices SET client = 'CLIENTE A' WHERE id = 'f-a';
    SELECT count(*) FROM public.financial_invoices WHERE id = 'f-a' AND client = 'CLIENTE A';
  `).split('\n').pop(), '1');

  const umaEmpresa = claims({
    status: 'Ativo', perfil: 'Financeiro', permissions: ['fin-dashboard'], empresas: ['FX-GESTAO'],
  });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${umaEmpresa}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_invoices;
  `).split('\n').pop(), '1');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${umaEmpresa}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_transactions;
  `).split('\n').pop(), '0');

  const avancado = claims({ status: 'Ativo', perfil: 'Avançado', permissions: ['*'], empresas: [] });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${avancado}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.missions;
  `).split('\n').pop(), '2');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${avancado}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_invoices;
  `).split('\n').pop(), '0');

  const portal = claims({ status: 'Ativo', perfil: 'Cliente', permissions: [], client_id: 'c-a', empresas: [] });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${portal}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.missions;
  `).split('\n').pop(), '1');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${portal}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.clients;
  `).split('\n').pop(), '1');
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${portal}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_invoices;
  `).split('\n').pop(), '0');
  const portalOutro = psql('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${portal}', true);
    SET ROLE authenticated;
    INSERT INTO public.missions (id, client) VALUES ('os-portal-b', 'CLIENTE B');
  `);
  assert.notEqual(portalOutro.status, 0);
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${portal}', true);
    SET ROLE authenticated;
    INSERT INTO public.missions (id, client) VALUES ('os-portal-a', 'CLIENTE A');
    SELECT client FROM public.missions WHERE id = 'os-portal-a';
  `).split('\n').pop(), 'CLIENTE A');

  const mentira = claims({ status: 'Ativo', perfil: 'Operador', permissions: ['missions'], empresas: [] });
  assert.equal(exigir('p0_fin', `
    BEGIN;
    SELECT set_config('request.jwt.claims', '${mentira}', true);
    SET ROLE authenticated;
    SELECT count(*) FROM public.financial_transactions;
  `).split('\n').pop(), '0');
});

test('a reversão de emergência reabre o anon e continua marcada como temporária', () => {
  const texto = fs.readFileSync(REVERSAO, 'utf8');
  assert.match(texto, /NÃO EXECUTAR como estado definitivo/);
  const semMarca = psql('p0_fin', texto);
  assert.notEqual(semMarca.status, 0);
  assert.match(semMarca.stderr, /NÃO EXECUTAR/);
  const aberta = psql('p0_fin', `SET tmseg.p0_emergencia = 'autorizada';\n${texto}`);
  assert.equal(aberta.status, 0, aberta.stderr);
  assert.equal(exigir('p0_fin', `
    SET ROLE anon;
    SELECT count(*) FROM public.financial_transactions;
  `).split('\n').filter(Boolean).pop(), '1');
});
