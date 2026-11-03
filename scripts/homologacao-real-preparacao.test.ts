import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REFERENCIA_ETAPA_7 } from '../lib/gestorFiscal/centroHomologacao';
import {
  CATALOGO_FIXTURE,
  FLAG_HOMOLOGACAO_REAL,
  PERMISSAO_FUTURA_HOMOLOGAR,
  REFERENCIA_PROTEGIDA,
  criarServicoHomologacao,
  homologacaoRealHabilitada,
  identidadeDiretoria,
  type LancamentoProtegido,
  type PedidoDecisao,
} from '../lib/gestorFiscal/homologacaoReal';

function item(id: string): LancamentoProtegido {
  const achado = CATALOGO_FIXTURE.find((lancamento) => lancamento.id === id);
  if (!achado) throw new Error(id);
  return achado;
}

function pedido(id: string, extra: Partial<PedidoDecisao> = {}): PedidoDecisao {
  const lancamento = item(id);
  return {
    chaveIdempotencia: `chave-${id}-${extra.versaoEsperada ?? 0}`,
    lancamentoId: id,
    empresaId: lancamento.empresaId,
    cnpj: lancamento.cnpj,
    valorConsideradoCentavos: lancamento.valorCentavos,
    classificacao: lancamento.classificacao === 'gerencial' ? 'gerencial' : 'gerencial',
    justificativa: 'Decisão fictícia da fase 2, sem pessoa e sem documento real.',
    referenciaDocumental: lancamento.documentoInformado ? 'doc-fx' : '',
    evidencias: ['fixture-ficticia'],
    versaoEsperada: 0,
    ...extra,
  };
}

function servico() {
  return criarServicoHomologacao(CATALOGO_FIXTURE);
}

test('a flag nasce desligada e a ausência também desliga', () => {
  assert.equal(FLAG_HOMOLOGACAO_REAL, 'GESTOR_FISCAL_HOMOLOGACAO_REAL_ENABLED');
  assert.equal(homologacaoRealHabilitada({}), false);
  assert.equal(homologacaoRealHabilitada({ [FLAG_HOMOLOGACAO_REAL]: undefined }), false);
  assert.equal(homologacaoRealHabilitada({ [FLAG_HOMOLOGACAO_REAL]: 'false' }), false);
  assert.equal(homologacaoRealHabilitada({ [FLAG_HOMOLOGACAO_REAL]: 'TRUE' }), false);
  assert.equal(homologacaoRealHabilitada({ [FLAG_HOMOLOGACAO_REAL]: '1' }), false);
  assert.equal(homologacaoRealHabilitada({ [FLAG_HOMOLOGACAO_REAL]: 'true' }), true);
});

test('homologação, rejeição, documentação e preparação ficam na memória', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const preparado = local.preparar(diretoria, pedido('fx-seg-lista', { chaveIdempotencia: 'prep' }));
  assert.equal(preparado.ok, true);
  if (!preparado.ok) return;
  assert.equal(preparado.decisao.status, 'preparada');
  assert.equal(preparado.impacto.resultadoCentavos, REFERENCIA_PROTEGIDA.painelCentavos);

  const rejeitado = local.simularRejeicao(diretoria, pedido('fx-gest-adicional', { chaveIdempotencia: 'rej' }));
  assert.equal(rejeitado.ok, true);
  if (!rejeitado.ok) return;
  assert.equal(rejeitado.decisao.status, 'rejeitada_simulada');
  assert.equal(rejeitado.impacto.despesaHomologadaCentavos, 0);

  const documento = local.simularDocumentacao(diretoria, pedido('fx-sec-ambiguo', {
    chaveIdempotencia: 'doc',
    empresaId: null,
    cnpj: null,
    classificacao: 'pendente',
  }));
  assert.equal(documento.ok, true);
  if (!documento.ok) return;
  assert.equal(documento.decisao.status, 'documentacao_solicitada');
  assert.equal(documento.decisao.empresaId, null);
  assert.equal(documento.impacto.resultadoCentavos, REFERENCIA_PROTEGIDA.painelCentavos);
});

