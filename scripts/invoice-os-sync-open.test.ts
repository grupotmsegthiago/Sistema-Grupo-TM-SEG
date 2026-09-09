import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcularComissao } from '../lib/comissao/comissaoCalc';
import {
  deveSincronizarStatusFatura,
  receitaOsParaFatura,
  sincronizarFaturaPorOS,
  somarReceitasOs,
  statusFaturaCongelado,
} from '../lib/billing/sincronizarFaturaAberta';

type Row = Record<string, unknown>;

type MemoryDb = Record<string, Row[]>;

type Filter =
  | { kind: 'eq'; k: string; v: unknown }
  | { kind: 'in'; k: string; arr: unknown[] }
  | { kind: 'or'; expr: string };

function rowMatches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.kind === 'eq' && String(row[f.k] ?? '') !== String(f.v ?? '')) return false;
    if (f.kind === 'in' && !f.arr.map((x) => String(x)).includes(String(row[f.k] ?? ''))) return false;
    if (f.kind === 'or') {
      const clauses = f.expr.split(',');
      const any = clauses.some((clause) => {
        const ilike = clause.match(/^(\w+)\.ilike\.%(.+)%$/);
        if (ilike) {
          return String(row[ilike[1]] || '').includes(ilike[2]);
        }
        const eq = clause.match(/^(\w+)\.eq\.(.+)$/);
        if (eq) return String(row[eq[1]] ?? '') === eq[2];
        return false;
      });
      if (!any) return false;
    }
  }
  return true;
}

