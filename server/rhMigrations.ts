import fs from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from './supabaseConfig';

// Migrations de RH aplicadas na inicialização (idempotentes). A ordem importa:
// o módulo base cria as tabelas; as seguintes evoluem o schema.
const RH_MIGRATION_FILES = [
  '2026_07_07_rh_module.sql',
  // Turno (shift_type), obrigatoriedade de ponto (requires_timeclock) e cadastro
  // facial. Sem esta migration, enrichUserWithCltData falha ao ler colunas
  // inexistentes e a obrigação de bater ponto deixa de funcionar.
  '2026_07_08_timeclock_shifts_faces.sql',
];

export async function runRhMigrations(): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.warn('[RH Migration] Supabase admin indisponível — execute as migrations de RH manualmente.');
    return;
  }

  for (const file of RH_MIGRATION_FILES) {
    const sqlPath = path.join(process.cwd(), 'migrations', file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[RH Migration] Arquivo não encontrado: ${file}`);
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
            console.warn(`[RH Migration] Aviso (${file}):`, msg.slice(0, 120));
          }
        }
      } catch (e: any) {
        console.warn(`[RH Migration] Falha parcial (${file}):`, e?.message?.slice(0, 120));
      }
    }
  }
  console.log('[RH Migration] Tabelas/colunas RH verificadas/criadas.');
}
