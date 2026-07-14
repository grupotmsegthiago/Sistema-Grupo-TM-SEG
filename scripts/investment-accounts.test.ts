import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routesSrc = fs.readFileSync('server/routes.ts', 'utf8');
const componentSrc = fs.readFileSync('components/FinancialAccountManager.tsx', 'utf8');
const vercelSrc = fs.readFileSync('vercel.json', 'utf8');
const createApi = fs.readFileSync('api/investment-accounts.ts', 'utf8');
const itemApi = fs.readFileSync('api/investment-accounts-item.ts', 'utf8');
const libSrc = fs.readFileSync('lib/investment/investmentAccountsApi.ts', 'utf8');

test('rotas de contas de investimento existem no servidor', () => {
  assert.match(routesSrc, /app\.post\("\/api\/investment\/accounts"/);
  assert.match(routesSrc, /app\.patch\("\/api\/investment\/accounts\/:id"/);
  assert.match(routesSrc, /app\.delete\("\/api\/investment\/accounts\/:id"/);
  assert.match(routesSrc, /status: 'Inativo'/);
});

test('FinancialAccountManager usa API para CRUD de contas', () => {
  assert.match(componentSrc, /\/api\/investment\/accounts/);
  assert.match(componentSrc, /parseAmountBR\(formData\.initial_balance\)/);
  assert.match(componentSrc, /from 'react'/);
  assert.doesNotMatch(componentSrc, /supabase\.from\('financial_accounts'\)\.update/);
  assert.doesNotMatch(componentSrc, /supabase\.from\('financial_accounts'\)\.delete/);
});

test('Vercel tem funções leves para CRUD de contas (não depende do Express)', () => {
  assert.match(vercelSrc, /"api\/investment-accounts\.ts"/);
  assert.match(vercelSrc, /"api\/investment-accounts-item\.ts"/);
  assert.match(vercelSrc, /\/api\/investment\/accounts\/:id/);
  assert.match(vercelSrc, /investment-accounts-item\?id=:id/);
  assert.match(createApi, /createInvestmentAccount/);
  assert.match(itemApi, /updateInvestmentAccount/);
  assert.match(itemApi, /deleteOrDeactivateInvestmentAccount/);
  assert.match(libSrc, /from\('financial_accounts'\)/);
  assert.match(libSrc, /status: 'Inativo'/);
});
