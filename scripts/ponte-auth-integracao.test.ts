/**
 * Integração isolada da ponte. Não altera login, rotas HTTP nem produção.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { homologacaoRealHabilitada } from '../lib/gestorFiscal/homologacaoReal/flag';
import {
  FLAG_PONTE_AUTH,
  consultarGestorProducao,
  criarIntegracaoIsolada,
  entrarProducao,
  ROTAS_PREPARADAS,
} from '../lib/gestorFiscal/ponteAuth';
import { senhaDoUsuarioIsolado } from '../lib/gestorFiscal/ponteAuth/repositorioIsolado';
import type { RotaPreparada } from '../lib/gestorFiscal/ponteAuth/rotasPreparadas';

function email(id: string): string {
  return `${id}@isolado.invalid`;
}

function senha(id: string): string {
  return senhaDoUsuarioIsolado(id);
}

function alegacaoForjada() {
  return {
    perfilInformado: 'Diretoria',
    permissoesInformadas: ['*', 'gestor-fiscal', 'fin-dashboard'],
    cnpjInformado: '99.999.999/0001-99',
  };
}

test('entradas de produção e a homologação real permanecem desligadas', () => {
  assert.equal(entrarProducao({}).codigo, 'ponte_desligada');
  assert.equal(entrarProducao({ [FLAG_PONTE_AUTH]: 'true' }).codigo, 'sem_adaptador');
  const gestor = consultarGestorProducao({});
  assert.equal(gestor.codigo, 'ponte_desligada');
  assert.equal(gestor.homologacaoReal, false);
  assert.equal(gestor.dados.length, 0);
  assert.equal(consultarGestorProducao({ [FLAG_PONTE_AUTH]: 'true' }).codigo, 'sem_adaptador');
  assert.equal(homologacaoRealHabilitada({}), false);
});

test('login válido, token antigo recusado e rotas representativas', async () => {
  const integracao = await criarIntegracaoIsolada();
  const diretoria = await integracao.entrar(email('usr-diretoria'), senha('usr-diretoria'));
  const operador = await integracao.entrar(email('usr-operador'), senha('usr-operador'));
  const financeiro = await integracao.entrar(email('usr-financeiro'), senha('usr-financeiro'));
  const faturamento = await integracao.entrar(email('usr-faturamento'), senha('usr-faturamento'));
  const avancado = await integracao.entrar(email('usr-avancado'), senha('usr-avancado'));
  const portal = await integracao.entrar(email('usr-portal'), senha('usr-portal'));
  const cadastro = await integracao.entrar(email('usr-cadastro'), senha('usr-cadastro'));
  for (const sessao of [diretoria, operador, financeiro, faturamento, avancado, portal, cadastro]) {
    assert.equal(sessao.ok, true);
  }
  if (!diretoria.ok || !operador.ok || !financeiro.ok || !faturamento.ok || !avancado.ok || !portal.ok || !cadastro.ok) return;

  const os = await integracao.rota('os', operador.token, alegacaoForjada());
  assert.equal(os.ok, true);
  assert.equal(JSON.stringify(os.dados).includes('valorCentavos'), false);
  const painel = await integracao.rota('painel_operacional', operador.token);
  assert.equal(painel.ok, true);
  assert.equal(painel.dados.some((linha) => linha.quantidadeOs === 2), true);
  assert.equal((await integracao.rota('clientes', operador.token, alegacaoForjada())).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('fornecedores', operador.token)).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('financeiro', operador.token, alegacaoForjada())).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('gestor_fiscal', operador.token, alegacaoForjada())).codigo, 'sem_permissao');

  const gestor = await integracao.rota('gestor_fiscal', diretoria.token, alegacaoForjada());
  assert.equal(gestor.ok, true);
  assert.equal(gestor.homologacaoReal, false);
  assert.equal(gestor.dados.reduce((total, linha) => total + Number(linha.valorCentavos), 0), 150);
  const clientes = await integracao.rota('clientes', diretoria.token);
  assert.deepEqual(clientes.dados.map((linha) => linha.id).sort(), ['cli-a', 'cli-b']);
  const fornecedores = await integracao.rota('fornecedores', diretoria.token);
  assert.equal(fornecedores.dados.length, 2);

  const financeiroGestor = await integracao.rota('financeiro', financeiro.token, {
    ...alegacaoForjada(),
    empresaInformada: null,
  });
  assert.equal(financeiroGestor.ok, true);
  assert.deepEqual(financeiroGestor.dados.map((linha) => linha.empresaId), ['FX-GESTAO']);
  assert.equal((await integracao.rota('faturamento', financeiro.token)).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('faturamento', faturamento.token)).ok, true);

  const cadastroClientes = await integracao.rota('clientes', cadastro.token);
  assert.deepEqual(cadastroClientes.dados.map((linha) => linha.empresaId), ['FX-GESTAO']);
  assert.equal((await integracao.rota('fornecedores', cadastro.token)).dados.length, 1);
  assert.equal((await integracao.rota('gestor_fiscal', cadastro.token, alegacaoForjada())).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('os', avancado.token)).ok, true);
  assert.equal((await integracao.rota('gestor_fiscal', avancado.token, alegacaoForjada())).codigo, 'sem_permissao');

  const portalProprio = await integracao.rota('portal', portal.token, alegacaoForjada());
  assert.equal(portalProprio.ok, true);
  assert.deepEqual(portalProprio.dados.map((linha) => linha.clienteId), ['cli-a']);
  assert.equal(JSON.stringify(portalProprio.dados).includes('valorCentavos'), false);
  assert.equal(JSON.stringify(portalProprio.dados).includes('cli-b'), false);
  assert.equal((await integracao.rota('financeiro', portal.token, alegacaoForjada())).codigo, 'sem_permissao');

  for (const rota of ROTAS_PREPARADAS) {
    const antiga = await integracao.rota(rota, 'tmseg-token-usr-diretoria-1', alegacaoForjada());
    assert.equal(antiga.codigo, 'sessao_invalida');
    assert.equal(antiga.dados.length, 0);
    const semToken = await integracao.rota(rota, '   ');
    assert.equal(semToken.codigo, 'sem_autenticacao');
  }
});

test('expiração, revogação, desativação, permissão e falsificações', async () => {
  let agora = 5_000;
  const integracao = await criarIntegracaoIsolada({ agora: () => agora });
  const operador = await integracao.entrar(email('usr-operador'), senha('usr-operador'));
  const diretoria = await integracao.entrar(email('usr-diretoria'), senha('usr-diretoria'));
  const financeiro = await integracao.entrar(email('usr-financeiro'), senha('usr-financeiro'));
  const portal = await integracao.entrar(email('usr-portal'), senha('usr-portal'));
  if (!operador.ok || !diretoria.ok || !financeiro.ok || !portal.ok) return assert.fail('sessão');

  agora = 5_000 + 12 * 60 * 60 * 1000;
  assert.equal((await integracao.rota('os', operador.token)).codigo, 'sessao_expirada');
  agora = 5_000;
  assert.equal(integracao.revogar(diretoria.token), true);
  assert.equal((await integracao.rota('gestor_fiscal', diretoria.token)).codigo, 'sessao_revogada');

  const segunda = await integracao.entrar(email('usr-diretoria'), senha('usr-diretoria'));
  if (!segunda.ok) return assert.fail('segunda sessão');
  integracao.repositorio.substituirPermissoes('usr-diretoria', ['missions']);
  assert.equal((await integracao.rota('gestor_fiscal', segunda.token, alegacaoForjada())).codigo, 'sem_permissao');
  assert.equal((await integracao.rota('os', segunda.token)).ok, true);
  integracao.repositorio.definirStatus('usr-operador', 'Inativo');
  assert.equal((await integracao.rota('os', operador.token)).codigo, 'usuario_desativado');

  const trocaEmpresa = await integracao.rota('financeiro', financeiro.token, {
    empresaInformada: 'FX-SEG',
    cnpjInformado: '99.999.999/0001-99',
    perfilInformado: 'Diretoria',
    permissoesInformadas: ['*'],
  });
  assert.equal(trocaEmpresa.codigo, 'empresa_nao_autorizada');
  assert.equal(trocaEmpresa.dados.length, 0);
  const cnpjIgnorado = await integracao.rota('financeiro', financeiro.token, alegacaoForjada());
  assert.equal(cnpjIgnorado.ok, true);
  assert.deepEqual(cnpjIgnorado.dados.map((linha) => linha.empresaId), ['FX-GESTAO']);
  assert.equal((await integracao.rota('portal', portal.token, { clienteInformado: 'cli-b' })).codigo, 'cliente_alheio');
  assert.equal((await integracao.rota('os', 'impersonation-token-usr-diretoria-1')).codigo, 'sessao_invalida');
  assert.equal((await integracao.rota('gestor_fiscal', financeiro.token, { limite: 21 })).codigo, 'limite_consulta');

  const antes = integracao.sessoes.resumo().length;
  const inativo = await integracao.entrar(email('usr-inativo'), senha('usr-inativo'));
  const desconhecido = await integracao.entrar('ninguem@isolado.invalid', senha('usr-diretoria'));
  const senhaErrada = await integracao.entrar(email('usr-diretoria'), 'senha-errada');
  assert.equal(inativo.ok, false);
  assert.equal(desconhecido.ok, false);
  assert.equal(senhaErrada.ok, false);
  if (!inativo.ok && !desconhecido.ok && !senhaErrada.ok) {
    assert.equal(inativo.codigo, 'usuario_desativado');
    assert.equal(desconhecido.codigo, 'credenciais_invalidas');
    assert.equal(senhaErrada.codigo, 'credenciais_invalidas');
  }
  assert.equal(integracao.sessoes.resumo().length, antes);
});

test('falha de leitura, sessões concorrentes, logs e rotas atuais intocadas', async () => {
  const integracao = await criarIntegracaoIsolada();
  const [primeira, segunda] = await Promise.all([
    integracao.entrar(email('usr-operador'), senha('usr-operador')),
    integracao.entrar(email('usr-operador'), senha('usr-operador')),
  ]);
  if (!primeira.ok || !segunda.ok) return assert.fail('sessões concorrentes');
  assert.notEqual(primeira.token, segunda.token);
  const [os, painel] = await Promise.all([
    integracao.rota('os', primeira.token),
    integracao.rota('painel_operacional', segunda.token),
  ]);
  assert.equal(os.ok, true);
  assert.equal(painel.ok, true);
  assert.equal(integracao.revogar(primeira.token), true);
  assert.equal((await integracao.rota('os', primeira.token)).codigo, 'sessao_revogada');
  assert.equal((await integracao.rota('os', segunda.token)).ok, true);

  const segredo = primeira.token.split('.')[2];
  const resumo = JSON.stringify(integracao.sessoes.resumo());
  assert.equal(resumo.includes(segredo), false);
  assert.equal(resumo.includes('scrypt'), false);
  assert.equal(integracao.sessoes.resumo().every((sessao) => sessao.hashHex.length === 64), true);

  integracao.repositorio.simularFalha(true);
  const queda = await integracao.rota('os', segunda.token);
  assert.equal(queda.codigo, 'fonte_indisponivel');
  assert.equal(queda.dados.length, 0);
  const loginCaido = await integracao.entrar(email('usr-diretoria'), senha('usr-diretoria'));
  assert.equal(loginCaido.ok, false);
  if (!loginCaido.ok) assert.equal(loginCaido.codigo, 'fonte_indisponivel');
  assert.equal(integracao.repositorio.producaoAlterada(), false);

  const ficha = await (async () => {
    integracao.repositorio.simularFalha(false);
    return integracao.repositorio.ler('usr-diretoria');
  })();
  const textoFicha = JSON.stringify(ficha);
  assert.equal(textoFicha.includes('scrypt'), false);
  assert.equal(textoFicha.includes(senha('usr-diretoria')), false);

  const textoLogs = JSON.stringify(integracao.logs());
  assert.equal(textoLogs.includes(primeira.token), false);
  assert.equal(textoLogs.includes(senha('usr-operador')), false);
  assert.equal(textoLogs.includes('scrypt'), false);

  const login = fs.readFileSync('components/Login.tsx', 'utf8');
  assert.equal(login.includes('tmseg-token-${userCheck.id}-${Date.now()}'), true);
  assert.equal(login.includes('userCheck.password !== cleanPassword'), true);
  assert.equal(login.includes('ponteAuth'), false);
  for (const pasta of ['api', 'server', 'components']) {
    assert.deepEqual(arquivosCom(pasta, 'ponteAuth'), []);
    assert.deepEqual(arquivosCom(pasta, 'criarIntegracaoIsolada'), []);
  }
  assert.equal(fs.readFileSync('App.tsx', 'utf8').includes('ponteAuth'), false);
  const sql = fs.readFileSync('docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql', 'utf8');
  assert.match(sql, /NÃO EXECUTAR/);
  const codigo = lerPasta('lib/gestorFiscal/ponteAuth');
  assert.equal(codigo.toLowerCase().includes('service_role'), false);
  assert.equal(codigo.includes('ajhmmjuewdsukecaimik'), false);
});

function arquivosCom(diretorio: string, agulha: string): string[] {
  const achados: string[] = [];
  for (const nome of fs.readdirSync(diretorio)) {
    const caminho = path.join(diretorio, nome);
    if (fs.statSync(caminho).isDirectory()) {
      achados.push(...arquivosCom(caminho, agulha));
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(nome)) continue;
    if (fs.readFileSync(caminho, 'utf8').includes(agulha)) achados.push(caminho);
  }
  return achados;
}

function lerPasta(diretorio: string): string {
  return fs.readdirSync(diretorio).map((nome) => {
    const caminho = path.join(diretorio, nome);
    return fs.statSync(caminho).isDirectory() ? lerPasta(caminho) : fs.readFileSync(caminho, 'utf8');
  }).join('\n');
}

test('o tipo das rotas preparadas permanece fechado', () => {
  const rotas: readonly RotaPreparada[] = ROTAS_PREPARADAS;
  assert.equal(rotas.length, 8);
});
