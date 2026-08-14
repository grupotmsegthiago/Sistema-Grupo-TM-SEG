import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nfControlHandler from '../api/nf-control.js';
import { transformFinancialInvoicesForControl } from '../lib/nfInvoiceControlApi.js';

describe('Controle de Faturas — listagem via API autenticada', () => {
  it('FinancialInvoiceControl usa GET /api/nf/invoices (não supabase anon)', () => {
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    const start = src.indexOf('const fetchInvoices = useCallback');
    const end = src.indexOf('}, []);', start) + '}, []);'.length;
    const fetchFn = src.slice(start, end);
    assert.match(fetchFn, /authFetch\('\/api\/nf\/invoices'\)/);
    assert.doesNotMatch(fetchFn, /from\('financial_invoices'\)/);
    assert.match(fetchFn, /if \(!res\.ok \|\| !data\?\.success\)/);
    assert.match(fetchFn, /if \(!silent\) setInvoices\(\[\]\)/);
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

  it('transformação preserva status, emissora e converte vencida', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');
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
        issuer_company: 'TM GESTÃO',
      },
      { id: '4', number: 'NF-4', status: 'EMITIDA', created_at: '2026-08-01T00:00:00.000Z', issuer_company: 'TM SECURITY' },
      { id: '5', number: 'NF-5', status: 'PAGA', created_at: '2026-08-01T00:00:00.000Z', issuer_company: 'TM GESTÃO' },
      { id: '6', number: 'NF-6', status: 'CANCELADA', created_at: '2026-08-01T00:00:00.000Z', issuer_company: 'TM SEGURANÇA' },
    ];
    const transformed = transformFinancialInvoicesForControl(rows, now);
    assert.equal(transformed.length, 4);
    assert.deepEqual(
      Object.fromEntries(['EMITIDA', 'PAGA', 'VENCIDA', 'CANCELADA'].map(
        (status) => [status, transformed.filter((row) => row.status === status).length],
      )),
      { EMITIDA: 1, PAGA: 1, VENCIDA: 1, CANCELADA: 1 },
    );
    assert.equal(transformed.find((row) => row.id === '3')?.issuer_company, 'TM GESTÃO');
    assert.equal(transformed.filter((row) => row.issuer_company === 'TM GESTÃO').length, 2);
    assert.equal(transformFinancialInvoicesForControl([], now).length, 0);
  });

  it('frontend mantém busca, filtro de status e emissora', () => {
    const src = fs.readFileSync('components/FinancialInvoiceControl.tsx', 'utf8');
    assert.match(src, /statusFilter === 'ALL'/);
    assert.match(src, /issuer_company \|\| '\(sem emissora\)'/);
    assert.match(src, /searchTerm\.toLowerCase\(\)/);
    assert.match(src, /i\.client\?\.toLowerCase\(\)\.includes\(term\)/);
    assert.match(src, /i\.number\?\.toLowerCase\(\)\.includes\(term\)/);
    assert.match(src, /i\.issuer_company\?\.toLowerCase\(\)\.includes\(term\)/);
  });

  it('endpoint bloqueia sem credencial antes de consultar dados', async () => {
    let status = 0;
    let body: any;
    await nfControlHandler(
      { method: 'GET', headers: {}, query: { op: 'list' } },
      {
        setHeader() {},
        status(code: number) {
          status = code;
          return { json(value: unknown) { body = value; } };
        },
      },
    );
    assert.equal(status, 401);
    assert.equal(body?.error, 'Não autorizado');
  });

  it('token inválido é bloqueado', async () => {
    let status = 0;
    await nfControlHandler(
      { method: 'GET', headers: { authorization: 'Bearer inválido' }, query: { op: 'list' } },
      {
        setHeader() {},
        status(code: number) {
          status = code;
          return { json() {} };
        },
      },
    );
    assert.equal(status, 401);
  });

  it('perfil incorreto recebe 403 e financeiro alcança handler', async () => {
    const token = 'tmseg-token-user-hotfix-1234567890';
    const run = async (role: string) => {
      let status = 0;
      let body: any;
      await nfControlHandler(
        {
          method: 'GET',
          query: { op: 'list' },
          headers: {
            authorization: `Bearer ${token}`,
            'x-tmseg-user-id': 'user-hotfix',
            'x-tmseg-role': role,
            'x-tmseg-permissions': '[]',
          },
        },
        {
          setHeader() {},
          status(code: number) {
            status = code;
            return { json(value: unknown) { body = value; } };
          },
        },
      );
      return { status, body };
    };

    const denied = await run('operador');
    assert.equal(denied.status, 403);

    const allowed = await run('financeiro');
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body?.success, true);
    assert.ok(Array.isArray(allowed.body?.invoices));
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
