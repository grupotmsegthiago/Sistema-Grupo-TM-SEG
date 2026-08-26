import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  handleRhEmployeeBankAccountRequest,
  type RhEmployeeBankAccountHandlerDeps,
} from '../api/rh-employee-bank-account';
import {
  GENERIC_BANK_SAVE_ERROR,
  saveEmployeeBankAccount,
} from '../lib/rh/employeeBankAccountFormFlow';

const root = process.cwd();
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
}

const principal = {
  id: 'user-rh-1',
  name: 'Pessoa RH',
  email: 'rh@grupotmseg.com.br',
  role: 'rh',
  clientId: null,
  permissions: [],
};

function allowedDeps(
  ops: Record<string, (...args: any[]) => Promise<any>>,
): RhEmployeeBankAccountHandlerDeps {
  return {
    authorize: async () => ({ ok: true, principal }),
    createOps: () => ops as any,
  };
}

describe('F4 segundo piloto RH — handler de dados bancários', () => {
  it('nega request sem autenticação antes da operação', async () => {
    let operations = 0;
    const res = responseMock();
    await handleRhEmployeeBankAccountRequest(
      { method: 'GET', headers: {}, query: { employeeId: EMPLOYEE_ID } },
      res,
      {
        authorize: async () => ({ ok: false, status: 401, error: 'Não autorizado' }),
        createOps: () => {
          operations += 1;
          return {} as any;
        },
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(operations, 0);
  });

  it('GET valida employeeId e retorna a conta ativa', async () => {
    let calls = 0;
    const invalid = responseMock();
    await handleRhEmployeeBankAccountRequest(
      { method: 'GET', query: { employeeId: 'inválido' } },
      invalid,
      allowedDeps({ get: async () => { calls += 1; } }),
    );
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls, 0);

    const valid = responseMock();
    await handleRhEmployeeBankAccountRequest(
      { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
      valid,
      allowedDeps({
        get: async (employeeId: string) => {
          calls += 1;
          assert.equal(employeeId, EMPLOYEE_ID);
          return { id: ACCOUNT_ID, bank_name: 'Banco TM' };
        },
      }),
    );
    assert.equal(valid.statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(valid.body.bankAccount.id, ACCOUNT_ID);
  });

  it('POST preserva o contrato de criação e força conta principal', async () => {
    let received: any;
    const res = responseMock();
    await handleRhEmployeeBankAccountRequest(
      {
        method: 'POST',
        body: {
          employeeId: EMPLOYEE_ID,
          bankName: 'Banco TM',
          bankCode: '001',
          agency: '1234',
          accountNumber: '98765-0',
          accountType: 'Corrente',
          pixKey: 'rh@tmseg.com.br',
          beneficiaryName: 'Pessoa RH',
          isPrimary: false,
        },
      },
      res,
      allowedDeps({
        create: async (input: any) => {
          received = input;
          return { id: ACCOUNT_ID, employee_id: input.employeeId };
        },
      }),
    );
    assert.equal(res.statusCode, 201);
    assert.deepEqual(received, {
      employeeId: EMPLOYEE_ID,
      bankName: 'Banco TM',
      bankCode: '001',
      agency: '1234',
      accountNumber: '98765-0',
      accountType: 'Corrente',
      pixKey: 'rh@tmseg.com.br',
      beneficiaryName: 'Pessoa RH',
      isPrimary: true,
    });
  });

  it('PATCH valida id e preserva o contrato de edição', async () => {
    let updates = 0;
    const invalid = responseMock();
    await handleRhEmployeeBankAccountRequest(
      {
        method: 'PATCH',
        query: { id: 'inválido' },
        body: { employeeId: EMPLOYEE_ID, pixKey: '123' },
      },
      invalid,
      allowedDeps({ update: async () => { updates += 1; } }),
    );
    assert.equal(invalid.statusCode, 400);
    assert.equal(updates, 0);

    const valid = responseMock();
    await handleRhEmployeeBankAccountRequest(
      {
        method: 'PATCH',
        query: { id: ACCOUNT_ID },
        body: { employeeId: EMPLOYEE_ID, pixKey: '123' },
      },
      valid,
      allowedDeps({
        update: async (id: string, input: any) => {
          updates += 1;
          assert.equal(id, ACCOUNT_ID);
          assert.equal(input.employeeId, EMPLOYEE_ID);
          return { id, employee_id: input.employeeId, pix_key: input.pixKey };
        },
      }),
    );
    assert.equal(valid.statusCode, 200);
    assert.equal(updates, 1);
  });

  it('erro interno retorna HTTP 500 genérico sem detalhes sensíveis', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      for (const method of ['POST', 'PATCH']) {
        const res = responseMock();
        await handleRhEmployeeBankAccountRequest(
          {
            method,
            query: method === 'PATCH' ? { id: ACCOUNT_ID } : {},
            body: { employeeId: EMPLOYEE_ID, bankName: 'Banco TM' },
          },
          res,
          allowedDeps({
            create: async () => { throw new Error('SENSITIVE_DB_DETAIL'); },
            update: async () => { throw new Error('SENSITIVE_DB_DETAIL'); },
          }),
        );
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Falha ao operar dados bancários' });
        assert.doesNotMatch(JSON.stringify(res.body), /SENSITIVE_DB_DETAIL/);
      }
    } finally {
      console.error = originalError;
    }
  });

  it('falha fechado sem service_role e rejeita método não permitido', async () => {
    const unavailable = responseMock();
    await handleRhEmployeeBankAccountRequest(
      { method: 'GET', query: { employeeId: EMPLOYEE_ID } },
      unavailable,
      {
        authorize: async () => ({ ok: true, principal }),
        createOps: () => null,
      },
    );
    assert.equal(unavailable.statusCode, 503);

    const invalidMethod = responseMock();
    await handleRhEmployeeBankAccountRequest(
      { method: 'DELETE' },
      invalidMethod,
    );
    assert.equal(invalidMethod.statusCode, 405);
    assert.equal(invalidMethod.headers.Allow, 'GET, POST, PATCH');
  });
});

describe('F4 segundo piloto RH — correção do falso sucesso', () => {
  it('criação e edição propagam somente a mensagem genérica', async () => {
    for (const bank of [{ bank_name: 'Banco TM' }, { id: ACCOUNT_ID, pix_key: '123' }]) {
      await assert.rejects(
        saveEmployeeBankAccount(EMPLOYEE_ID, bank, {
          create: async () => { throw new Error('SENSITIVE_CREATE_DETAIL'); },
          update: async () => { throw new Error('SENSITIVE_UPDATE_DETAIL'); },
        }),
        (error: Error) => {
          assert.equal(error.message, GENERIC_BANK_SAVE_ERROR);
          assert.doesNotMatch(error.message, /SENSITIVE/);
          return true;
        },
      );
    }
  });

  it('mantém os payloads legados de criação e edição', async () => {
    const calls: any[] = [];
    const api = {
      create: async (input: any) => {
        calls.push(['create', input]);
        return { id: ACCOUNT_ID, employee_id: input.employeeId };
      },
      update: async (id: string, input: any) => {
        calls.push(['update', id, input]);
        return { id, employee_id: input.employeeId };
      },
    };
    const fields = {
      bank_name: 'Banco TM',
      bank_code: '001',
      agency: '1234',
      account_number: '98765-0',
      account_type: 'Corrente',
      pix_key: '123',
      beneficiary_name: 'Pessoa RH',
    };
    await saveEmployeeBankAccount(EMPLOYEE_ID, fields, api);
    await saveEmployeeBankAccount(EMPLOYEE_ID, { id: ACCOUNT_ID, ...fields }, api);

    assert.equal(calls[0][0], 'create');
    assert.equal(calls[1][0], 'update');
    assert.equal(calls[1][1], ACCOUNT_ID);
    for (const call of calls) {
      const input = call.at(-1);
      assert.equal(input.employeeId, EMPLOYEE_ID);
      assert.equal(input.bankName, fields.bank_name);
      assert.equal(input.bankCode, fields.bank_code);
      assert.equal(input.agency, fields.agency);
      assert.equal(input.accountNumber, fields.account_number);
      assert.equal(input.accountType, fields.account_type);
      assert.equal(input.pixKey, fields.pix_key);
      assert.equal(input.beneficiaryName, fields.beneficiary_name);
      assert.equal(input.isPrimary, true);
    }
  });
});

describe('F4 segundo piloto RH — arquitetura e integração', () => {
  it('remove o acesso direto da UI e aguarda o banco antes do sucesso', () => {
    const form = readFileSync(join(root, 'components/rh/RhEmployeeForm.tsx'), 'utf8');
    assert.doesNotMatch(form, /\.from\(['"]rh_employee_bank_accounts['"]\)/);
    assert.doesNotMatch(form, /Falha ao carregar dados bancários/);
    assert.match(form, /import React,\s*\{[^}]*useState/);
    assert.match(form, /await saveEmployeeBankAccount\(employeeId, bank\)/);
    assert.ok(
      form.indexOf('await saveEmployeeBankAccount(employeeId, bank)')
        < form.indexOf("showNotification('success', 'Funcionário salvo com sucesso!')"),
    );
  });

  it('cliente usa authFetch e SSOT backend concentra a tabela piloto', () => {
    const client = readFileSync(join(root, 'lib/rh/employeeBankAccountsClient.ts'), 'utf8');
    const core = readFileSync(join(root, 'lib/rh/employeeBankAccountsApiCore.ts'), 'utf8');
    assert.match(client, /authFetch/);
    assert.doesNotMatch(client, /\.from\(['"]rh_employee_bank_accounts['"]\)/);
    assert.match(core, /\.from\(['"]rh_employee_bank_accounts['"]\)/);
    assert.match(core, /\.is\(['"]deleted_at['"], null\)/);
  });

  it('handler reutiliza auth/service_role e rewrite antecede catch-all', () => {
    const handler = readFileSync(join(root, 'api/rh-employee-bank-account.ts'), 'utf8');
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.match(handler, /authorizeRhApiRequest/);
    assert.match(handler, /createRhServiceRoleClient/);
    assert.equal(vercel.functions?.['api/rh-employee-bank-account.ts'], undefined);
    assert.ok(Object.keys(vercel.functions || {}).length <= 50);
    const specific = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/rh/employees/bank-account',
    );
    const catchAll = vercel.rewrites.findIndex(
      (rewrite: any) => rewrite.source === '/api/(.*)',
    );
    assert.ok(specific >= 0 && catchAll > specific);
  });
});
