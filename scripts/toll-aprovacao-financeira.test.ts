import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveStoredClientToll,
  resolveStoredProviderToll,
} from '../lib/toll/clientTollBilling';
import {
  aplicarPatchPreservandoAusentes,
  classificarFornecedorGravado,
  deveReescreverSnapshotAprovado,
  montarAtualizacaoPedagio,
} from '../lib/toll/aprovacaoPedagio';

type OsFicticia = {
  client: string;
  is_same_os: boolean;
  revenue_value: number;
  cost_value: number;
  toll_value: number;
  toll_value_provider: number | null;
  displacement_value: number | null;
  displacement_value_provider: number | null;
};

/** Mesma regra do PATCH em server/routes.ts e api/vendor-verification.ts. */
function aplicarUpdateBackend(atual: OsFicticia, body: Record<string, unknown>): OsFicticia {
  const corePayload: Record<string, unknown> = {};
  if (body.revenue_value !== undefined) corePayload.revenue_value = body.revenue_value;
  if (body.cost_value !== undefined) corePayload.cost_value = body.cost_value;
  if (body.toll_value !== undefined) corePayload.toll_value = body.toll_value;
  if (body.toll_value_provider !== undefined) corePayload.toll_value_provider = body.toll_value_provider;
  if (body.displacement_value !== undefined) corePayload.displacement_value = body.displacement_value;
  if (body.displacement_value_provider !== undefined) corePayload.displacement_value_provider = body.displacement_value_provider;
  return aplicarPatchPreservandoAusentes(atual, corePayload);
}

function leituraOficial(os: OsFicticia) {
  const cliente = resolveStoredClientToll(os.toll_value, os.toll_value_provider, os.client);
  const fornecedor = resolveStoredProviderToll(os.toll_value, os.toll_value_provider, os.is_same_os);
  const deslocamento = Math.max(0, Number(os.displacement_value) || 0);
  const deslocamentoFornecedor = Math.max(0, Number(os.displacement_value_provider) || 0);
  const receita = Math.round((os.revenue_value + cliente + deslocamento) * 100) / 100;
  const custo = Math.round((os.cost_value + fornecedor + deslocamentoFornecedor) * 100) / 100;
  return {
    cliente,
    fornecedor,
    receita,
    custo,
    lucro: Math.round((receita - custo) * 100) / 100,
  };
}

function salvarOuAprovar(os: OsFicticia, edicao: {
  fornecedorEditado?: boolean;
  pedagioClienteEditado?: boolean;
  tollProviderInformado?: number;
  tollValueInformado?: number;
  revenueServiceOnly?: number;
  displacementInformado?: number;
}) {
  const atualizacao = montarAtualizacaoPedagio({
    tollValueInformado: edicao.tollValueInformado ?? os.toll_value,
    tollProviderOriginal: os.toll_value_provider,
    tollProviderInformado: edicao.tollProviderInformado ?? 0,
    fornecedorEditado: !!edicao.fornecedorEditado,
    pedagioClienteEditado: !!edicao.pedagioClienteEditado,
    isSameOs: os.is_same_os,
    clientName: os.client,
    revenueServiceOnly: edicao.revenueServiceOnly ?? os.revenue_value,
    displacementOriginal: os.displacement_value,
    displacementInformado: edicao.displacementInformado ?? (os.displacement_value ?? 0),
    displacementProviderOriginal: os.displacement_value_provider,
    displacementProviderInformado: os.displacement_value_provider ?? 0,
  });
  const body: Record<string, unknown> = {
    revenue_value: os.revenue_value,
    cost_value: os.cost_value,
    ...atualizacao.patch,
  };
  return { atualizacao, depois: aplicarUpdateBackend(os, body) };
}

const base: OsFicticia = {
  client: 'CLIENTE EXEMPLO',
  is_same_os: false,
  revenue_value: 500,
  cost_value: 400,
  toll_value: 100,
  toll_value_provider: null,
  displacement_value: null,
  displacement_value_provider: null,
};

