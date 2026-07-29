import fs from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from './supabaseConfig';

const GC_MIGRATION_FILES = ['2026_07_29_gestor_comercial.sql'];

export async function runGcMigrations(): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.warn('[GC Migration] Supabase admin indisponível — execute a migration do Gestor Comercial manualmente.');
    return;
  }

  for (const file of GC_MIGRATION_FILES) {
    const sqlPath = path.join(process.cwd(), 'migrations', file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[GC Migration] Arquivo não encontrado: ${file}`);
      continue;
    }

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
            console.warn(`[GC Migration] Aviso (${file}):`, msg.slice(0, 160));
          }
        }
      } catch (e: any) {
        console.warn(`[GC Migration] Falha parcial (${file}):`, e?.message?.slice(0, 160));
      }
    }
  }
  console.log('[GC Migration] Tabelas do Gestor Comercial verificadas/criadas.');
}
