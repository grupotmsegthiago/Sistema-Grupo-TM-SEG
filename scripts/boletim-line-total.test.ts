import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fecharSubitensNoValorGravado, resolveBoletimClientLineTotal } from '../lib/billing/boletimLineTotal';

describe('resolveBoletimClientLineTotal', () => {
  it('GTM-8231: snapshot atrasado cede ao total vivo do rodapé', () => {
    // Franquia 699,84 no snapshot; receita 769,82 + pedágio 13,68 = 783,50.
    const total = resolveBoletimClientLineTotal({
      dbTotal: 783.5,
      snapTotalWithDisp: 699.84,
      componentTotal: 783.5,
      wasManuallyEdited: false,
    });
    assert.equal(total, 783.5);
    assert.equal(Math.round((783.5 - 699.84) * 100) / 100, 83.66);
  });

  it('snapshot que ainda coincide com a base permanece', () => {
    assert.equal(resolveBoletimClientLineTotal({
      dbTotal: 1537.01,
      snapTotalWithDisp: 1537.01,
      componentTotal: 1500,
      wasManuallyEdited: false,
    }), 1537.01);
  });

  it('edição manual usa a base atual mesmo zerada', () => {
    assert.equal(resolveBoletimClientLineTotal({
      dbTotal: 0,
      snapTotalWithDisp: 699.84,
      componentTotal: 699.84,
      wasManuallyEdited: true,
    }), 0);
  });

  it('base atual zerada sem edição manual mantém o snapshot', () => {
    assert.equal(resolveBoletimClientLineTotal({
      dbTotal: 0,
      snapTotalWithDisp: 699.84,
      componentTotal: 400,
      wasManuallyEdited: false,
    }), 699.84);
  });

  it('subitens divergentes fecham no valor gravado, inclusive zero', () => {
    const fechado = fecharSubitensNoValorGravado({
      valorGravado: 800,
      ativacao: 650,
      kmExtra: 40,
      horaExtra: 90,
    });
    assert.equal(fechado.ativacao, 800);
    assert.equal(fechado.kmExtra, 0);
    assert.equal(fechado.horaExtra, 0);
    assert.equal(fechado.colapsou, true);
    assert.equal(fechado.ativacao + fechado.kmExtra + fechado.horaExtra, 800);

    const zero = fecharSubitensNoValorGravado({
      valorGravado: 0,
      ativacao: 650,
      kmExtra: 10,
      horaExtra: 20,
    });
    assert.equal(zero.ativacao + zero.kmExtra + zero.horaExtra, 0);

    const nulo = fecharSubitensNoValorGravado({
      valorGravado: null,
      ativacao: 650,
      kmExtra: 10,
      horaExtra: 20,
    });
    assert.equal(nulo.ativacao, 650);
    assert.equal(nulo.kmExtra, 10);
    assert.equal(nulo.colapsou, false);
  });

  it('sem snapshot usa a soma dos componentes', () => {
    assert.equal(resolveBoletimClientLineTotal({
      dbTotal: 0,
      snapTotalWithDisp: 0,
      componentTotal: 420.5,
      wasManuallyEdited: false,
    }), 420.5);
  });
});
