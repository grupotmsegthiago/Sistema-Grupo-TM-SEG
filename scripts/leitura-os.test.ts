/**
 * A lista de OS sai sem coluna financeira, para qualquer perfil.
 * Não grava OS e não usa banco.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { podeLerValoresOs } from '../lib/financeiro/acessoCampos';
import { COLUNAS_PROTEGIDAS_OS } from '../lib/financeiro/colunasProtegidas';
import {
  decisaoLeituraOs,
  executarLeituraOs,
  filtroUsaColunaProtegida,
  selectOperacional,
} from '../lib/operacional/leituraOs';

const lista = [
  { m: 'select', args: ['*', { count: 'exact' }] },
  { m: 'eq', args: ['status', 'Em Viagem'] },
  { m: 'range', args: [0, 999] },
];

function banco(linhas: Record<string, unknown>[]) {
  const chamadas: Array<{ m: string; args: unknown[] }> = [];
  const cadeia: any = new Proxy({}, {
    get(_alvo, prop) {
      if (prop === 'then') {
        return (ok?: any) => Promise.resolve({ data: linhas, error: null, count: linhas.length }).then(ok);
      }
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) => {
        chamadas.push({ m: prop, args });
        return cadeia;
      };
    },
  });
  return {
    chamadas,
    sb: { from(tabela: string) { chamadas.push({ m: 'from', args: [tabela] }); return cadeia; } },
  };
}

describe('leitura operacional de OS', () => {
  it('não coloca coluna protegida no select da lista', () => {
    const sql = selectOperacional();
    for (const coluna of COLUNAS_PROTEGIDAS_OS) {
      assert.equal(sql.split(',').includes(coluna), false, coluna);
    }
    assert.equal(sql.split(',').includes('status'), true);
  });

  it('aceita filtro de status e recusa filtro de valor para quem não lê valor', () => {
    assert.equal(decisaoLeituraOs(lista, false), 'ok');
    assert.equal(decisaoLeituraOs([{ m: 'update', args: [{}] }], true), 'invalida');
    const pedagio = [
      { m: 'select', args: ['id, toll_value'] },
      { m: 'is', args: ['toll_value', null] },
    ];
    assert.equal(filtroUsaColunaProtegida(pedagio), true);
    assert.equal(decisaoLeituraOs(pedagio, false), 'protegida');
    assert.equal(decisaoLeituraOs(pedagio, true), 'ok');
  });

  it('tira o valor da resposta mesmo quando o banco devolve a coluna', async () => {
    const fake = banco([{
      id: 'os-1',
      status: 'Em Viagem',
      revenue_value: 1500,
      cost_value: 800,
      toll_value: 40,
      snapshot_data: { segredo: true },
    }]);
    const saida = await executarLeituraOs(fake.sb, lista);
    const linha = (saida.data as Record<string, unknown>[])[0];
    assert.equal(linha.status, 'Em Viagem');
    assert.equal('revenue_value' in linha, false);
    assert.equal('cost_value' in linha, false);
    assert.equal('toll_value' in linha, false);
    assert.equal('snapshot_data' in linha, false);
    const select = fake.chamadas.find((c) => c.m === 'select');
    assert.equal(String(select?.args[0]).includes('revenue_value'), false);
    assert.equal(String(select?.args[0]).includes('status'), true);
  });

  it('diretoria, financeiro, controller e operador leem a lista; valor não vai na lista', () => {
    const perfis = ['Diretoria', 'Financeiro', 'Controller', 'Operador'];
    for (const role of perfis) {
      const pode = podeLerValoresOs({ role, name: 'Teste' });
      assert.equal(pode, true, role);
      assert.equal(decisaoLeituraOs(lista, pode), 'ok');
    }
    assert.equal(podeLerValoresOs({ role: 'Cliente', name: 'Portal' }), false);
    assert.equal(decisaoLeituraOs(lista, false), 'ok');
  });
});