test('a homologação simulada dos três lotes elegíveis fecha o cenário provisório em centavos', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  for (const id of ['fx-seg-lista', 'fx-gest-adicional', 'fx-sec-tarifas']) {
    const passo = local.simularHomologacao(diretoria, pedido(id));
    assert.equal(passo.ok, true, id);
  }
  const impacto = local.calcularImpacto();
  assert.equal(impacto.despesaHomologadaCentavos, 33_656_211 + 12_643 + 5_379);
  assert.equal(impacto.resultadoCentavos, REFERENCIA_PROTEGIDA.elegivelCentavos);
  assert.equal(impacto.resultadoCentavos, 447_915_905);
  assert.notEqual(impacto.resultadoCentavos, REFERENCIA_PROTEGIDA.aptoHistoricoCentavos);
  assert.equal(impacto.receitaCentavos, REFERENCIA_ETAPA_7.grupo.receitaCentavos);
  assert.equal(impacto.custoOsCentavos, REFERENCIA_ETAPA_7.grupo.custoOsCentavos);
  assert.equal(impacto.despesaReconhecidaCentavos, 17_297);
  assert.equal(impacto.homologacaoReal, false);
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM SEGURANCA')?.despesaHomologadaCentavos, 33_656_211);
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM GESTAO')?.despesaHomologadaCentavos, 12_643);
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM SECURITY')?.despesaHomologadaCentavos, 5_379);
});

test('revogação tira o impacto e conserva o histórico e a versão', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const aprovado = local.simularHomologacao(diretoria, pedido('fx-seg-lista'));
  assert.equal(aprovado.ok, true);
  if (!aprovado.ok) return;
  const antigo = local.consultarHistorico('fx-seg-lista')[0];
  const revogado = local.simularRevogacao(diretoria, pedido('fx-seg-lista', {
    chaveIdempotencia: 'revoga',
    versaoEsperada: 1,
  }));
  assert.equal(revogado.ok, true);
  if (!revogado.ok) return;
  assert.equal(revogado.decisao.versao, 2);
  assert.equal(revogado.decisao.decisaoAnteriorId, antigo.id);
  assert.equal(revogado.impacto.resultadoCentavos, REFERENCIA_PROTEGIDA.painelCentavos);
  assert.deepEqual(local.consultarHistorico('fx-seg-lista')[0], antigo);
  assert.equal(local.consultarHistorico('fx-seg-lista')[0].status, 'homologada_simulada');
  assert.equal(local.consultarHistorico('fx-seg-lista')[1].status, 'revogada_simulada');
});

test('a mesma chave é idempotente e a chave da revogada não reativa', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const primeiro = local.simularHomologacao(diretoria, pedido('fx-gest-adicional', { chaveIdempotencia: 'unica' }));
  const repetido = local.simularHomologacao(diretoria, pedido('fx-gest-adicional', { chaveIdempotencia: 'unica', versaoEsperada: 9 }));
  assert.equal(primeiro.ok && repetido.ok, true);
  if (!primeiro.ok || !repetido.ok) return;
  assert.equal(repetido.repetida, true);
  assert.equal(repetido.decisao.id, primeiro.decisao.id);
  assert.equal(local.calcularImpacto().despesaHomologadaCentavos, 12_643);
  const revogado = local.simularRevogacao(diretoria, pedido('fx-gest-adicional', { chaveIdempotencia: 'revoga', versaoEsperada: 1 }));
  assert.equal(revogado.ok, true);
  const reativada = local.simularHomologacao(diretoria, pedido('fx-gest-adicional', { chaveIdempotencia: 'revoga', versaoEsperada: 2 }));
  assert.equal(reativada.ok, false);
  if (reativada.ok) return;
  assert.equal(reativada.codigo, 'revogada_nao_reativa');
  assert.equal(local.calcularImpacto().despesaHomologadaCentavos, 0);
  assert.equal(local.consultarHistorico('fx-gest-adicional').at(-1)?.status, 'revogada_simulada');
});

