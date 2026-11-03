import test from 'node:test';
import assert from 'node:assert/strict';
import { avisoInclusaoAdmin, decidirGravacao, nomeParaFiltro, podeIncluirFiltroNovo, servicoDoSistema, SERVICOS_FIXOS } from '../lib/cevaPortal/camposCliente';

test('serviço vem do tipo gravado na OS', () => {
  assert.equal(servicoDoSistema('Velada'), 'Pronta Resposta');
  assert.equal(servicoDoSistema('Caracterizada'), 'Escolta Caracterizada');
  assert.equal(servicoDoSistema('Pronta Resposta'), 'Pronta Resposta');
  assert.equal(servicoDoSistema(''), 'Escolta Caracterizada');
});

test('nome novo de contrato pede confirmação em maiúsculas', () => {
  const decisao = decidirGravacao('contrato', '  Shopee  ', []);
  assert.deepEqual(decisao, { acao: 'confirmar', nome: 'SHOPEE' });
  assert.equal(nomeParaFiltro('Shopee'), 'SHOPEE');
});

test('nome já gravado aplica sem criar outro filtro', () => {
  const decisao = decidirGravacao('operacao', 'shopee', ['SHOPEE']);
  assert.deepEqual(decisao, { acao: 'aplicar', valor: 'SHOPEE', novoFiltro: false });
});

test('serviço fixo não entra como filtro novo', () => {
  for (const servico of SERVICOS_FIXOS) {
    const decisao = decidirGravacao('servico', servico.toLowerCase(), []);
    assert.deepEqual(decisao, { acao: 'aplicar', valor: servico, novoFiltro: false });
  }
});

test('outro serviço escrito pede confirmação', () => {
  const decisao = decidirGravacao('servico', 'Apoio local', []);
  assert.deepEqual(decisao, { acao: 'confirmar', nome: 'APOIO LOCAL' });
});

test('campo vazio limpa a OS e não vira filtro', () => {
  assert.deepEqual(decidirGravacao('solicitante', '   ', ['LARA']), { acao: 'limpar' });
});

test('TSP nova pede confirmação e só o administrador inclui', () => {
  assert.deepEqual(decidirGravacao('tsp', '  rota sul  ', []), { acao: 'confirmar', nome: 'ROTA SUL' });
  assert.equal(podeIncluirFiltroNovo('administrador', 'tsp'), true);
  assert.equal(podeIncluirFiltroNovo('administrador', 'operacao'), true);
  assert.equal(podeIncluirFiltroNovo('analista', 'tsp'), false);
  assert.equal(podeIncluirFiltroNovo('analista', 'operacao'), false);
  assert.equal(podeIncluirFiltroNovo('analista', 'solicitante'), true);
  assert.match(avisoInclusaoAdmin('tsp'), /administrador/);
  assert.match(avisoInclusaoAdmin('operacao'), /operação/);
});