describe('aprovação financeira preserva pedágio ausente', () => {
  it('classifica null, zero e positivo', () => {
    assert.equal(classificarFornecedorGravado(null), 'ausente');
    assert.equal(classificarFornecedorGravado(undefined), 'ausente');
    assert.equal(classificarFornecedorGravado(''), 'ausente');
    assert.equal(classificarFornecedorGravado(0), 'zero');
    assert.equal(classificarFornecedorGravado(100), 'positivo');
  });

  it('fornecedor null e campo intocado continua null', () => {
    const antes = leituraOficial(base);
    const { atualizacao, depois } = salvarOuAprovar(base, {});
    assert.equal('toll_value_provider' in atualizacao.patch, false);
    assert.equal(depois.toll_value_provider, null);
    assert.deepEqual(leituraOficial(depois), antes);
    assert.equal(leituraOficial(depois).cliente, 120);
  });

  it('fornecedor null e operador informa zero grava zero', () => {
    const { atualizacao, depois } = salvarOuAprovar(base, {
      fornecedorEditado: true,
      tollProviderInformado: 0,
    });
    assert.equal(atualizacao.patch.toll_value_provider, 0);
    assert.equal(depois.toll_value_provider, 0);
    assert.equal(leituraOficial(depois).cliente, 100);
    assert.equal(leituraOficial(depois).fornecedor, 0);
  });

  it('fornecedor zero original permanece zero', () => {
    const os = { ...base, toll_value_provider: 0 };
    const antes = leituraOficial(os);
    const { depois } = salvarOuAprovar(os, { tollProviderInformado: 0 });
    assert.equal(depois.toll_value_provider, 0);
    assert.deepEqual(leituraOficial(depois), antes);
  });

  it('legado 100/100 mantém cliente cobrável 120', () => {
    const os = { ...base, toll_value: 100, toll_value_provider: 100 };
    const { atualizacao, depois } = salvarOuAprovar(os, { tollProviderInformado: 100 });
    assert.equal(depois.toll_value, 100);
    assert.equal(depois.toll_value_provider, 100);
    assert.equal(leituraOficial(depois).cliente, 120);
    assert.equal(atualizacao.snapshotPedagio.tollVal, 120);
    assert.equal(atualizacao.snapshotPedagio.tollProvider, 100);
    assert.equal(atualizacao.snapshotPedagio.totalGeral, 620);
  });

  it('fornecedor ausente com cliente bruto 100 continua cobrando 120 sem edição', () => {
    const { depois, atualizacao } = salvarOuAprovar(base, {});
    assert.equal(leituraOficial(depois).cliente, 120);
    assert.equal(atualizacao.snapshotPedagio.tollVal, 120);
    assert.equal(atualizacao.snapshotPedagio.tollProvider, null);
    assert.equal(atualizacao.snapshotPedagio.totalGeral, 500 + 120);
  });

  it('OS mesma com fornecedor ausente preserva a leitura anterior', () => {
    const os = { ...base, is_same_os: true, toll_value: 60, toll_value_provider: null };
    const antes = leituraOficial(os);
    assert.equal(antes.cliente, 72);
    assert.equal(antes.fornecedor, 0);
    const { atualizacao, depois } = salvarOuAprovar(os, { tollProviderInformado: 0 });
    assert.equal('toll_value_provider' in atualizacao.patch, false);
    assert.equal(depois.toll_value_provider, null);
    assert.equal(leituraOficial(depois).cliente, 72);
    assert.deepEqual(leituraOficial(depois), antes);
  });

  it('par correto 120/100 e manual 115/100 permanecem', () => {
    const correto = { ...base, toll_value: 120, toll_value_provider: 100 };
    const salvoCorreto = salvarOuAprovar(correto, { tollProviderInformado: 100 });
    assert.equal(salvoCorreto.depois.toll_value, 120);
    assert.equal(salvoCorreto.depois.toll_value_provider, 100);
    assert.equal(leituraOficial(salvoCorreto.depois).cliente, 120);
    assert.equal(salvoCorreto.atualizacao.snapshotPedagio.tollVal, 120);
    assert.equal(salvoCorreto.atualizacao.snapshotPedagio.tollProvider, 100);

    const manual = { ...base, toll_value: 115, toll_value_provider: 100 };
    const salvoManual = salvarOuAprovar(manual, { tollProviderInformado: 100 });
    assert.equal(salvoManual.depois.toll_value, 115);
    assert.equal(salvoManual.depois.toll_value_provider, 100);
    assert.equal(leituraOficial(salvoManual.depois).cliente, 115);
    assert.equal(salvoManual.atualizacao.snapshotPedagio.tollVal, 115);
    assert.equal(salvoManual.atualizacao.snapshotPedagio.tollProvider, 100);
  });

  it('primeiro snapshot usa o cliente cobrável do boletim e da fatura', () => {
    const { atualizacao, depois } = salvarOuAprovar(base, {});
    const oficial = leituraOficial(depois);
    assert.equal(atualizacao.snapshotPedagio.tollVal, oficial.cliente);
    assert.equal(
      atualizacao.snapshotPedagio.totalGeral,
      Math.round((base.revenue_value + oficial.cliente) * 100) / 100,
    );
  });

  it('snapshot aprovado não é regravado por null contra zero nem por franquia zerada', () => {
    const artificial = deveReescreverSnapshotAprovado({
      revenueChanged: false,
      costChanged: false,
      tollChanged: true,
      tollProvChanged: true,
      dispChanged: false,
      dispProvChanged: false,
      tableChanged: false,
      providerTableChanged: false,
      breakdownChanged: true,
      fornecedorEditado: false,
      fornecedorOriginalAusente: true,
      pedagioClienteEditado: false,
      franquiaSnapshotZerada: true,
    });
    assert.equal(artificial, false);
  });

  it('alteração manual legítima continua gravando e autoriza ressincronizar', () => {
    const { atualizacao, depois } = salvarOuAprovar(base, {
      fornecedorEditado: true,
      tollProviderInformado: 80,
      pedagioClienteEditado: true,
      tollValueInformado: 115,
    });
    assert.equal(depois.toll_value, 115);
    assert.equal(depois.toll_value_provider, 80);
    assert.equal(leituraOficial(depois).cliente, 115);
    assert.equal(leituraOficial(depois).fornecedor, 80);
    assert.equal(deveReescreverSnapshotAprovado({
      revenueChanged: false,
      costChanged: false,
      tollChanged: true,
      tollProvChanged: true,
      dispChanged: false,
      dispProvChanged: false,
      tableChanged: false,
      providerTableChanged: false,
      breakdownChanged: false,
      fornecedorEditado: true,
      fornecedorOriginalAusente: true,
      pedagioClienteEditado: true,
      franquiaSnapshotZerada: true,
    }), true);
    assert.equal(atualizacao.snapshotPedagio.tollProvider, 80);
  });

  it('salvar e aprovar sem edição não mudam receita, custo, lucro nem snapshot artificial', () => {
    const antes = leituraOficial(base);
    for (const _acao of ['salvar', 'aprovar'] as const) {
      const { depois } = salvarOuAprovar(base, {});
      const agora = leituraOficial(depois);
      assert.equal(depois.revenue_value, base.revenue_value);
      assert.equal(depois.cost_value, base.cost_value);
      assert.equal(depois.toll_value_provider, null);
      assert.equal(agora.receita, antes.receita);
      assert.equal(agora.custo, antes.custo);
      assert.equal(agora.lucro, antes.lucro);
    }
  });

  it('deslocamento nulo exibido como zero não entra no patch', () => {
    const { atualizacao, depois } = salvarOuAprovar(base, { displacementInformado: 0 });
    assert.equal('displacement_value' in atualizacao.patch, false);
    assert.equal(depois.displacement_value, null);
  });

  it('backend e modal preservam a chave omitida', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const vendor = fs.readFileSync('api/vendor-verification.ts', 'utf8');
    assert.match(routes, /if \(toll_value_provider !== undefined\) corePayload\.toll_value_provider = toll_value_provider/);
    assert.match(vendor, /if \(toll_value_provider !== undefined\) corePayload\.toll_value_provider = toll_value_provider/);

    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(modal, /montarAtualizacaoPedagio\(/);
    assert.match(modal, /handleUpdate\(false\)/);
    assert.match(modal, /handleUpdate\(true\)/);
    assert.match(modal, /if \(!\('toll_value_provider' in pedagioAprovacao\.patch\)\) delete/);
    assert.match(modal, /tollVal: pedagioAprovacao\.snapshotPedagio\.tollVal/);
    assert.match(modal, /tollProvider: pedagioAprovacao\.snapshotPedagio\.tollProvider/);
    assert.match(modal, /deveReescreverSnapshotAprovado\(/);
    assert.match(modal, /tollProvider: tollProviderPreservado/);
    assert.match(modal, /fornecedorPedagioEditadoRef\.current = true/);
  });
});
