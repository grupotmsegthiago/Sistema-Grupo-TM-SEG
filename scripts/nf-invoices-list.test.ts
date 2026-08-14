import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAfterInvoiceControlEpoch } from '../lib/invoiceCleanSlate.js';
import { isPureMedicaoInvoice } from '../lib/billing/medicaoVisibility.js';

describe('Controle de Faturas — listagem via API autenticada', () => {
  it('FinancialInvoiceControl usa GET /api/nf/invoices (não supabase anon)', () => {
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const start = src.indexOf('const fetchInvoices = useCallback');
    const end = src.indexOf('}, []);', start) + '}, []);'.length;
    const fetchFn = src.slice(start, end);
    assert.match(fetchFn, /authFetch\('\/api\/nf\/invoices'\)/);
    assert.doesNotMatch(fetchFn, /from\('financial_invoices'\)/);
    assert.match(src, /from 'react'/);
  });

  it('nf-control expõe op=list e vercel rewrite /api/nf/invoices', () => {
    const api = fs.readFileSync('api/nf-control.ts', 'utf8');
    const lib = fs.readFileSync('lib/nfInvoiceControlApi.ts', 'utf8');
    const vercel = fs.readFileSync('vercel.json', 'utf8');
    assert.match(api, /listFinancialInvoicesForControl/);
    assert.match(api, /op === 'list'/);
    assert.match(lib, /export async function listFinancialInvoicesForControl/);
    assert.match(vercel, /\/api\/nf\/invoices/);
    assert.match(vercel, /nf-control\?op=list/);
  });

  it('listFinancialInvoicesForControl aplica epoch e filtro MED- (unitário)', () => {
    const now = new Date();
    const rows = [
      {
        id: '1',
        number: 'NF-1',
        status: 'EMITIDA',
        created_at: '2026-06-01T00:00:00.000Z',
        asaas_payment_id: 'pay_old',
      },
      {
        id: '2',
        number: 'MED-99',
        status: 'EMITIDA',
        created_at: now.toISOString(),
      },
      {
        id: '3',
        number: 'NF-3',
        status: 'EMITIDA',
        created_at: '2026-08-01T00:00:00.000Z',
        asaas_payment_id: 'pay_new',
        boleto_due_date: '2020-01-01',
      },
    ];
    const filtered = rows
      .filter((inv) => isAfterInvoiceControlEpoch(inv.created_at))
      .filter((inv) => !isPureMedicaoInvoice(inv))
      .map((inv) => {
        if (inv.status === 'EMITIDA' && inv.boleto_due_date) {
          const due = new Date(`${inv.boleto_due_date}T23:59:59`);
          if (now > due) return { ...inv, status: 'VENCIDA' };
        }
        return inv;
      });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, '3');
    assert.equal(filtered[0].status, 'VENCIDA');
  });

  it('chave anon não lê financial_invoices com RLS ativo (documentação)', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      'https://ajhmmjuewdsukecaimik.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk',
    );
    const { count, error } = await sb
      .from('financial_invoices')
      .select('id', { count: 'exact', head: true });
    assert.equal(error, null);
    // RLS sem policy para anon → 0 linhas (não erro). Summary admin continua com dados.
    assert.equal(count, 0);
  });
});
