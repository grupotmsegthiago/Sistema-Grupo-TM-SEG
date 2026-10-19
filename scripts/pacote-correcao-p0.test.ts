import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const pacote = fs.readFileSync('docs/gestorFiscal/sql/2026_10_19_pacote_correcao.NAO_EXECUTAR.sql', 'utf8');
const texto = fs.readFileSync('docs/gestorFiscal/PACOTE-CORRECAO-P0.md', 'utf8');

describe('pacote restante do P0', () => {
  it('aborta sem backup, tela validada e autorização', () => {
    assert.match(pacote, /NÃO EXECUTAR/);
    assert.match(pacote, /system_users/);
    assert.match(pacote, /missions/);
    assert.match(pacote, /financial_invoices/);
    assert.match(pacote, /rolbypassrls/);
    assert.match(pacote, /tmseg\.p0_backup', true\) IS DISTINCT FROM 'conferido'/);
    assert.match(pacote, /tmseg\.p0_telas', true\) IS DISTINCT FROM 'validadas'/);
    assert.match(pacote, /tmseg\.p0_correcao', true\) IS DISTINCT FROM 'autorizada'/);
  });

  it('fecha as policies abertas e preserva o tempo real das missões', () => {
    assert.match(texto, /RLS já está ativo/);
    assert.match(texto, /public_access_fin_trans/);
    assert.match(texto, /financial_invoices_anon_select/);
    assert.match(texto, /tmp_auth_/);
    assert.match(pacote, /DROP POLICY public_access_fin_trans ON public\.financial_transactions/);
    assert.match(pacote, /DROP POLICY public_access_fin_acc ON public\.financial_accounts/);
    assert.match(pacote, /DROP POLICY financial_invoices_anon_select ON public\.financial_invoices/);
    assert.match(pacote, /DROP POLICY public_access_users ON public\.system_users/);
    assert.doesNotMatch(pacote, /DROP POLICY public_access_missions/);
    assert.doesNotMatch(pacote, /DROP POLICY[^;]*tmp_auth_/);
    assert.doesNotMatch(pacote, /ENABLE ROW LEVEL SECURITY/);
    assert.match(pacote, /relrowsecurity IS NOT TRUE/);
  });

  it('não manda aplicar a RLS antiga de JWT nem mexe em cálculo, Asaas ou TORRES', () => {
    assert.match(texto, /Não usar `sql\/2026_10_19_p0_financeiro_rls\.NAO_EXECUTAR\.sql`/);
    assert.match(texto, /app_metadata/);
    assert.match(texto, /Asaas e o cálculo da OS não entram neste pacote/);
    assert.doesNotMatch(pacote, /contaPagarTorres|computeCanonicalRevenueCost|calculateMissionFinancials/);
  });

  it('cadastro, login e portal não devolvem a coluna password', () => {
    const form = fs.readFileSync('components/UserForm.tsx', 'utf8');
    const login = fs.readFileSync('components/Login.tsx', 'utf8');
    const lista = fs.readFileSync('components/UserList.tsx', 'utf8');
    const sessao = fs.readFileSync('lib/sessao/loginProducao.ts', 'utf8');
    const portal = fs.readFileSync('lib/cevaPortal/httpHandler.ts', 'utf8');
    const colunas = (src: string) => [...src.matchAll(/\.select\('([^']+)'\)/g)]
      .flatMap((item) => item[1].split(',').map((coluna) => coluna.trim()));
    assert.match(form, /insert\(\[payload\]\)\.select\('id'\)/);
    assert.equal(colunas(form).includes('password'), false);
    assert.doesNotMatch(login, /from\('system_users'\)/);
    assert.equal(colunas(lista).includes('password'), false);
    const publico = sessao.slice(sessao.indexOf('function publico'), sessao.indexOf('function clienteAdmin'));
    assert.doesNotMatch(publico, /\bpassword\s*:/);
    const equipe = portal.slice(portal.indexOf('function sessaoDaEquipe'), portal.indexOf('async function sessaoEquipeInterna'));
    assert.doesNotMatch(equipe, /\bpassword\s*:/);
  });
});