function createMemorySb(db: MemoryDb) {
  const from = (table: string) => {
    const q = {
      filters: [] as Filter[],
      op: 'select' as 'select' | 'update' | 'insert',
      payload: null as unknown,
      select() {
        return q;
      },
      eq(k: string, v: unknown) {
        q.filters.push({ kind: 'eq', k, v });
        return q;
      },
      in(k: string, arr: unknown[]) {
        q.filters.push({ kind: 'in', k, arr });
        return q;
      },
      or(expr: string) {
        q.filters.push({ kind: 'or', expr });
        return q;
      },
      update(payload: Row) {
        q.op = 'update';
        q.payload = payload;
        return q;
      },
      insert(payload: Row | Row[]) {
        q.op = 'insert';
        q.payload = payload;
        return q;
      },
      execute() {
        const rows = db[table] || (db[table] = []);
        if (q.op === 'select') {
          return { data: rows.filter((r) => rowMatches(r, q.filters)), error: null };
        }
        if (q.op === 'update') {
          const updated: Row[] = [];
          for (const row of rows) {
            if (!rowMatches(row, q.filters)) continue;
            Object.assign(row, q.payload as Row);
            updated.push(row);
          }
          return { data: updated, error: null };
        }
        const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
        for (const row of incoming) rows.push(row as Row);
        return { data: incoming, error: null };
      },
      then(onFulfilled?: (v: { data: Row[]; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(q.execute()).then(onFulfilled, onRejected);
      },
    };
    return q;
  };
  return { from };
}

function seedOpenInvoiceDb() {
  return {
    financial_invoice_missions: [
      { invoice_id: 'inv-open', mission_id: 'GTM-A' },
      { invoice_id: 'inv-open', mission_id: 'GTM-B' },
      { invoice_id: 'inv-open', mission_id: 'GTM-C' },
      { invoice_id: 'inv-paga', mission_id: 'GTM-PAGA' },
      { invoice_id: 'inv-canc', mission_id: 'GTM-CANC' },
    ],
    financial_invoices: [
      { id: 'inv-open', status: 'EMITIDA', amount: 3000, number: 'TMSEG-OPEN', asaas_payment_id: 'pay_open' },
      { id: 'inv-paga', status: 'PAGA', amount: 80000, number: 'TMSEG-PAGA', asaas_payment_id: 'pay_paga' },
      { id: 'inv-canc', status: 'CANCELADA', amount: 12000, number: 'TMSEG-CANC', asaas_payment_id: 'pay_canc' },
    ],
    missions: [
      { id: 'GTM-A', revenue_value: 1000, toll_value: 50, toll_value_provider: 40, displacement_value: 100 },
      { id: 'GTM-B', revenue_value: 2000, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
      { id: 'GTM-C', revenue_value: 500, toll_value: 20, toll_value_provider: 20, displacement_value: 10 },
      { id: 'GTM-PAGA', revenue_value: 9999, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
      { id: 'GTM-CANC', revenue_value: 1, toll_value: 0, toll_value_provider: 0, displacement_value: 0 },
    ],
    financial_transactions: [
      { id: 'cr-open', type: 'INCOME', status: 'PENDING', amount: 3000, amount_open: 3000, amount_paid: 0, notes: 'Fatura TMSEG-OPEN | Asaas: pay_open' },
      { id: 'cr-paga', type: 'INCOME', status: 'PAID', amount: 80000, amount_open: 0, amount_paid: 80000, notes: 'Fatura TMSEG-PAGA | Asaas: pay_paga' },
      { id: 'cr-canc', type: 'INCOME', status: 'PENDING', amount: 12000, amount_open: 12000, amount_paid: 0, notes: 'Fatura TMSEG-CANC | Asaas: pay_canc' },
    ],
    comissoes: [
      {
        id: 'com-open',
        fatura_id: 'inv-open',
        origem_fatura_id: 'inv-open',
        status: 'AGUARDANDO_PAGAMENTO_CLIENTE',
        percentual_imposto_aplicado: 16,
        percentual_comissao_aplicado: 3,
        valor_faturamento: 3000,
        valor_base_liquida: 2520,
        valor_comissao: 75.6,
      },
      {
        id: 'com-paga',
        fatura_id: 'inv-paga',
        origem_fatura_id: 'inv-paga',
        status: 'PAGO',
        percentual_imposto_aplicado: 16,
        percentual_comissao_aplicado: 3,
        valor_faturamento: 80000,
        valor_base_liquida: 67200,
        valor_comissao: 2016,
      },
    ],
    system_logs: [] as Row[],
  } satisfies MemoryDb;
}

describe('sync fatura aberta — cálculo puro', () => {
  it('soma receita + pedágio cliente + DESL de várias OS', () => {
    const osA = { revenue_value: 1000, toll_value: 50, toll_value_provider: 40, displacement_value: 100 };
    const osB = { revenue_value: 2000, toll_value: 0, toll_value_provider: 0, displacement_value: 0 };
    const osC = { revenue_value: 500, toll_value: 20, toll_value_provider: 20, displacement_value: 10 };
    assert.equal(receitaOsParaFatura(osA), 1150);
    assert.equal(receitaOsParaFatura(osB), 2000);
    assert.equal(receitaOsParaFatura(osC), 534);
    assert.equal(somarReceitasOs([osA, osB, osC]), 3684);
  });

  it('só EMITIDA/VENCIDA entram no recálculo; PAGA/CANCELADA congelam', () => {
    assert.equal(deveSincronizarStatusFatura('EMITIDA'), true);
    assert.equal(deveSincronizarStatusFatura('VENCIDA'), true);
    assert.equal(deveSincronizarStatusFatura('PAGA'), false);
    assert.equal(deveSincronizarStatusFatura('CANCELADA'), false);
    assert.equal(statusFaturaCongelado('PAGA'), true);
    assert.equal(statusFaturaCongelado('CANCELADA'), true);
  });
});

describe('sync fatura aberta — recálculo encadeado', () => {
  it('recalcula a SOMA das OS na fatura EMITIDA, CR e comissão em aberto', async () => {
    const db = seedOpenInvoiceDb();
    const res = await sincronizarFaturaPorOS('GTM-A', { sb: createMemorySb(db), userName: 'teste' });
    assert.equal(res.ok, true);
    const item = res.invoices?.find((i) => i.invoiceId === 'inv-open');
    assert.equal(item?.action, 'updated');
    assert.equal(item?.valorAntigo, 3000);
    assert.equal(item?.valorNovo, 3684);

    const fatura = db.financial_invoices.find((f) => f.id === 'inv-open')!;
    assert.equal(fatura.amount, 3684);

    const cr = db.financial_transactions.find((t) => t.id === 'cr-open')!;
    assert.equal(cr.amount, 3684);
    assert.equal(cr.amount_open, 3684);

    const esperado = calcularComissao(3684, 16, 3);
    const com = db.comissoes.find((c) => c.id === 'com-open')!;
    assert.equal(com.valor_faturamento, esperado.valorFaturamento);
    assert.equal(com.valor_base_liquida, esperado.valorBaseLiquida);
    assert.equal(com.valor_comissao, esperado.valorComissao);
    assert.equal(com.status, 'AGUARDANDO_PAGAMENTO_CLIENTE');

    const log = db.system_logs.find((l) => l.action_type === 'BILLING_SYNC_OPEN_INVOICE');
    assert.ok(log);
    const details = JSON.parse(String(log.details));
    assert.equal(details.invoiceId, 'inv-open');
    assert.equal(details.valorAntigo, 3000);
    assert.equal(details.valorNovo, 3684);
  });

  it('não altera fatura PAGA nem o CR/comissão já baixados', async () => {
    const db = seedOpenInvoiceDb();
    const res = await sincronizarFaturaPorOS('GTM-PAGA', { sb: createMemorySb(db) });
    assert.equal(res.ok, true);
    assert.equal(res.invoices?.[0]?.action, 'skipped_frozen');
    assert.equal(db.financial_invoices.find((f) => f.id === 'inv-paga')?.amount, 80000);
    assert.equal(db.financial_transactions.find((t) => t.id === 'cr-paga')?.amount, 80000);
    assert.equal(db.comissoes.find((c) => c.id === 'com-paga')?.valor_faturamento, 80000);
    assert.equal(db.system_logs.length, 0);
  });

  it('não altera fatura CANCELADA', async () => {
    const db = seedOpenInvoiceDb();
    const res = await sincronizarFaturaPorOS('GTM-CANC', { sb: createMemorySb(db) });
    assert.equal(res.ok, true);
    assert.equal(res.invoices?.[0]?.action, 'skipped_frozen');
    assert.equal(db.financial_invoices.find((f) => f.id === 'inv-canc')?.amount, 12000);
    assert.equal(db.financial_transactions.find((t) => t.id === 'cr-canc')?.amount, 12000);
  });

  it('não atualiza com soma parcial se faltar OS do vínculo (fail-closed)', async () => {
    const db = seedOpenInvoiceDb();
    db.missions = db.missions.filter((m) => m.id !== 'GTM-C');
    const res = await sincronizarFaturaPorOS('GTM-A', { sb: createMemorySb(db) });
    assert.equal(res.ok, true);
    assert.equal(res.invoices?.[0]?.action, 'skipped_incomplete');
    assert.equal(db.financial_invoices.find((f) => f.id === 'inv-open')?.amount, 3000);
  });
});

describe('sync fatura aberta — acoplamento UI', () => {
  it('modais chamam o sync fail-soft após gravar a OS', () => {
    const update = fs.readFileSync('components/UpdateMissionModal.tsx', 'utf8');
    const financial = fs.readFileSync('components/MissionFinancialModal.tsx', 'utf8');
    assert.match(update, /from 'react'/);
    assert.match(financial, /from 'react'/);
    assert.match(update, /dispararSyncFaturaPorOS/);
    assert.match(financial, /dispararSyncFaturaPorOS/);
    const service = fs.readFileSync('lib/billing/sincronizarFaturaAberta.ts', 'utf8');
    assert.match(service, /BILLING_SYNC_OPEN_INVOICE/);
    assert.match(service, /statusFaturaCongelado/);
    assert.doesNotMatch(service, /persistAsaas|createPayment|asaas\.com/i);
  });
});
