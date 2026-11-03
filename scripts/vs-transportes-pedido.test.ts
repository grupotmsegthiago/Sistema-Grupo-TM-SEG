import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isVsTransportesClient, referenciaPedidosVsFaltando } from '../lib/billing/vsTransportesPedido';

describe('VS TRANSPORTES — referência de pedidos', () => {
  it('reconhece somente a VS TRANSPORTES', () => {
    assert.equal(isVsTransportesClient('VS TRANSPORTES LTDA'), true);
    assert.equal(isVsTransportesClient('vs transportes ltda'), true);
    assert.equal(isVsTransportesClient(null, 'VS OPERADOR LOGISTICO'), true);
    assert.equal(isVsTransportesClient('CESLOG - CESARI LOGISTICA LTDA'), false);
    assert.equal(isVsTransportesClient('TECHTRANS TRANSPORTES'), false);
    assert.equal(isVsTransportesClient('DHL'), false);
    assert.equal(isVsTransportesClient('AMAZON TRANSPORTES LTDA.'), false);
    assert.equal(isVsTransportesClient('INTERMODAL BRASIL LOGISTICA S.A.'), false);
  });

  it('exige a referência no salvamento operacional da VS', () => {
    assert.equal(referenciaPedidosVsFaltando('VS TRANSPORTES LTDA', ''), true);
    assert.equal(referenciaPedidosVsFaltando('VS TRANSPORTES LTDA', '   '), true);
    assert.equal(referenciaPedidosVsFaltando('VS OPERADOR LOGISTICO', null), true);
    assert.equal(referenciaPedidosVsFaltando('VS TRANSPORTES LTDA', '303185 / 303189'), false);
    assert.equal(referenciaPedidosVsFaltando('CESLOG', ''), false);
    const src = readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(src, /referenciaPedidosVsFaltando\(mission\.client, editData\.reference_number\)/);
  });

  it('exige o campo só na criação da OS da VS', () => {
    const src = readFileSync('components/MissionForm.tsx', 'utf8');
    assert.match(src, /isVsTransportesClient\(clientUpper\)/);
    assert.match(src, /data-testid="input-vs-pedido-ref"/);
    assert.match(src, /CESLOG\/CESARI/);
  });

  it('OS já aprovada salva a referência sem liberar o restante', () => {
    const src = readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    assert.match(src, /if \(isVsTransportesClient\(mission\.client\)\)/);
    assert.match(src, /approvedPayload\.reference_number/);
    assert.match(src, /data-testid="input-edit-vs-pedido-ref"/);
    assert.match(src, /Nº Referência CESLOG\/CESARI/);
  });

  it('auditoria de faturamento tem o campo da referência da VS', () => {
    const src = readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(src, /data-testid="input-audit-vs-pedido-ref"/);
    assert.match(src, /isVsTransportesClient\(clientName, mission\?\.client\)/);
    assert.match(src, /reference_number: referencia/);
    assert.match(src, /<VsPedidoReferenciaPanel/);
  });

  it('coluna REF. PEDIDOS entra só no boletim de cliente', () => {
    const src = readFileSync('components/ClientBillingReport.tsx', 'utf8');
    assert.match(src, /reportMode === 'cliente' && isVsTransportesClient/);
    assert.match(src, /REF\. PEDIDOS/);
    assert.match(src, /data-testid=\{`cell-vs-pedido-\$\{r\.id\}`\}/);
    assert.match(src, /if \(isVsTransportesBilling\) row\.push\(r\.referenceNumber/);
    assert.match(src, /if \(isVsTransportesBilling\) headers\.push\('REF\. PEDIDOS'\)/);
  });
});