test('duas aprovações com a mesma versão conflitam e a segunda não duplica', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const primeira = local.simularHomologacao(diretoria, pedido('fx-sec-tarifas', { chaveIdempotencia: 'a', versaoEsperada: 0 }));
  const simultanea = local.simularHomologacao(diretoria, pedido('fx-sec-tarifas', { chaveIdempotencia: 'b', versaoEsperada: 0 }));
  const depois = local.simularHomologacao(diretoria, pedido('fx-sec-tarifas', { chaveIdempotencia: 'c', versaoEsperada: 1 }));
  assert.equal(primeira.ok, true);
  assert.equal(simultanea.ok, false);
  assert.equal(depois.ok, false);
  if (simultanea.ok || depois.ok) return;
  assert.equal(simultanea.codigo, 'conflito_versao');
  assert.equal(depois.codigo, 'duplicidade');
  assert.equal(local.calcularImpacto().despesaHomologadaCentavos, 5_379);
  assert.deepEqual(local.identificarConflitos(pedido('fx-sec-tarifas', { versaoEsperada: 0 })), ['conflito_versao', 'duplicidade']);
});

test('permissão, empresa e navegador bloqueiam e a tentativa fica registrada', () => {
  const local = servico();
  const semPermissao = local.simularHomologacao({
    ...identidadeDiretoria(),
    permissoes: ['gestor-fiscal'],
  }, pedido('fx-seg-lista'));
  const outraEmpresa = local.simularHomologacao(identidadeDiretoria(['TM GESTAO']), pedido('fx-seg-lista'));
  const navegador = local.simularHomologacao({ ...identidadeDiretoria(), origem: 'navegador' }, pedido('fx-seg-lista'));
  const anonimo = local.simularHomologacao({ ...identidadeDiretoria(), autenticado: false, usuarioId: '' }, pedido('fx-seg-lista'));
  assert.equal(semPermissao.ok, false);
  assert.equal(outraEmpresa.ok, false);
  assert.equal(navegador.ok, false);
  assert.equal(anonimo.ok, false);
  if (semPermissao.ok || outraEmpresa.ok || navegador.ok || anonimo.ok) return;
  assert.equal(semPermissao.codigo, 'sem_permissao');
  assert.equal(outraEmpresa.codigo, 'empresa_nao_autorizada');
  assert.equal(navegador.codigo, 'origem_navegador');
  assert.equal(anonimo.codigo, 'nao_autenticado');
  assert.equal(local.calcularImpacto().resultadoCentavos, REFERENCIA_PROTEGIDA.painelCentavos);
  assert.deepEqual(local.consultarTentativas().map((item) => item.codigo), [
    'sem_permissao',
    'empresa_nao_autorizada',
    'origem_navegador',
    'nao_autenticado',
  ]);
});

