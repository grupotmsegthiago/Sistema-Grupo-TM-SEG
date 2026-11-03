import assert from 'node:assert/strict';
import test from 'node:test';
import { corpoErroSolicitacao, payloadSanitizado } from '../lib/portalCliente/erroRegistro.ts';
import { extrairNumeroGtm, formatarIdGtm, maiorNumeroGtm, proximoNumeroGtm } from '../lib/portalCliente/numeroOs.ts';

test('o número GTM lê só o inteiro depois do prefixo', () => {
  assert.equal(extrairNumeroGtm('GTM-7714'), 7714);
  assert.equal(extrairNumeroGtm('GTM-0007'), 7);
  assert.equal(extrairNumeroGtm('GTM-2026-0001'), 0);
  assert.equal(maiorNumeroGtm(['GTM-9', 'GTM-10000', 'outra']), 10000);
  assert.equal(formatarIdGtm(10000), 'GTM-10000');
});

test('a sequência do banco vence a leitura da tabela', async () => {
  let leuTabela = false;
  const sb = {
    rpc: async () => ({ data: 7715, error: null }),
    from: () => {
      leuTabela = true;
      throw new Error('não deveria ler a tabela');
    },
  };
  assert.equal(await proximoNumeroGtm(sb), 7715);
  assert.equal(leuTabela, false);
});

test('sem a função, o próximo número é o maior da base inteira', async () => {
  const sb = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function proximo_numero_gtm' } }),
    from: () => {
      const cadeia: any = {
        select: () => cadeia,
        like: () => cadeia,
        order: () => cadeia,
        range: () => cadeia,
        then: (resolve: (valor: unknown) => unknown) => resolve({
          data: [{ id: 'GTM-40' }, { id: 'GTM-7714' }, { id: 'GTM-100' }],
          error: null,
          count: 3,
        }),
      };
      return cadeia;
    },
  };
  assert.equal(await proximoNumeroGtm(sb), 7715);
});

test('constraint volta o campo mesmo em produção', () => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const corpo = corpoErroSolicitacao({
      message: 'duplicate key value violates unique constraint "missions_pkey"',
      code: '23505',
      details: 'Key (id)=(GTM-7714) already exists.',
    });
    assert.equal(corpo.codigo, '23505');
    assert.match(String(corpo.campo), /GTM-7714/);
    const generico = corpoErroSolicitacao(new Error('smtp timeout'));
    assert.equal(generico.detalhe, undefined);
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test('o log da solicitação não leva telefone', () => {
  const copia = payloadSanitizado({ telefone: '11999999999', placa: 'ABC1D23', origem: 'GUARULHOS - SP' });
  assert.equal('telefone' in copia, false);
  assert.equal(copia.placa, 'ABC1D23');
});
