import fs from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from './supabaseConfig';

export async function runRhMigrations(): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.warn('[RH Migration] Supabase admin indisponível — execute migrations/2026_07_07_rh_module.sql manualmente.');
    return;
  }

  const sqlPath = path.join(process.cwd(), 'migrations', '2026_07_07_rh_module.sql');
  if (!fs.existsSync(sqlPath)) return;

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  for (const statement of statements) {
    if (!statement) continue;
    try {
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql: statement + ';' });
      if (error) {
        const msg = String(error.message || error);
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          console.warn('[RH Migration] Aviso:', msg.slice(0, 120));
        }
      }
    } catch (e: any) {
      console.warn('[RH Migration] Falha parcial:', e?.message?.slice(0, 120));
    }
  }
  console.log('[RH Migration] Tabelas RH verificadas/criadas.');
}
