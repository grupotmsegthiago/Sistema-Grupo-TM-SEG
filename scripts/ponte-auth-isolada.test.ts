/**
 * Ponte de autenticação isolada. Não entra no login e não lê produção.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { copiaUsuarios } from '../lib/gestorFiscal/ponteAuth/fixtures';
import { FLAG_PONTE_AUTH, atenderProducao, criarPonteIsolada } from '../lib/gestorFiscal/ponteAuth';
import type { FonteConfiavel } from '../lib/gestorFiscal/ponteAuth';
import type { AcaoPonte, PedidoConsulta, UsuarioConfiavel } from '../lib/gestorFiscal/ponteAuth/tipos';

function fonteDe(usuarios: UsuarioConfiavel[]): FonteConfiavel {
  return {
    async ler(usuarioId: string) {
      return usuarios.find((usuario) => usuario.id === usuarioId) ?? null;
    },
  };
}

function pedido(acao: AcaoPonte, extra: Partial<PedidoConsulta> = {}): PedidoConsulta {
  return {
    acao,
    empresaInformada: null,
    clienteInformado: null,
    perfilInformado: 'Diretoria',
    permissoesInformadas: ['*'],
    limite: 10,
    ...extra,
  };
}

function montar(usuarios = copiaUsuarios(), agora = () => 1_000) {
  return criarPonteIsolada(fonteDe(usuarios), { agora });
}

test('a ponte de produção nasce desligada e não consulta mesmo com a flag', () => {
  assert.equal(atenderProducao({}).codigo, 'ponte_desligada');
  assert.equal(atenderProducao({ [FLAG_PONTE_AUTH]: 'TRUE' }).codigo, 'ponte_desligada');
  const ligada = atenderProducao({ [FLAG_PONTE_AUTH]: 'true' });
  assert.equal(ligada.codigo, 'sem_adaptador');
  assert.equal(ligada.linhas.length, 0);
});

test('sessão fictícia válida e token local forjado', async () => {
  const ponte = montar();
  const aberta = await ponte.abrirSessao('usr-diretoria');
  assert.equal(aberta.ok, true);
  if (!aberta.ok) return;
  assert.equal(aberta.token.startsWith('ponte.'), true);
  const consulta = await ponte.consultar(aberta.token, pedido('ler_financeiro'));
  assert.equal(consulta.ok, true);
  assert.equal(consulta.linhas.reduce((total, linha) => total + linha.financeiroCentavos, 0), 150);
  const forjada = await ponte.consultar('tmseg-token-usr-diretoria-1', pedido('ler_financeiro'));
  assert.equal(forjada.codigo, 'sessao_invalida');
  assert.equal(forjada.linhas.length, 0);
});

test('sessão inválida, expirada, revogada e usuário desativado', async () => {
  let agora = 1_000;
  const usuarios = copiaUsuarios();
  const ponte = criarPonteIsolada(fonteDe(usuarios), { agora: () => agora });
  const invalida = await ponte.consultar('ponte.ses-9.nao-existe', pedido('ler_os'));
  assert.equal(invalida.codigo, 'sessao_invalida');
  const aberta = await ponte.abrirSessao('usr-operador');
  assert.equal(aberta.ok, true);
  if (!aberta.ok) return;
  agora = 1_000 + 12 * 60 * 60 * 1000;
  assert.equal((await ponte.consultar(aberta.token, pedido('ler_os'))).codigo, 'sessao_expirada');
  agora = 1_000;
  const outra = await ponte.abrirSessao('usr-diretoria');
  if (!outra.ok) return;
  assert.equal(ponte.revogar(outra.token), true);
  assert.equal((await ponte.consultar(outra.token, pedido('ler_financeiro'))).codigo, 'sessao_revogada');
  const inativo = await ponte.abrirSessao('usr-inativo');
  assert.equal(inativo.ok, false);
  if (inativo.ok) return;
  assert.equal(inativo.codigo, 'usuario_desativado');
});

test('diretoria lê, operador só vê OS e avançado não vê financeiro', async () => {
  const ponte = montar();
  const diretoria = await ponte.abrirSessao('usr-diretoria');
  const operador = await ponte.abrirSessao('usr-operador');
  const avancado = await ponte.abrirSessao('usr-avancado');
  const faturamento = await ponte.abrirSessao('usr-faturamento');
  if (!diretoria.ok || !operador.ok || !avancado.ok || !faturamento.ok) return assert.fail('sessão');
  assert.equal((await ponte.consultar(diretoria.token, pedido('ler_financeiro'))).ok, true);
  assert.equal((await ponte.consultar(diretoria.token, pedido('ler_faturamento'))).codigo, 'sem_permissao');
  const os = await ponte.consultar(operador.token, pedido('ler_os'));
  assert.equal(os.ok, true);
  assert.equal(os.linhas.every((linha) => linha.financeiroCentavos === 0), true);
  assert.equal((await ponte.consultar(operador.token, pedido('ler_financeiro'))).codigo, 'sem_permissao');
  assert.equal((await ponte.consultar(avancado.token, pedido('ler_os'))).ok, true);
  assert.equal((await ponte.consultar(avancado.token, pedido('ler_financeiro'))).codigo, 'sem_permissao');
  assert.equal((await ponte.consultar(faturamento.token, pedido('ler_faturamento'))).ok, true);
});

test('portal fica no próprio cliente e não troca de CNPJ nem de perfil', async () => {
  const ponte = montar();
  const portal = await ponte.abrirSessao('usr-portal');
  const financeiro = await ponte.abrirSessao('usr-financeiro');
  if (!portal.ok || !financeiro.ok) return assert.fail('sessão');
  const proprio = await ponte.consultar(portal.token, pedido('ler_portal'));
  assert.equal(proprio.ok, true);
  assert.deepEqual(proprio.linhas.map((linha) => linha.clienteId), ['cli-a']);
  assert.equal(proprio.linhas[0].financeiroCentavos, 0);
  assert.equal((await ponte.consultar(portal.token, pedido('ler_portal', { clienteInformado: 'cli-b' }))).codigo, 'cliente_alheio');
  assert.equal((await ponte.consultar(portal.token, pedido('ler_financeiro'))).codigo, 'sem_permissao');
  const troca = await ponte.consultar(financeiro.token, pedido('ler_financeiro', {
    empresaInformada: 'FX-SEG',
    perfilInformado: 'Diretoria',
    permissoesInformadas: ['gestor-fiscal', '*'],
  }));
  assert.equal(troca.codigo, 'empresa_nao_autorizada');
  assert.equal(troca.linhas.length, 0);
  const sua = await ponte.consultar(financeiro.token, pedido('ler_financeiro'));
  assert.equal(sua.ok, true);
  assert.deepEqual(sua.linhas.map((linha) => linha.empresaId), ['FX-GESTAO']);
});

test('permissão revogada na fonte e falha de conexão bloqueiam', async () => {
  const usuarios = copiaUsuarios();
  const ponte = criarPonteIsolada(fonteDe(usuarios));
  const aberta = await ponte.abrirSessao('usr-diretoria');
  if (!aberta.ok) return assert.fail('sessão');
  const ficha = usuarios.find((usuario) => usuario.id === 'usr-diretoria');
  if (!ficha) return assert.fail('ficha');
  ficha.permissoes = ['missions'];
  assert.equal((await ponte.consultar(aberta.token, pedido('ler_financeiro'))).codigo, 'sem_permissao');
  ficha.status = 'Inativo';
  assert.equal((await ponte.consultar(aberta.token, pedido('ler_os'))).codigo, 'usuario_desativado');
  const semRede = criarPonteIsolada({
    async ler() {
      throw new Error('sem rede');
    },
  });
  const sessao = await semRede.abrirSessao('usr-operador');
  assert.equal(sessao.ok, false);
  if (sessao.ok) return;
  assert.equal(sessao.codigo, 'fonte_indisponivel');
});

test('limite, logs sem segredo e o login atual permanecem', async () => {
  const ponte = montar();
  const aberta = await ponte.abrirSessao('usr-diretoria');
  if (!aberta.ok) return assert.fail('sessão');
  assert.equal((await ponte.consultar(aberta.token, pedido('ler_financeiro', { limite: 21 }))).codigo, 'limite_consulta');
  const textoLogs = JSON.stringify(ponte.logs());
  assert.equal(textoLogs.includes(aberta.token), false);
  assert.equal(textoLogs.toLowerCase().includes('senha'), false);
  const login = fs.readFileSync('components/Login.tsx', 'utf8');
  assert.equal(login.includes('tmseg-token-${userCheck.id}-${Date.now()}'), false);
  assert.equal(login.includes('/api/ponte-auth/login'), true);
  assert.equal(login.includes('ponteAuth'), false);
  const app = fs.readFileSync('App.tsx', 'utf8');
  const centro = fs.readFileSync('components/gestorFiscal/CentroHomologacao.tsx', 'utf8');
  assert.equal(app.includes('ponteAuth'), false);
  assert.equal(centro.includes('ponteAuth'), false);
  const pasta = fs.readdirSync('lib/gestorFiscal/ponteAuth').map((nome) => fs.readFileSync(`lib/gestorFiscal/ponteAuth/${nome}`, 'utf8')).join('\n');
  assert.equal(pasta.includes('service_role'), false);
  assert.equal(pasta.toLowerCase().includes('supabase'), false);
  assert.equal(pasta.includes('tmseg-token'), true);
  const sql = fs.readFileSync('docs/gestorFiscal/sql/2026_10_19_p0_financeiro_rls.NAO_EXECUTAR.sql', 'utf8');
  assert.match(sql, /NÃO EXECUTAR/);
});
