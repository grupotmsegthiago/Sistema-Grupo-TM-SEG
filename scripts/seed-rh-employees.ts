#!/usr/bin/env npx tsx
/**
 * Importa funcionários TM SEG da planilha para o Supabase.
 * Requer SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY) no ambiente.
 *
 * Uso: npx tsx scripts/seed-rh-employees.ts
 */
import { createClient } from '@supabase/supabase-js';
import { seedTmsegEmployees } from '../lib/rh/seedTmsegEmployeesRunner';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ajhmmjuewdsukecaimik.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!key) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const sb = createClient(url, key);
const result = await seedTmsegEmployees(sb);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
