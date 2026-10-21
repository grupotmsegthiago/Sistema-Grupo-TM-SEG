import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoContinuaPendente,
  detalhesMarcadosComoLidos,
  lerAvisoEdicao,
  montarDetalhesAviso,
  reaprovacaoExigeConfirmacao,
  textoReaprovacaoValido,
} from '../lib/edicaoFinanceiraDiretoria';

describe('reaprovação do perfil Financeiro', () => {
  it('pede senha e texto só quando o Financeiro reaprova uma OS já aprovada', () => {
    assert.equal(reaprovacaoExigeConfirmacao({
      aprovar: true,
      jaAprovada: true,
      perfil: 'Financeiro',
    }), true);
    assert.equal(reaprovacaoExigeConfirmacao({
      aprovar: true,
      jaAprovada: false,
      perfil: 'Financeiro',
    }), false);
    assert.equal(reaprovacaoExigeConfirmacao({
      aprovar: false,
      jaAprovada: true,
      perfil: 'Financeiro',
    }), false);
    assert.equal(reaprovacaoExigeConfirmacao({
      aprovar: true,
      jaAprovada: true,
      perfil: 'Operador',
    }), false);
  });

  it('recusa texto vazio ou curto', () => {
    assert.equal(textoReaprovacaoValido(''), false);
    assert.equal(textoReaprovacaoValido('alterei'), false);
    assert.equal(textoReaprovacaoValido('Alterei o KM final da OS.'), true);
  });
});

describe('aviso para a Diretoria', () => {
  it('guarda quem editou, a hora, o texto e as alterações', () => {
    const cru = montarDetalhesAviso({
      os: 'GTM-8763',
      cliente: 'CEVA LOGISTICS LTDA',
      quem: 'ANA.FERNANDES',
      perfil: 'Financeiro',
      quando: '2026-10-21T20:40:00.000Z',
      texto: 'Alterei o KM final da OS.',
      alteracoes: ['KM final: de 10 para 12'],
    });
    const aviso = lerAvisoEdicao('abc', cru);
    assert.equal(aviso?.os, 'GTM-8763');
    assert.equal(aviso?.quem, 'ANA.FERNANDES');
    assert.equal(aviso?.quando, '2026-10-21T20:40:00.000Z');
    assert.equal(aviso?.texto, 'Alterei o KM final da OS.');
    assert.deepEqual(aviso?.alteracoes, ['KM final: de 10 para 12']);
    assert.equal(avisoContinuaPendente(aviso), true);
  });

  it('lida some da pendência e o texto da edição permanece no registro', () => {
    const aviso = lerAvisoEdicao('abc', montarDetalhesAviso({
      os: 'GTM-8763',
      quem: 'Giovanna Marsili',
      perfil: 'Financeiro',
      quando: '2026-10-21T20:40:00.000Z',
      texto: 'Corrigi o pedágio do cliente.',
      alteracoes: ['Pedágio cliente: de 10 para 20'],
    }));
    assert.ok(aviso);
    const lido = lerAvisoEdicao('abc', detalhesMarcadosComoLidos(aviso, 'Thiago Moreira', '2026-10-21T21:00:00.000Z'));
    assert.equal(avisoContinuaPendente(lido), false);
    assert.equal(lido?.texto, 'Corrigi o pedágio do cliente.');
    assert.equal(lido?.lidaPor, 'Thiago Moreira');
  });
});
