/**
 * Ensaio único do plano P0, num Postgres local e com dados fictícios.
 * Não aponta para produção e não lê o outro projeto.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { hashSenha } from '../lib/cevaPortal/acesso';
import { INTEGRACAO_HTTP_LIBERADA } from '../lib/gestorFiscal/ponteAuth/flag';
import { conferirSenhaExistente } from '../lib/gestorFiscal/ponteAuth/formatoSenha';
import { atenderPonteHttp } from '../lib/gestorFiscal/ponteAuth/httpPonte';
import { identificarFormatoHash } from '../lib/gestorFiscal/ponteAuth/hashSenha';
import { MIGRACAO_SENHA_LIBERADA, autenticarEMigrar, type RegistroSenha, type RepositorioSenha } from '../lib/gestorFiscal/ponteAuth/migracaoSenha';
import { resumirGestorCanonico } from '../lib/gestorFiscal/ponteAuth/resumoGestorHttp';
import { createHash } from 'node:crypto';

const PSQL = '/usr/lib/postgresql/16/bin/psql';
const PG_DUMP = '/usr/lib/postgresql/16/bin/pg_dump';
const PG_RESTORE = '/usr/lib/postgresql/16/bin/pg_restore';
const SENHA = 'senha-ficticia-integrada';
const DUMP = '/tmp/p0-implantacao-ficticio.dump';

function psql(db: string, sql: string) {
  return spawnSync(PSQL, ['-h', '/tmp', '-p', '55432', '-U', 'p0', '-d', db, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
    encoding: 'utf8',
    input: sql,
  });
}

function exigir(db: string, sql: string): string {
  const resultado = psql(db, sql);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  return resultado.stdout.trim();
}

function aplicar(db: string, arquivo: string, marca: string) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const semMarca = psql(db, texto);
  assert.notEqual(semMarca.status, 0);
  assert.match(semMarca.stderr, /NÃO EXECUTAR/);
  const comMarca = psql(db, `${marca}\n${texto}`);
  assert.equal(comMarca.status, 0, comMarca.stderr);
}

function aspas(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

function repositorio(db: string): RepositorioSenha {
  return {
    async ler(id: string): Promise<RegistroSenha | null> {
      const linha = exigir(db, `
        SELECT status || '|' || origem || '|' || coalesce(password, '') || '|' || coalesce(password_hash, '')
          || '|' || geracao::text || '|' || coalesce(sessao_legada, '')
        FROM public.system_users WHERE id = ${aspas(id)};
      `);
      if (!linha) return null;
      const [status, origem, texto, hash, geracao, sessaoLegada] = linha.split('|');
      return {
        id,
        status: status as RegistroSenha['status'],
        origem: origem as RegistroSenha['origem'],
        texto: texto || null,
        hash: hash || null,
        geracao: Number(geracao),
        sessaoLegada: sessaoLegada || null,
      };
    },
    async gravarHash(id, hash, geracao) {
      const atualizado = exigir(db, `
        WITH atualizado AS (
          UPDATE public.system_users
          SET password_hash = ${aspas(hash)}, geracao = geracao + 1
          WHERE id = ${aspas(id)} AND geracao = ${geracao} AND password_hash IS NULL
          RETURNING id
        )
        SELECT id FROM atualizado;
      `);
      return atualizado === id ? 'ok' : 'conflito';
    },
    async apagarTexto(id, geracao) {
      const atualizado = exigir(db, `
        WITH atualizado AS (
          UPDATE public.system_users
          SET password = NULL
          WHERE id = ${aspas(id)} AND geracao = ${geracao} AND password_hash IS NOT NULL
          RETURNING id
        )
        SELECT id FROM atualizado;
      `);
      return atualizado === id ? 'ok' : 'conflito';
    },
  };
}

test('o ensaio isolado percorre login, sessão, migração, rotas e RLS sem produção', () => {
  assert.equal(INTEGRACAO_HTTP_LIBERADA, false);
  assert.equal(MIGRACAO_SENHA_LIBERADA, false);
  exigir('postgres', 'DROP DATABASE IF EXISTS p0_implantacao; CREATE DATABASE p0_implantacao;');
  exigir('p0_implantacao', `
    CREATE TABLE public.system_users (
      id text PRIMARY KEY,
      status text NOT NULL,
      origem text NOT NULL,
      password text,
      geracao integer NOT NULL DEFAULT 0,
      sessao_legada text
    );
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
    INSERT INTO public.system_users (id, status, origem, password, sessao_legada) VALUES
      ('fun', 'Ativo', 'funcionario', ${aspas(SENHA)}, 'legada-fun'),
      ('inativo', 'Inativo', 'funcionario', ${aspas(SENHA)}, 'legada-inativo'),
      ('cliente', 'Ativo', 'portal_cliente', NULL, 'legada-cliente');
    INSERT INTO public.clients VALUES ('c-a', 'CLIENTE A', 'FX-GESTAO'), ('c-b', 'CLIENTE B', 'FX-SEG');
    INSERT INTO public.missions VALUES ('os-a', 'CLIENTE A'), ('os-b', 'CLIENTE B');
    INSERT INTO public.financial_invoices VALUES ('f-a', 'FX-GESTAO', 'CLIENTE A'), ('f-b', 'FX-SEG', 'CLIENTE B');
    INSERT INTO public.financial_transactions VALUES ('t-1');
    INSERT INTO public.financial_accounts VALUES ('acc-1');
    INSERT INTO public.financial_categories VALUES ('cat-1');
    INSERT INTO public.providers VALUES ('p-1');
    INSERT INTO public.client_price_tables VALUES ('preco-1', 'CLIENTE A');
    INSERT INTO public.provider_cost_tables VALUES ('custo-1', 'FORNECEDOR FX');
    INSERT INTO public.financial_invoice_missions VALUES ('f-a', 'os-a');
  `);
  const hashPortal = hashSenha('senha-ficticia-portal');
  const copia = spawnSync(PG_DUMP, ['-h', '/tmp', '-p', '55432', '-U', 'p0', '-d', 'p0_implantacao', '-F', 'c', '-f', DUMP], { encoding: 'utf8' });
  assert.equal(copia.status, 0, copia.stderr);

  aplicar('p0_implantacao', 'docs/gestorFiscal/sql/2026_10_19_password_hash.NAO_EXECUTAR.sql', "SET tmseg.p0_teste_isolado = 'ligado';");
  aplicar('p0_implantacao', 'docs/gestorFiscal/sql/2026_10_19_ponte_sessoes.NAO_EXECUTAR.sql', "SET tmseg.p0_teste_isolado = 'ligado';");
  exigir('p0_implantacao', `UPDATE public.system_users SET password_hash = ${aspas(hashPortal)} WHERE id = 'cliente';`);

  assert.equal(conferirSenhaExistente(SENHA, exigir('p0_implantacao', "SELECT password FROM public.system_users WHERE id = 'fun';")), true);

  const repo = repositorio('p0_implantacao');
  return autenticarEMigrar(repo, { usuarioId: 'fun', senha: SENHA }, { testeLocal: true }).then(async (migrado) => {
    assert.equal(migrado.migracao, 'concluida');
    assert.equal(exigir('p0_implantacao', "SELECT password IS NULL FROM public.system_users WHERE id = 'fun';"), 't');
    const hashFun = exigir('p0_implantacao', "SELECT password_hash FROM public.system_users WHERE id = 'fun';");
    assert.equal(identificarFormatoHash(hashFun), 'scrypt_v1');
    assert.equal(conferirSenhaExistente(SENHA, hashFun), true);
    assert.equal(exigir('p0_implantacao', "SELECT sessao_legada FROM public.system_users WHERE id = 'fun';"), 'legada-fun');
    assert.equal((await autenticarEMigrar(repo, { usuarioId: 'inativo', senha: SENHA }, { testeLocal: true })).codigo, 'usuario_desativado');
    assert.equal(exigir('p0_implantacao', "SELECT password IS NOT NULL FROM public.system_users WHERE id = 'inativo';"), 't');
    assert.equal((await autenticarEMigrar(repo, { usuarioId: 'cliente', senha: 'senha-ficticia-portal' }, { testeLocal: true })).migracao, 'preservada');
    assert.equal(exigir('p0_implantacao', "SELECT password_hash FROM public.system_users WHERE id = 'cliente';"), hashPortal);

    const token = 'ponte.http.ensaio.segredo-ficticio';
    const hashSessao = createHash('sha256').update(token).digest('hex');
    exigir('p0_implantacao', `
      INSERT INTO tmseg_private.ponte_sessoes
        (id, usuario_id, token_hash, csrf_hash, criada_em, expira_em, ultima_atividade)
      VALUES ('ses-1', 'fun', ${aspas(hashSessao)}, 'csrf-hash', now(), now() + interval '12 hours', now());
    `);
    assert.equal(exigir('p0_implantacao', "SELECT usuario_id FROM tmseg_private.ponte_sessoes WHERE token_hash = " + aspas(hashSessao)), 'fun');
    assert.equal(exigir('p0_implantacao', "SELECT count(*) FROM tmseg_private.ponte_sessoes WHERE token_hash LIKE 'tmseg-token%' OR token_hash LIKE '%senha-ficticia%';"), '0');
    exigir('p0_implantacao', "UPDATE tmseg_private.ponte_sessoes SET revogada_em = now() WHERE id = 'ses-1';");
    assert.equal(exigir('p0_implantacao', "SELECT revogada_em IS NOT NULL FROM tmseg_private.ponte_sessoes WHERE id = 'ses-1';"), 't');

    assert.equal(conferirSenhaExistente(SENHA, hashFun), true);

    const resumo = resumirGestorCanonico([
      { id: 'os-a', status: 'Concluída', empresaEmissora: 'TM GESTÃO', revenue_value: 10, cost_value: 4, billing_approved: true, contaPagadora: 'TM SEGURANÇA' },
      { id: 'os-sem', status: 'Concluída', empresaEmissora: null, revenue_value: 99, cost_value: 99, billing_approved: true, contaPagadora: 'TM SEGURANÇA' },
    ], ['TM GESTAO']);
    assert.deepEqual(resumo, [{ empresaKey: 'TM GESTAO', quantidadeOs: 1, receita: 10, custo: 4 }]);

    aplicar('p0_implantacao', 'docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql', "SET tmseg.p0_teste_isolado = 'ligado';");
    exigir('p0_implantacao', 'GRANT anon, authenticated TO p0;');
    const anon = psql('p0_implantacao', 'SET ROLE anon; SELECT count(*) FROM public.financial_transactions;');
    assert.notEqual(anon.status, 0);
    assert.match(anon.stderr, /permission denied/i);

    const operador = JSON.stringify({
      role: 'authenticated',
      app_metadata: { status: 'Ativo', perfil: 'Operador', permissions: ['missions'], empresas: [] },
      user_metadata: { perfil: 'Diretoria', permissions: ['*'], empresas: ['FX-GESTAO'] },
    }).replace(/'/g, "''");
    assert.equal(exigir('p0_implantacao', `
      BEGIN;
      SELECT set_config('request.jwt.claims', '${operador}', true);
      SET ROLE authenticated;
      SELECT count(*) FROM public.missions;
    `).split('\n').pop(), '2');
    assert.equal(exigir('p0_implantacao', `
      BEGIN;
      SELECT set_config('request.jwt.claims', '${operador}', true);
      SET ROLE authenticated;
      SELECT count(*) FROM public.financial_invoices;
    `).split('\n').pop(), '0');

    const diretoria = JSON.stringify({
      role: 'authenticated',
      app_metadata: { status: 'Ativo', perfil: 'Diretoria', permissions: ['gestor-fiscal'], empresas: [] },
      user_metadata: { perfil: 'Operador', permissions: [] },
    }).replace(/'/g, "''");
    assert.equal(exigir('p0_implantacao', `
      BEGIN;
      SELECT set_config('request.jwt.claims', '${diretoria}', true);
      SET ROLE authenticated;
      SELECT count(*) FROM public.financial_invoices;
    `).split('\n').pop(), '2');

    const umaEmpresa = JSON.stringify({
      role: 'authenticated',
      app_metadata: { status: 'Ativo', perfil: 'Financeiro', permissions: ['fin-dashboard'], empresas: ['FX-GESTAO'] },
      user_metadata: { empresas: ['FX-SEG'] },
    }).replace(/'/g, "''");
    assert.equal(exigir('p0_implantacao', `
      BEGIN;
      SELECT set_config('request.jwt.claims', '${umaEmpresa}', true);
      SET ROLE authenticated;
      SELECT count(*) FROM public.financial_invoices;
    `).split('\n').pop(), '1');

    const portal = JSON.stringify({
      role: 'authenticated',
      app_metadata: { status: 'Ativo', perfil: 'Cliente', permissions: [], client_id: 'c-a', empresas: [] },
      user_metadata: { client_id: 'c-b' },
    }).replace(/'/g, "''");
    assert.equal(exigir('p0_implantacao', `
      BEGIN;
      SELECT set_config('request.jwt.claims', '${portal}', true);
      SET ROLE authenticated;
      SELECT count(*) FROM public.missions;
    `).split('\n').pop(), '1');

    const ponte = await atenderPonteHttp({
      acao: 'gestor', method: 'GET', cookie: null, csrf: null, authorization: 'Bearer tmseg-token-fun-1', body: {}, consulta: {},
    }, { env: {} });
    assert.equal(ponte.body.codigo, 'ponte_desligada');
    assert.equal(JSON.stringify(ponte.body).includes(SENHA), false);

    exigir('postgres', 'DROP DATABASE IF EXISTS p0_implantacao_restaurado; CREATE DATABASE p0_implantacao_restaurado;');
    const restaura = spawnSync(PG_RESTORE, ['-h', '/tmp', '-p', '55432', '-U', 'p0', '-d', 'p0_implantacao_restaurado', '--no-owner', DUMP], { encoding: 'utf8' });
    assert.equal(restaura.status, 0, restaura.stderr);
    assert.equal(exigir('p0_implantacao_restaurado', "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';"), '0');
    assert.equal(exigir('p0_implantacao_restaurado', "SELECT password FROM public.system_users WHERE id = 'fun';"), SENHA);
    assert.equal(exigir('p0_implantacao_restaurado', "SELECT count(*) FROM public.financial_invoices;"), '2');
    assert.equal(exigir('p0_implantacao_restaurado', "SELECT to_regclass('tmseg_private.ponte_sessoes') IS NULL;"), 't');
    fs.rmSync(DUMP, { force: true });
  });
});
