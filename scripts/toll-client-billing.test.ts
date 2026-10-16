import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  billableClientToll,
  billableProviderToll,
  clientTollMarkupFactor,
  isDhlClientTollExempt,
  normalizeTollAmount,
  resolveStoredClientToll,
  resolveStoredProviderToll,
  tollPersistencePair,
  preservarParPedagioNoRecalculo,
  classificarParPedagio,
  camposPedagioSnapshotAceite,
} from '../lib/toll/clientTollBilling';
import { buildRotasBrasilUrl, ROTAS_BRASIL_STEPS_PT } from '../lib/toll/rotasBrasil';
import { hasUsableBillingSnapshot } from '../lib/missionSnapshot';
import { osMudouDepoisDoSnapshot } from '../lib/cevaPortal/report';

describe('clientTollBilling', () => {
  it('isDhlClientTollExempt só casa cliente DHL', () => {
    assert.equal(isDhlClientTollExempt('DHL SUPPLY CHAIN (BRAZIL) LTDA'), true);
    assert.equal(isDhlClientTollExempt('dhl express brazil ltda'), true);
    assert.equal(isDhlClientTollExempt('CEVA LOGISTICS'), false);
    assert.equal(isDhlClientTollExempt(''), false);
    assert.equal(isDhlClientTollExempt(null), false);
  });

  it('normalizeTollAmount arredonda e rejeita inválido', () => {
    assert.equal(normalizeTollAmount('12,345'), 12.35);
    assert.equal(normalizeTollAmount(-1), 0);
    assert.equal(normalizeTollAmount('abc'), 0);
  });

  it('billableClientToll: até R$ 10 sem acréscimo', () => {
    assert.equal(billableClientToll(0), 0);
    assert.equal(billableClientToll(10), 10);
    assert.equal(clientTollMarkupFactor(10), 1);
  });

  it('billableClientToll: até R$ 100 aplica 20%', () => {
    assert.equal(billableClientToll(10.01), 12.01);
    assert.equal(billableClientToll(50), 60);
    assert.equal(billableClientToll(100), 120);
    assert.equal(clientTollMarkupFactor(100), 1.2);
  });

  it('billableClientToll: de R$ 100,01 a R$ 150 aplica 10%', () => {
    assert.equal(billableClientToll(100.01), 110.01);
    assert.equal(billableClientToll(120), 132);
    assert.equal(billableClientToll(150), 165);
    assert.equal(clientTollMarkupFactor(150), 1.1);
  });

  it('billableClientToll: acima de R$ 150 aplica 5%', () => {
    assert.equal(billableClientToll(150.01), 157.51);
    assert.equal(billableClientToll(200), 210);
    assert.equal(clientTollMarkupFactor(200), 1.05);
  });

  it('provider usa valor real; persistência grava cliente com regra', () => {
    assert.equal(billableProviderToll(50), 50);
    assert.equal(billableProviderToll(50, true), 0);
    assert.deepEqual(tollPersistencePair(50, false), { toll_value: 60, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(120, false), { toll_value: 132, toll_value_provider: 120 });
    assert.deepEqual(tollPersistencePair(200, false), { toll_value: 210, toll_value_provider: 200 });
    assert.deepEqual(tollPersistencePair(8, false), { toll_value: 8, toll_value_provider: 8 });
    assert.deepEqual(tollPersistencePair(50, true), { toll_value: 60, toll_value_provider: 0 });
  });

  it('resolveStoredClientToll: legado (iguais) aplica regra; novo não dobra', () => {
    assert.equal(resolveStoredClientToll(50, 50), 60);
    assert.equal(resolveStoredClientToll(200, 200), 210);
    assert.equal(resolveStoredClientToll(132, 120), 132);
    assert.equal(resolveStoredClientToll(8, 8), 8);
    assert.equal(resolveStoredClientToll(50, null), 60);
    assert.equal(resolveStoredClientToll(50), 60);
  });

  it('resolveStoredProviderToll devolve o valor real', () => {
    assert.equal(resolveStoredProviderToll(120, 100), 100);
    assert.equal(resolveStoredProviderToll(50, 50), 50);
    assert.equal(resolveStoredProviderToll(50, null), 50);
    assert.equal(resolveStoredProviderToll(60, 0, true), 0);
  });

  it('DHL: operação informa o valor — sem acréscimo', () => {
    const dhl = 'DHL SUPPLY CHAIN (BRAZIL) LTDA';
    assert.equal(billableClientToll(50, dhl), 50);
    assert.equal(billableClientToll(100, dhl), 100);
    assert.equal(billableClientToll(10.01, dhl), 10.01);
    assert.equal(billableClientToll(200, dhl), 200);
    assert.deepEqual(tollPersistencePair(50, false, dhl), { toll_value: 50, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(200, false, dhl), { toll_value: 200, toll_value_provider: 200 });
    assert.deepEqual(tollPersistencePair(50, true, dhl), { toll_value: 50, toll_value_provider: 0 });
    assert.equal(resolveStoredClientToll(60, 50, dhl), 50);
    assert.equal(resolveStoredClientToll(50, 50, dhl), 50);
    assert.equal(resolveStoredClientToll(50, null, dhl), 50);
    assert.equal(resolveStoredClientToll(50, 0, dhl), 50);
  });

  it('demais clientes seguem as faixas 20/10/5', () => {
    assert.equal(billableClientToll(50, 'CEVA LOGISTICS'), 60);
    assert.equal(billableClientToll(120, 'CEVA LOGISTICS'), 132);
    assert.equal(billableClientToll(200, 'INTERMODAL BRASIL LOGISTICA S.A.'), 210);
    assert.equal(resolveStoredClientToll(50, 50, 'CEVA LOGISTICS'), 60);
    assert.deepEqual(tollPersistencePair(50, false, 'CEVA LOGISTICS'), { toll_value: 60, toll_value_provider: 50 });
    assert.deepEqual(tollPersistencePair(200, false, 'CESLOG - CESARI LOGISTICA LTDA'), { toll_value: 210, toll_value_provider: 200 });
  });

  it('recálculo preserva o par e não aplica a faixa de novo', () => {
    for (const real of [50, 100, 120, 200]) {
      const criado = tollPersistencePair(real, false, 'CEVA LOGISTICS');
      const deNovo = preservarParPedagioNoRecalculo({
        tollValue: criado.toll_value,
        tollValueProvider: criado.toll_value_provider,
      });
      assert.equal(deNovo.toll_value, criado.toll_value);
      assert.equal(deNovo.toll_value_provider, criado.toll_value_provider);
      const repetido = preservarParPedagioNoRecalculo({
        tollValue: deNovo.toll_value,
        tollValueProvider: deNovo.toll_value_provider,
      });
      assert.deepEqual(
        { toll_value: repetido.toll_value, toll_value_provider: repetido.toll_value_provider },
        { toll_value: deNovo.toll_value, toll_value_provider: deNovo.toll_value_provider },
      );
    }
    assert.deepEqual(
      preservarParPedagioNoRecalculo({ tollValue: 120, tollValueProvider: 100 }),
      { toll_value: 120, toll_value_provider: 100, escreverFornecedor: true, origem: 'par_gravado' },
    );
  });

  it('DHL, até R$ 10 e legado igual não são reescritos', () => {
    const dhl = preservarParPedagioNoRecalculo({ tollValue: 100, tollValueProvider: 100 });
    assert.equal(dhl.toll_value, 100);
    assert.equal(dhl.toll_value_provider, 100);
    assert.equal(dhl.origem, 'igual_preservado');
    const baixo = preservarParPedagioNoRecalculo({ tollValue: 8, tollValueProvider: 8 });
    assert.equal(baixo.toll_value, 8);
    assert.equal(baixo.toll_value_provider, 8);
    const legado = preservarParPedagioNoRecalculo({ tollValue: 100, tollValueProvider: 100 });
    assert.equal(legado.toll_value, 100);
    assert.notEqual(legado.toll_value, billableClientToll(100));
  });

  it('fornecedor ausente ou zero não vira o valor do cliente', () => {
    const ausente = preservarParPedagioNoRecalculo({ tollValue: 100, tollValueProvider: null });
    assert.equal(ausente.toll_value, 100);
    assert.equal(ausente.escreverFornecedor, false);
    assert.equal(ausente.origem, 'fornecedor_ausente');
    const zero = preservarParPedagioNoRecalculo({ tollValue: 120, tollValueProvider: 0 });
    assert.equal(zero.toll_value, 120);
    assert.equal(zero.toll_value_provider, 0);
    assert.notEqual(zero.toll_value_provider, zero.toll_value);
  });

  it('OS mesma preserva o cliente e não inventa fornecedor ausente', () => {
    const gravada = preservarParPedagioNoRecalculo({ tollValue: 60, tollValueProvider: 0, isSameOs: true });
    assert.equal(gravada.toll_value, 60);
    assert.equal(gravada.toll_value_provider, 0);
    const semFornecedor = preservarParPedagioNoRecalculo({ tollValue: 60, tollValueProvider: null, isSameOs: true });
    assert.equal(semFornecedor.toll_value, 60);
    assert.equal(semFornecedor.escreverFornecedor, false);
  });

  it('leitura legada de valores iguais continua com o acréscimo', () => {
    assert.equal(resolveStoredClientToll(100, 100, 'CEVA LOGISTICS'), 120);
    assert.equal(resolveStoredClientToll(50, null, 'CEVA LOGISTICS'), 60);
    assert.equal(resolveStoredClientToll(120, 100, 'CEVA LOGISTICS'), 120);
  });
});

describe('rotasBrasil', () => {
  it('buildRotasBrasilUrl é sempre a home (sem origem/destino na query)', () => {
    const url = buildRotasBrasilUrl('Campinas, SP', 'Barueri, SP');
    assert.equal(url, 'https://rotasbrasil.com.br/');
    assert.doesNotMatch(url, /pontos=/);
    assert.doesNotMatch(url, /www\./);
  });

  it('buildRotasBrasilUrl sem destino também é a home', () => {
    assert.equal(buildRotasBrasilUrl('Campinas', 'RAIO 200 KM — DESTINO A DEFINIR'), 'https://rotasbrasil.com.br/');
  });

  it('há 5 passos obrigatórios', () => {
    assert.equal(ROTAS_BRASIL_STEPS_PT.length, 5);
  });
});

describe('recálculo não grava o valor real no campo do cliente', () => {
  it('os caminhos protegidos chamam a preservação do par', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    const aberto = fs.readFileSync('api/recalculate-open.ts', 'utf8');
    for (const src of [routes, aberto]) {
      assert.match(src, /preservarParPedagioNoRecalculo/);
      assert.doesNotMatch(src, /toll_value:\s*calcToll/);
      assert.doesNotMatch(src, /toll_value_provider:\s*r2\(tollProv\)/);
    }
    assert.doesNotMatch(routes, /toll_value:\s*result\.tollValue/);
    assert.doesNotMatch(routes, /toll_value:\s*calc\.tollValue/);
    assert.match(routes, /billing_approved/);
    assert.match(routes, /revenue_edit_reason/);
    assert.match(routes, /tollOrigem: parPedagio\.origem/);
  });
});

describe('classificação da leitura do pedágio', () => {
  const casos = [
    { tollValue: 120, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 100, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 115, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 50, tollValueProvider: 50, clientName: 'DHL SUPPLY CHAIN', isSameOs: false },
    { tollValue: 8, tollValueProvider: 8, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 100, tollValueProvider: null, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 120, tollValueProvider: 0, clientName: 'CEVA LOGISTICS', isSameOs: false },
    { tollValue: 60, tollValueProvider: 0, clientName: 'CEVA LOGISTICS', isSameOs: true },
    { tollValue: 60, tollValueProvider: null, clientName: 'CEVA LOGISTICS', isSameOs: true },
  ];

  it('o número exibido é o mesmo de boletim, DRE e fatura aberta', () => {
    for (const caso of casos) {
      const leitura = classificarParPedagio(caso);
      assert.equal(
        leitura.clienteExibido,
        resolveStoredClientToll(caso.tollValue, caso.tollValueProvider, caso.clientName),
      );
      assert.equal(
        leitura.fornecedorExibido,
        resolveStoredProviderToll(caso.tollValue, caso.tollValueProvider, caso.isSameOs),
      );
    }
  });

  it('120/100 permanece 120/100 e não recebe a faixa de novo', () => {
    const leitura = classificarParPedagio({ tollValue: 120, tollValueProvider: 100, clientName: 'CEVA LOGISTICS' });
    assert.equal(leitura.estado, 'par_novo');
    assert.equal(leitura.clienteExibido, 120);
    assert.equal(leitura.fornecedorExibido, 100);
    assert.equal(leitura.faixaAplicadaNaLeitura, false);
    assert.notEqual(leitura.clienteExibido, billableClientToll(120));
  });

  it('legado 100/100 exibe 120/100 sem gravar o acréscimo', () => {
    const entrada = { tollValue: 100, tollValueProvider: 100, clientName: 'CEVA LOGISTICS' };
    const leitura = classificarParPedagio(entrada);
    assert.equal(leitura.estado, 'legado_ambiguo');
    assert.equal(leitura.clienteExibido, 120);
    assert.equal(leitura.fornecedorExibido, 100);
    assert.equal(leitura.faixaAplicadaNaLeitura, true);
    assert.equal(entrada.tollValue, 100);
    assert.match(leitura.aviso || '', /não mudou/);
  });

  it('par manual 115/100 não recebe outro percentual', () => {
    const leitura = classificarParPedagio({ tollValue: 115, tollValueProvider: 100, clientName: 'CEVA LOGISTICS' });
    assert.equal(leitura.estado, 'manual');
    assert.equal(leitura.clienteExibido, 115);
    assert.equal(leitura.fornecedorExibido, 100);
    assert.notEqual(leitura.clienteExibido, 120);
  });

  it('DHL e valor até R$ 10 permanecem iguais', () => {
    const dhl = classificarParPedagio({ tollValue: 50, tollValueProvider: 50, clientName: 'DHL EXPRESS' });
    assert.equal(dhl.estado, 'igual_esperado');
    assert.equal(dhl.clienteExibido, 50);
    assert.equal(dhl.fornecedorExibido, 50);
    const baixo = classificarParPedagio({ tollValue: 8, tollValueProvider: 8, clientName: 'CEVA LOGISTICS' });
    assert.equal(baixo.estado, 'igual_esperado');
    assert.equal(baixo.clienteExibido, 8);
    assert.equal(baixo.fornecedorExibido, 8);
  });

  it('fornecedor ausente não confirma custo e fornecedor zero permanece zero', () => {
    const ausente = classificarParPedagio({ tollValue: 100, tollValueProvider: null, clientName: 'CEVA LOGISTICS' });
    assert.equal(ausente.estado, 'fornecedor_ausente');
    assert.equal(ausente.fornecedorConfirmado, false);
    assert.equal(ausente.clienteExibido, 120);
    assert.equal(ausente.fornecedorExibido, 100);
    assert.equal(ausente.fornecedorGravado, null);
    assert.match(ausente.aviso || '', /não está confirmado/);
    const zero = classificarParPedagio({ tollValue: 120, tollValueProvider: 0, clientName: 'CEVA LOGISTICS' });
    assert.equal(zero.estado, 'fornecedor_zero');
    assert.equal(zero.fornecedorExibido, 0);
    assert.equal(zero.clienteExibido, 120);
    assert.notEqual(zero.fornecedorExibido, zero.clienteExibido);
    assert.match(zero.aviso || '', /zero foi mantido/i);
  });

  it('OS mesma segue a regra existente e não copia o cliente para o custo', () => {
    const gravada = classificarParPedagio({
      tollValue: 60,
      tollValueProvider: 0,
      clientName: 'CEVA LOGISTICS',
      isSameOs: true,
    });
    assert.equal(gravada.estado, 'mesma_os');
    assert.equal(gravada.clienteExibido, 60);
    assert.equal(gravada.fornecedorExibido, 0);
    const semCampo = classificarParPedagio({
      tollValue: 60,
      tollValueProvider: null,
      clientName: 'CEVA LOGISTICS',
      isSameOs: true,
    });
    assert.equal(semCampo.estado, 'mesma_os');
    assert.equal(semCampo.fornecedorExibido, 0);
    assert.notEqual(semCampo.fornecedorExibido, semCampo.clienteExibido);
  });

  it('snapshot diferente aparece no aviso e o par gravado continua igual', () => {
    const entrada = { tollValue: 100, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', snapshotToll: 100 };
    const leitura = classificarParPedagio(entrada);
    assert.equal(leitura.clienteExibido, 120);
    assert.equal(entrada.tollValue, 100);
    assert.equal(entrada.snapshotToll, 100);
    assert.match(leitura.aviso || '', /Snapshot/);
    assert.match(leitura.aviso || '', /não foi alterado/);
  });

  it('a mesma leitura repetida não muda o resultado', () => {
    const primeira = classificarParPedagio({ tollValue: 100, tollValueProvider: 100, clientName: 'CEVA LOGISTICS' });
    const segunda = classificarParPedagio({
      tollValue: primeira.clienteGravado,
      tollValueProvider: primeira.fornecedorGravado,
      clientName: 'CEVA LOGISTICS',
    });
    assert.equal(segunda.clienteExibido, primeira.clienteExibido);
    assert.equal(segunda.fornecedorExibido, primeira.fornecedorExibido);
    assert.equal(segunda.estado, primeira.estado);
  });

  it('relatório leve e painel leem o classificador sem mexer nos totais oficiais', () => {
    const relatorio = fs.readFileSync('components/MissionReportPage.tsx', 'utf8');
    const painel = fs.readFileSync('components/ExecutiveDashboard.tsx', 'utf8');
    const boletim = fs.readFileSync('components/ClientBillingReport.tsx', 'utf8');
    const dre = fs.readFileSync('components/FinancialDRE.tsx', 'utf8');
    const fatura = fs.readFileSync('lib/billing/sincronizarFaturaAberta.ts', 'utf8');
    assert.match(relatorio, /classificarParPedagio/);
    assert.doesNotMatch(relatorio, /toll_value_provider\) \|\| tollRev/);
    assert.match(painel, /classificarParPedagio/);
    assert.match(painel, /camposPedagioSnapshotAceite/);
    assert.match(painel, /!mission\.snapshot_approved_by/);
    assert.doesNotMatch(painel, /toll_value_provider \|\| mission\.toll_value/);
    for (const oficial of [boletim, dre, fatura]) {
      assert.match(oficial, /resolveStoredClientToll/);
      assert.doesNotMatch(oficial, /classificarParPedagio/);
    }
  });
});

describe('snapshot do aceite em lote', () => {
  const oficial = (revenue: number, tollValue: unknown, tollProvider: unknown, client: string, disp = 0) =>
    Math.round((revenue + resolveStoredClientToll(tollValue, tollProvider, client) + disp) * 100) / 100;

  it('legado 100/100 congela cliente 120 e fornecedor 100', () => {
    const snap = camposPedagioSnapshotAceite({
      tollValue: 100,
      tollValueProvider: 100,
      clientName: 'CEVA LOGISTICS',
      revenueServiceOnly: 500,
      displacementVal: 20,
    });
    assert.equal(snap.tollVal, 120);
    assert.equal(snap.tollProvider, 100);
    assert.equal(snap.totalGeral, oficial(500, 100, 100, 'CEVA LOGISTICS', 20));
    assert.notEqual(snap.tollVal, billableClientToll(120));
  });

  it('par 120/100 e par manual 115/100 permanecem', () => {
    const novo = camposPedagioSnapshotAceite({
      tollValue: 120, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 10,
    });
    assert.equal(novo.tollVal, 120);
    assert.equal(novo.tollProvider, 100);
    const manual = camposPedagioSnapshotAceite({
      tollValue: 115, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 10,
    });
    assert.equal(manual.tollVal, 115);
    assert.equal(manual.tollProvider, 100);
    assert.equal(manual.totalGeral, oficial(10, 115, 100, 'CEVA LOGISTICS'));
  });

  it('DHL e valor até R$ 10 permanecem iguais', () => {
    const dhl = camposPedagioSnapshotAceite({
      tollValue: 50, tollValueProvider: 50, clientName: 'DHL EXPRESS', revenueServiceOnly: 80,
    });
    assert.equal(dhl.tollVal, 50);
    assert.equal(dhl.tollProvider, 50);
    const baixo = camposPedagioSnapshotAceite({
      tollValue: 8, tollValueProvider: 8, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 80,
    });
    assert.equal(baixo.tollVal, 8);
    assert.equal(baixo.tollProvider, 8);
  });

  it('fornecedor zero permanece zero e fornecedor ausente não vira custo', () => {
    const zero = camposPedagioSnapshotAceite({
      tollValue: 120, tollValueProvider: 0, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 40,
    });
    assert.equal(zero.tollVal, 120);
    assert.equal(zero.tollProvider, 0);
    assert.notEqual(zero.tollProvider, zero.tollVal);
    const ausente = camposPedagioSnapshotAceite({
      tollValue: 100, tollValueProvider: null, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 40,
    });
    assert.equal(ausente.tollVal, 120);
    assert.equal(ausente.tollProvider, null);
    assert.equal(ausente.totalGeral, oficial(40, 100, null, 'CEVA LOGISTICS'));
    const lido = JSON.parse(JSON.stringify(ausente));
    assert.equal(lido.tollProvider, null);
    assert.equal(hasUsableBillingSnapshot({ ...ausente, route: '-' }), true);
  });

  it('OS mesma preserva o cliente e zera só o fornecedor já gravado', () => {
    const gravada = camposPedagioSnapshotAceite({
      tollValue: 60, tollValueProvider: 0, clientName: 'CEVA LOGISTICS', isSameOs: true, revenueServiceOnly: 30,
    });
    assert.equal(gravada.tollVal, 60);
    assert.equal(gravada.tollProvider, 0);
    const semCampo = camposPedagioSnapshotAceite({
      tollValue: 60, tollValueProvider: null, clientName: 'CEVA LOGISTICS', isSameOs: true, revenueServiceOnly: 30,
    });
    assert.equal(semCampo.tollProvider, null);
    assert.notEqual(semCampo.tollProvider, 0);
  });

  it('boletim e CEVA leem o snapshot novo sem dobrar a faixa', () => {
    const snap = camposPedagioSnapshotAceite({
      tollValue: 100, tollValueProvider: 100, clientName: 'CEVA LOGISTICS', revenueServiceOnly: 200,
    });
    const colunas = { toll_value: 100, toll_value_provider: 100, client: 'CEVA LOGISTICS' };
    const useToll = resolveStoredClientToll(colunas.toll_value ?? snap.tollVal ?? 0, colunas.toll_value_provider, colunas.client);
    assert.equal(useToll, 120);
    assert.equal(useToll, snap.tollVal);
    const mudou = osMudouDepoisDoSnapshot({
      id: 'GTM-1',
      client: 'CEVA LOGISTICS',
      revenue_value: 200,
      toll_value: 100,
      toll_value_provider: 100,
    }, {
      tollVal: snap.tollVal,
      revenueServiceOnly: 200,
      totalGeral: snap.totalGeral,
    });
    assert.equal(mudou, false);
  });

  it('o aceite em lote não grava o par da OS nem recria snapshot aprovado', () => {
    const painel = fs.readFileSync('components/ExecutiveDashboard.tsx', 'utf8');
    const auditoria = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(painel, /canSnapshot = \(stage === 'financeiro' \|\| stage === 'diretoria'\) && !mission\.snapshot_approved_by/);
    assert.match(painel, /billing_approved: true/);
    assert.doesNotMatch(painel, /toll_value:\s*pedagioSnapshot/);
    assert.doesNotMatch(painel, /toll_value_provider:\s*pedagioSnapshot/);
    assert.match(auditoria, /toll_value: r2\(toll\)/);
  });
});