test('os casos protegidos não entram no resultado', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const reconhecido = local.simularHomologacao(diretoria, pedido('fx-gest-reconhecido'));
  const ambiguo = local.simularHomologacao(diretoria, pedido('fx-sec-ambiguo', { empresaId: 'TM SECURITY', cnpj: 'FX-SEC' }));
  const semCnpj = local.simularHomologacao(diretoria, pedido('fx-sem-cnpj', { empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG' }));
  const fornecedor = local.simularHomologacao(diretoria, pedido('fx-fornecedor', { classificacao: 'custo_os' }));
  const cancelado = local.simularHomologacao(diretoria, pedido('fx-cancelado'));
  const semDocumento = local.simularHomologacao(diretoria, pedido('fx-sem-documento'));
  const valorTrocado = local.simularHomologacao(diretoria, pedido('fx-sec-tarifas', { valorConsideradoCentavos: 5_380 }));
  const empresaTrocada = local.simularHomologacao(diretoria, pedido('fx-gest-adicional', { empresaId: 'TM SEGURANCA', cnpj: 'FX-SEG' }));
  assert.equal(reconhecido.ok, false);
  assert.equal(ambiguo.ok, false);
  assert.equal(semCnpj.ok, false);
  assert.equal(fornecedor.ok, false);
  assert.equal(cancelado.ok, false);
  assert.equal(semDocumento.ok, false);
  assert.equal(valorTrocado.ok, false);
  assert.equal(empresaTrocada.ok, false);
  if (reconhecido.ok || ambiguo.ok || semCnpj.ok || fornecedor.ok || cancelado.ok || semDocumento.ok || valorTrocado.ok || empresaTrocada.ok) return;
  assert.equal(reconhecido.codigo, 'ja_no_resultado');
  assert.equal(ambiguo.codigo, 'cnpj_ambiguo');
  assert.equal(semCnpj.codigo, 'cnpj_ambiguo');
  assert.equal(fornecedor.codigo, 'natureza_fora');
  assert.equal(cancelado.codigo, 'cancelado');
  assert.equal(semDocumento.codigo, 'sem_documento');
  assert.equal(valorTrocado.codigo, 'valor_alterado');
  assert.equal(empresaTrocada.codigo, 'empresa_divergente');
  assert.equal(local.calcularImpacto().resultadoCentavos, REFERENCIA_PROTEGIDA.painelCentavos);
  assert.equal(REFERENCIA_PROTEGIDA.securityAmbiguoCentavos, 65_000);
  assert.equal(REFERENCIA_PROTEGIDA.semCnpjCentavos, 110_863);
  assert.equal(REFERENCIA_PROTEGIDA.jaReconhecidoCentavos, 17_297);
  assert.equal(REFERENCIA_PROTEGIDA.aptoHistoricoCentavos, 447_850_905);
});

test('as empresas não herdam despesa uma da outra', () => {
  const local = servico();
  const passo = local.simularHomologacao(identidadeDiretoria(), pedido('fx-gest-adicional'));
  assert.equal(passo.ok, true);
  if (!passo.ok) return;
  const impacto = passo.impacto;
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM GESTAO')?.despesaHomologadaCentavos, 12_643);
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM SEGURANCA')?.despesaHomologadaCentavos, 0);
  assert.equal(impacto.porEmpresa.find((empresa) => empresa.empresaId === 'TM SECURITY')?.despesaHomologadaCentavos, 0);
});

test('a escrita real não grava nem com a flag ligada', () => {
  const diretoria = identidadeDiretoria();
  const local = servico();
  const desligada = local.tentarPersistenciaReal(diretoria, pedido('fx-seg-lista'), {});
  const ligada = local.tentarPersistenciaReal(diretoria, pedido('fx-seg-lista'), { [FLAG_HOMOLOGACAO_REAL]: 'true' });
  assert.equal(desligada.ok, false);
  assert.equal(ligada.ok, false);
  if (desligada.ok || ligada.ok) return;
  assert.equal(desligada.codigo, 'ativacao_desligada');
  assert.equal(ligada.codigo, 'escrita_nao_disponivel');
  assert.equal(local.consultarHistorico().length, 0);
  assert.equal(local.calcularImpacto().despesaHomologadaCentavos, 0);
});

test('a fase 2 não entra no centro, nas permissões nem no banco', () => {
  const pasta = 'lib/gestorFiscal/homologacaoReal';
  const fontes = fs.readdirSync(pasta).map((nome) => fs.readFileSync(path.join(pasta, nome), 'utf8')).join('\n');
  assert.equal(fontes.includes('supabase'), false);
  assert.equal(fontes.includes('.insert('), false);
  assert.equal(fontes.includes('.update('), false);
  assert.equal(fontes.includes('.delete('), false);
  assert.equal(fontes.includes('localStorage'), false);
  assert.equal(fontes.includes('computeCanonicalRevenueCost'), false);
  assert.equal(/erjhxwbutjyylxdthuuz|torres/i.test(fontes), false);
  const centro = fs.readFileSync('components/gestorFiscal/CentroHomologacao.tsx', 'utf8');
  const pagina = fs.readFileSync('components/gestorFiscal/GestorFiscalPage.tsx', 'utf8');
  const acesso = fs.readFileSync('lib/screenAccess.ts', 'utf8');
  const esquema = fs.readFileSync('docs/gestorFiscal/HOMOLOGACAO-REAL-NAO-EXECUTAR.md', 'utf8');
  assert.equal(centro.includes('homologacaoReal'), false);
  assert.equal(pagina.includes('homologacaoReal'), false);
  assert.equal(acesso.includes(PERMISSAO_FUTURA_HOMOLOGAR), false);
  assert.match(pagina, /Visão Geral Fiscal/);
  assert.match(pagina, /Simples × Lucro Real/);
  assert.match(pagina, /Reajuste de Fornecedores/);
  assert.match(pagina, /Reajuste de Clientes/);
  assert.match(pagina, /Gestão de Notas Fiscais/);
  assert.match(pagina, /Análise Histórica Mensal/);
  assert.match(pagina, /Termômetro de Rentabilidade/);
  assert.match(esquema, /NÃO EXECUTAR/);
  assert.equal(/^\s*CREATE TABLE/m.test(esquema), false);
  assert.equal(fs.readdirSync('migrations').some((nome) => nome.includes('homologacao')), false);
});
