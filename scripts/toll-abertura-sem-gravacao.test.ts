import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function trecho(texto: string, inicio: string, fim: string): string {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de + inicio.length);
  assert.ok(de >= 0, `não achei ${inicio}`);
  assert.ok(ate > de, `não achei ${fim} depois de ${inicio}`);
  return texto.slice(de, ate);
}

describe('abertura das telas não grava', () => {
  it('o modal financeiro não grava KM, receita nem custo ao carregar', () => {
    const modal = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    const carga = trecho(modal, 'const loadData = async () => {', 'const applySameOsLink = async () => {');
    assert.equal(carga.includes('.update('), false);
    assert.match(carga, /Abertura não preenche KM previsto/);

    const realinha = trecho(
      modal,
      'const canResyncSaved = dbValuesLoadedRef.current',
      'Motor automático é fonte oficial na TELA',
    );
    assert.equal(realinha.includes('.update('), false);
    assert.equal(realinha.includes('system_logs'), false);
    assert.equal(modal.includes('AUTO_RESYNC_BILLING'), false);
    assert.match(modal, /const handleUpdate = async \(approve: boolean/);
  });

  it('o modal operacional não grava a localização ao abrir', () => {
    const modal = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    const carga = trecho(modal, 'const loadMissionData = async () => {', 'const fetchAllAgents = async');
    assert.equal(carga.includes('.update('), false);
    assert.match(carga, /Abertura não grava current_location/);
    assert.match(modal, /current_location: finalLocationToSave/);
  });

  it('o faturamento só lê ao abrir e mantém a sincronização manual', () => {
    const tela = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const abertura = trecho(tela, 'const fetchInvoices = useCallback', 'const handleSyncStatus = async');
    assert.equal(abertura.includes("method: 'POST'"), false);
    assert.equal(abertura.includes('init-invoices'), false);
    assert.equal(abertura.includes('retry-now'), false);
    assert.equal(abertura.includes('ensure-clean-slate'), false);
    assert.match(abertura, /authFetch\('\/api\/nf\/invoices'\)/);

    const retroativo = trecho(tela, 'const handleBackfillPaidAsaas = async () => {', 'const fetchInvoices = useCallback');
    assert.match(retroativo, /\/api\/asaas\/sync-open-payments/);
    assert.match(retroativo, /method: 'POST'/);

    const umaFatura = trecho(tela, 'const handleSyncStatus = async (inv: Invoice) => {', 'const handleCancelInvoice = async');
    assert.match(umaFatura, /\/api\/asaas\/sync-payment-status/);
    assert.match(umaFatura, /method: 'POST'/);
  });
});
