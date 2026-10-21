import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  avisoContinuaPendente,
  avisoDoHistoricoPosAprovacao,
  detalhesMarcadosComoLidos,
  historicoJaInformado,
  lerAvisoEdicao,
  marcadorDeHistoricoLido,
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

  it('o botão de reaprovar libera com a senha de quem está logado', () => {
    const tela = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const trecho = tela.slice(tela.indexOf('modal-reaprovacao-financeira'), tela.indexOf('modal-senha-pedagio'));
    assert.match(trecho, /Senha de \$\{nomeDeQuemConfirma\}/);
    assert.match(trecho, /disabled=\{reaprovacaoChecando \|\| !reaprovacaoSenha\.trim\(\)\}/);
    assert.doesNotMatch(trecho, /senha do sistema/);
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

  it('a alteração da Giovanna em OS já aprovada vira aviso, e a de um operador não', () => {
    const daGiovanna = avisoDoHistoricoPosAprovacao({
      id: 'hist-1',
      action_type: 'POST_APPROVAL_EDIT',
      user_name: 'Giovanna Marsili',
      entity_id: 'GTM-8800',
      created_at: '2026-10-21T21:10:00.000Z',
      details: JSON.stringify({
        user: 'Giovanna Marsili',
        role: 'Financeiro',
        date: '2026-10-21T21:10:00.000Z',
        changes: ['Pedágio cliente: de 35,00 para 40,00'],
        note: '',
      }),
    });
    assert.equal(daGiovanna?.os, 'GTM-8800');
    assert.equal(daGiovanna?.quem, 'Giovanna Marsili');
    assert.equal(daGiovanna?.texto, 'Pedágio cliente: de 35,00 para 40,00');
    assert.equal(daGiovanna?.historicoId, 'hist-1');
    assert.equal(avisoDoHistoricoPosAprovacao({
      id: 'hist-2',
      action_type: 'POST_APPROVAL_EDIT',
      user_name: 'Operador',
      entity_id: 'GTM-1',
      details: JSON.stringify({ role: 'Operador', changes: ['Origem'] }),
    }), null);
    assert.equal(avisoDoHistoricoPosAprovacao({
      id: 'hist-3',
      action_type: 'BILLING_EDIT',
      user_name: 'Giovanna Marsili',
      entity_id: 'GTM-1',
      details: JSON.stringify({ role: 'Financeiro', changes: ['Receita'] }),
    }), null);
    const marcador = marcadorDeHistoricoLido(daGiovanna!, 'Thiago Moreira', '2026-10-21T21:20:00.000Z');
    assert.equal(historicoJaInformado(marcador), 'hist-1');
    assert.equal(avisoContinuaPendente(lerAvisoEdicao('marca', marcador)), false);
  });
});
