import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  avaliarDivergenciaFatura,
  auditarDivergenciasInvoices,
  filtrarDivergenciasAbertas,
  formatarTagDivergencia,
  valoresDivergem,
} from '../lib/billing/auditarDivergenciasFinanceiras';
import { somarReceitasOs } from '../lib/billing/sincronizarFaturaAberta';

type Row = Record<string, unknown>;
type MemoryDb = Record<string, Row[]>;
type Filter =
  | { kind: 'eq'; k: string; v: unknown }
  | { kind: 'in'; k: string; arr: unknown[] };

function rowMatches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.kind === 'eq' && String(row[f.k] ?? '') !== String(f.v ?? '')) return false;
    if (f.kind === 'in' && !f.arr.map((x) => String(x)).includes(String(row[f.k] ?? ''))) return false;
  }
  return true;
}

function createMemorySb(db: MemoryDb) {
  const from = (table: string) => {
    const q = {
      filters: [] as Filter[],
      select() { return q; },
      eq(k: string, v: unknown) { q.filters.push({ kind: 'eq', k, v }); return q; },
      in(k: string, arr: unknown[]) { q.filters.push({ kind: 'in', k, arr }); return q; },
      execute() {
        const rows = db[table] || [];
        return { data: rows.filter((r) => rowMatches(r, q.filters)), error: null };
      },
      then(onFulfilled?: (v: { data: Row[]; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(q.execute()).then(onFulfilled, onRejected);
      },
    };
    return q;
  };
  return { from };
}

function seedDb() {
  return {
    financial_invoice_missions: [
      { invoice_id: 'inv-open', mission_id: 'GTM-A' },
      { invoice_id: 'inv-open', mission_id: 'GTM-B' },
      { invoice_id: 'inv-ok', mission_id: 'GTM-OK' },
      { invoice_id: 'inv-paga', mission_id: 'GTM-PAGA' },
    ],
    financial_invoices: [
      { id: 'inv-open', client: 'DHL', number: 'TMSEG-OPEN', status: 'EMITIDA', amount: 3000 },
      { id: 'inv-ok', client: 'CEVA', number: 'TMSEG-OK', status: 'EMITIDA', amount: 1000 },
      { id: 'inv-paga', client: 'AMAZON', number: 'TMSEG-PAGA', status: 'PAGA', amount: 5000 },
    ],
    missions: [
      { id: 'GTM-A', revenue_value: 1000, toll_value: 50, toll_value_provider: 40, displacement_value: 100 },
      { id: 'GTM-B', revenue_value: 2000, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
      { id: 'GTM-OK', revenue_value: 1000, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
      { id: 'GTM-PAGA', revenue_value: 9999, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
    ],
    comissoes: [
      { fatura_id: 'inv-open', origem_fatura_id: 'inv-open', valor_faturamento: 3000, status: 'AGUARDANDO_PAGAMENTO_CLIENTE' },
      { fatura_id: 'inv-ok', origem_fatura_id: 'inv-ok', valor_faturamento: 1000, status: 'AGUARDANDO_PAGAMENTO_CLIENTE' },
      { fatura_id: 'inv-paga', origem_fatura_id: 'inv-paga', valor_faturamento: 5000, status: 'PAGO' },
    ],
  } satisfies MemoryDb;
}

describe('auditoria de divergência — cálculo puro', () => {
  it('detecta diferença acima de R$ 0,01 entre soma das OS e fatura', () => {
    assert.equal(valoresDivergem(100, 100), false);
    assert.equal(valoresDivergem(100, 100.01), false);
    assert.equal(valoresDivergem(100, 100.02), true);
    const item = avaliarDivergenciaFatura({
      invoiceId: 'inv-1',
      faturaNumero: 'TMSEG-1',
      cliente: 'DHL',
      status: 'EMITIDA',
      valorFatura: 3000,
      valorOs: 3684,
      valorComissaoFaturamento: 3000,
      osCount: 2,
      missionIdSync: 'GTM-A',
    });
    assert.ok(item);
    assert.equal(item?.podeSincronizar, true);
    assert.equal(item?.diferencaFatura, 684);
    assert.match(formatarTagDivergencia(item!), /OS R\$ 3\.684,00 vs Fatura R\$ 3\.000,00/);
  });

  it('não marca fatura alinhada e congela PAGA para sync', () => {
    const ok = avaliarDivergenciaFatura({
      invoiceId: 'inv-ok',
      status: 'EMITIDA',
      valorFatura: 1000,
      valorOs: 1000,
      valorComissaoFaturamento: 1000,
      osCount: 1,
      missionIdSync: 'GTM-OK',
    });
    assert.equal(ok, null);
    const paga = avaliarDivergenciaFatura({
      invoiceId: 'inv-paga',
      status: 'PAGA',
      valorFatura: 5000,
      valorOs: 9999,
      osCount: 1,
      missionIdSync: 'GTM-PAGA',
    });
    assert.ok(paga);
    assert.equal(paga?.podeSincronizar, false);
    assert.deepEqual(filtrarDivergenciasAbertas([paga!]), []);
  });
});

describe('auditoria de divergência — consulta encadeada', () => {
  it('lista só a fatura aberta cuja soma das OS diverge', async () => {
    const db = seedDb();
    const somaOpen = somarReceitasOs([
      db.missions[0],
      db.missions[1],
    ]);
    const res = await auditarDivergenciasInvoices({ sb: createMemorySb(db) });
    assert.equal(res.ok, true);
    const open = res.items.find((i) => i.invoiceId === 'inv-open');
    const aligned = res.items.find((i) => i.invoiceId === 'inv-ok');
    const paga = res.items.find((i) => i.invoiceId === 'inv-paga');
    assert.ok(open);
    assert.equal(open?.valorOs, somaOpen);
    assert.equal(open?.valorFatura, 3000);
    assert.equal(open?.podeSincronizar, true);
    assert.equal(aligned, undefined);
    assert.ok(paga);
    assert.equal(paga?.podeSincronizar, false);
    assert.equal(filtrarDivergenciasAbertas(res.items).length, 1);
  });

  it('marca consulta incompleta se faltar OS do vínculo (fail-closed)', async () => {
    const db = seedDb();
    db.missions = db.missions.filter((m) => m.id !== 'GTM-B');
    const res = await auditarDivergenciasInvoices({ sb: createMemorySb(db) });
    const open = res.items.find((i) => i.invoiceId === 'inv-open');
    assert.equal(open?.estado, 'CONSULTA_INCOMPLETA');
    assert.equal(open?.podeSincronizar, false);
  });
});

describe('auditoria de divergência — UI Diretoria', () => {
  it('painel usa a tag pedida e o botão Sincronizar Valor chama sincronizarFaturaPorOS', () => {
    const panel = fs.readFileSync('components/InvoiceDivergenceAuditPanel.tsx', 'utf8');
    const page = fs.readFileSync('components/ComissoesComerciaisPage.tsx', 'utf8');
    const dash = fs.readFileSync('components/dashboard/DashboardDiretoria.tsx', 'utf8');
    assert.match(panel, /from 'react'/);
    assert.match(page, /from 'react'/);
    assert.match(dash, /from 'react'/);
    assert.match(panel, /formatarTagDivergencia/);
    assert.match(panel, /Sincronizar Valor/);
    assert.match(panel, /sincronizarFaturaPorOS/);
    assert.match(page, /InvoiceDivergenceAuditPanel/);
    assert.match(dash, /InvoiceDivergenceAuditPanel/);
    assert.match(page, /data-testid="comissoes-comerciais-page"/);
  });
});
