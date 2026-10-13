import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  avaliarDivergenciaFatura,
  auditarDivergenciasInvoices,
  consolidarDivergenciasComNf,
  faturaEhDeOutroCnpj,
  candidatasDaMesmaAuditoria,
  filtrarDivergenciasAbertas,
  filtrarDivergenciasDiretoria,
  filtrarDivergenciasNaoVerificadas,
  formatarTagDivergencia,
  listarNfCandidatasDoCliente,
  nfEhDoMesmoCliente,
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

describe('auditoria de divergência — outra NF do mesmo cliente', () => {
  const base = {
    status: 'EMITIDA',
    consultaOsIncompleta: false,
    valorComissaoFaturamento: null,
  };

  it('soma a outra NF e some quando o conjunto fecha', () => {
    assert.equal(nfEhDoMesmoCliente('INTERMODAL BRASIL', 'INTERMODAL BRASIL LOGISTICA S.A.'), true);
    assert.equal(nfEhDoMesmoCliente('CESLOG', 'LUFT LOGISTICS'), false);
    const fechou = consolidarDivergenciasComNf(
      [
        { ...base, invoiceId: 'a', faturaNumero: 'NF-A', cliente: 'CESLOG', valorFatura: 176350.81, missionIds: ['os-1'] },
        { ...base, invoiceId: 'b', faturaNumero: 'NF-B', cliente: 'CESLOG FILIAL', valorFatura: 12721.19, missionIds: [] },
      ],
      { 'os-1': 189072 },
      [{ invoiceId: 'a', outraInvoiceId: 'b' }],
    );
    assert.equal(fechou.length, 0);
  });

  it('se ainda divergir depois do vínculo, sobe para a diretoria', () => {
    const aberto = consolidarDivergenciasComNf(
      [
        { ...base, invoiceId: 'a', faturaNumero: 'NF-A', cliente: 'CESLOG', valorFatura: 100, missionIds: ['os-1'] },
      ],
      { 'os-1': 180 },
      [],
    );
    assert.equal(aberto.length, 1);
    assert.equal(aberto[0].escalarDiretoria, false);
    assert.equal(filtrarDivergenciasDiretoria(aberto).length, 0);

    const residual = consolidarDivergenciasComNf(
      [
        { ...base, invoiceId: 'a', faturaNumero: 'NF-A', cliente: 'CESLOG', valorFatura: 100, missionIds: ['os-1'] },
        { ...base, invoiceId: 'b', faturaNumero: 'NF-B', cliente: 'CESLOG SP', valorFatura: 20, missionIds: ['os-2'] },
      ],
      { 'os-1': 180, 'os-2': 30 },
      [{ invoiceId: 'a', outraInvoiceId: 'b' }],
    );
    assert.equal(residual.length, 1);
    assert.equal(residual[0].escalarDiretoria, true);
    assert.equal(residual[0].valorOs, 210);
    assert.equal(residual[0].valorFatura, 120);
    assert.equal(filtrarDivergenciasDiretoria(residual).length, 1);
  });

  it('lista todas as NFs de outro CNPJ e esconde o mesmo CNPJ', async () => {
    const clientes = [
      { name: 'INTERMODAL BRASIL LOGISTICA S.A.', trading_name: 'INTERMODAL', cnpj: '03.558.055/0001-00' },
      { name: 'CESLOG', trading_name: 'CESLOG', cnpj: '11.111.111/0001-11' },
    ];
    assert.equal(faturaEhDeOutroCnpj('INTERMODAL BRASIL LOGISTICA S.A.', 'INTERMODAL', clientes), false);
    assert.equal(faturaEhDeOutroCnpj('INTERMODAL BRASIL LOGISTICA S.A.', 'CESLOG', clientes), true);

    const db = seedDb();
    db.financial_invoices.push(
      { id: 'inv-mesmo', client: 'INTERMODAL', number: 'NF-MESMO', status: 'EMITIDA', amount: 10 },
      { id: 'inv-outro', client: 'CESLOG', number: 'NF-OUTRO', status: 'PAGA', amount: 20 },
      { id: 'inv-cancel', client: 'AMAZON', number: 'NF-CANC', status: 'CANCELADA', amount: 30 },
    );
    (db as MemoryDb).clients = clientes;
    const res = await listarNfCandidatasDoCliente('INTERMODAL BRASIL LOGISTICA S.A.', ['inv-open'], { sb: createMemorySb(db) as never });
    assert.equal(res.ok, true);
    assert.deepEqual(res.itens.map((i) => i.id), ['inv-paga', 'inv-outro', 'inv-ok']);
    assert.equal(res.itens.find((i) => i.id === 'inv-outro')?.cnpj, '11.111.111/0001-11');
  });

  it('o vínculo usa as faturas desta auditoria e o verificado some da fila', () => {
    const tela = [
      { invoiceId: 'a', faturaNumero: 'NF-A', cliente: 'CESLOG', status: 'EMITIDA', valorOs: 10, valorFatura: 8, valorComissaoFaturamento: null, diferencaFatura: 2, diferencaComissao: null, osCount: 1, missionIdSync: 'os', estado: 'DIVERGENTE' as const, podeSincronizar: true, escalarDiretoria: false, nfsVinculadas: [] },
      { invoiceId: 'b', faturaNumero: 'NF-B', cliente: 'LUFT', status: 'EMITIDA', valorOs: 5, valorFatura: 4, valorComissaoFaturamento: null, diferencaFatura: 1, diferencaComissao: null, osCount: 1, missionIdSync: 'os2', estado: 'DIVERGENTE' as const, podeSincronizar: true, escalarDiretoria: false, nfsVinculadas: [] },
    ];
    assert.deepEqual(candidatasDaMesmaAuditoria(tela, 'a').map((n) => n.id), ['b']);
    assert.equal(filtrarDivergenciasNaoVerificadas(tela, ['a']).length, 1);
    assert.equal(filtrarDivergenciasNaoVerificadas(tela, ['a'])[0].invoiceId, 'b');
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
    const financeiro = fs.readFileSync('components/FinancialDashboard.tsx', 'utf8');
    assert.match(financeiro, /InvoiceDivergenceAuditPanel audiencia="financeiro"/);
    assert.match(financeiro, /from 'react'/);
    assert.match(dash, /InvoiceDivergenceAuditPanel audiencia="diretoria"/);
    assert.doesNotMatch(page, /InvoiceDivergenceAuditPanel/);
    assert.match(panel, /Vincular outra NF/);
    assert.match(panel, /Verificado/);
    assert.match(panel, /candidatasDaMesmaAuditoria/);
    assert.doesNotMatch(panel, /listarNfCandidatasDoCliente/);
    assert.match(panel, /from 'react'/);
    assert.match(page, /data-testid="comissoes-comerciais-page"/);
  });
});
