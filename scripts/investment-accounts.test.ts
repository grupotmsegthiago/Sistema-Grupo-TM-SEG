import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routesSrc = fs.readFileSync('server/routes.ts', 'utf8');
const componentSrc = fs.readFileSync('components/FinancialAccountManager.tsx', 'utf8');

test('rotas de contas de investimento existem no servidor', () => {
  assert.match(routesSrc, /app\.post\("\/api\/investment\/accounts"/);
  assert.match(routesSrc, /app\.patch\("\/api\/investment\/accounts\/:id"/);
  assert.match(routesSrc, /app\.delete\("\/api\/investment\/accounts\/:id"/);
  assert.match(routesSrc, /status: 'Inativo'/);
});

test('FinancialAccountManager usa API para CRUD de contas', () => {
  assert.match(componentSrc, /\/api\/investment\/accounts/);
  assert.match(componentSrc, /parseAmountBR\(formData\.initial_balance\)/);
  assert.doesNotMatch(componentSrc, /supabase\.from\('financial_accounts'\)\.update/);
  assert.doesNotMatch(componentSrc, /supabase\.from\('financial_accounts'\)\.delete/);
});
